#!/usr/bin/env python3
import argparse
import csv
import json
import math
import os
import signal
import sys
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import error as urllib_error
from urllib import request as urllib_request

try:
    from ibapi.client import EClient
    from ibapi.contract import Contract
    from ibapi.wrapper import EWrapper
except ImportError as exc:
    sys.stderr.write(
        'Missing Python dependency: ibapi. Install it before running the IBKR bridge.\n'
        'Suggested command: python3 -m pip install ibapi\n'
    )
    raise


@dataclass
class ContractEntry:
    source_symbol: str
    target_symbol: str
    contract: Dict[str, Any]

    @staticmethod
    def from_payload(payload: Dict[str, Any]) -> 'ContractEntry':
        source_symbol = payload.get('source_symbol', payload.get('sourceSymbol'))
        target_symbol = payload.get('target_symbol', payload.get('targetSymbol'))
        contract = payload.get('contract')
        if not isinstance(source_symbol, str) or not isinstance(target_symbol, str) or not isinstance(contract, dict):
            raise ValueError(f'Invalid contract payload: {payload}')
        return ContractEntry(
            source_symbol=source_symbol,
            target_symbol=target_symbol,
            contract=contract,
        )


@dataclass
class HistoricalBarRecord:
    symbol: str
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float] = None


@dataclass
class LiveSubscriptionState:
    req_id: int
    source_symbol: str
    target_symbol: str
    contract: Any
    partial_bar: Optional[HistoricalBarRecord] = None
    last_emitted_ts: Optional[str] = None
    resolved_contract_summary: Optional[str] = None
    buffered: List[HistoricalBarRecord] = field(default_factory=list)
    flush_batch_size: int = 25


class RequestState:
    def __init__(self) -> None:
        self.event = threading.Event()
        self.contract_details: List[Any] = []
        self.historical_bars: List[Any] = []
        self.error: Optional[str] = None


class IbkrApiApp(EWrapper, EClient):
    def __init__(self, log_prefix: str) -> None:
        EWrapper.__init__(self)
        EClient.__init__(self, self)
        self.log_prefix = log_prefix
        self.connected_event = threading.Event()
        self.disconnected_event = threading.Event()
        self.thread: Optional[threading.Thread] = None
        self._req_lock = threading.Lock()
        self._next_req_id = 1000
        self.requests: Dict[int, RequestState] = {}
        self.live_subscriptions: Dict[int, LiveSubscriptionState] = {}
        self.live_ingest_callback = None
        self.fatal_error: Optional[str] = None
        self.should_reconnect = False
        self.connection_ready = False
        self.market_data_ready = False
        self.historical_data_ready = False
        self.secdef_ready = False
        self.services_ready_event = threading.Event()

    def log(self, message: str) -> None:
        print(f'{self.log_prefix} {message}', flush=True)

    def next_req_id(self) -> int:
        with self._req_lock:
            req_id = self._next_req_id
            self._next_req_id += 1
            return req_id

    def start_network_loop(self) -> None:
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def wait_until_connected(self, timeout: float = 15.0) -> None:
        if not self.connected_event.wait(timeout):
            raise TimeoutError('Timed out waiting for IBKR connection handshake')
        if self.fatal_error and not self.connection_ready:
            raise RuntimeError(self.fatal_error)

    def disconnect_and_join(self) -> None:
        try:
            if self.isConnected():
                self.disconnect()
        finally:
            if self.thread and self.thread.is_alive():
                self.thread.join(timeout=5)

    def nextValidId(self, orderId: int) -> None:  # noqa: N802
        self.connection_ready = True
        with self._req_lock:
            self._next_req_id = max(self._next_req_id, orderId + 1)
        self.connected_event.set()
        self.log(f'Connected to IBKR (nextValidId={orderId})')

    def apiEnd(self) -> None:  # noqa: N802
        self.disconnected_event.set()
        if self.connection_ready:
            self.should_reconnect = True
            self.log('IBKR API connection ended; reconnect requested.')

    def connectionClosed(self) -> None:  # noqa: N802
        self.disconnected_event.set()
        if self.connection_ready:
            self.should_reconnect = True
            self.log('IBKR connection closed; reconnect requested.')
        self._set_service_status(market=False, historical=False, secdef=False)

    def error(self, reqId: int, errorCode: int, errorString: str, advancedOrderRejectJson: str = '') -> None:  # noqa: N802,E501
        message = f'IBKR error reqId={reqId} code={errorCode}: {errorString}'
        benign_codes = {2104, 2106, 2107, 2108, 2158, 2176}
        reconnect_codes = {1100, 1101, 1102, 1300, 2110, 504}

        self._update_service_status(errorCode)

        if errorCode in benign_codes:
            self.log(message)
            return

        if reqId in self.requests:
            state = self.requests[reqId]
            state.error = message
            state.event.set()

        if errorCode in reconnect_codes:
            self.should_reconnect = True
            self.fatal_error = message

        if errorCode == 502 and not self.connection_ready:
            self.fatal_error = message
            self.connected_event.set()

        self.log(message)

    def _set_service_status(
        self,
        *,
        market: Optional[bool] = None,
        historical: Optional[bool] = None,
        secdef: Optional[bool] = None,
    ) -> None:
        if market is not None:
            self.market_data_ready = market
        if historical is not None:
            self.historical_data_ready = historical
        if secdef is not None:
            self.secdef_ready = secdef
        if self.market_data_ready and self.historical_data_ready and self.secdef_ready:
            self.services_ready_event.set()
        else:
            self.services_ready_event.clear()

    def _update_service_status(self, error_code: int) -> None:
        if error_code in (2104, 2108):
            self._set_service_status(market=True)
            return
        if error_code == 2103:
            self._set_service_status(market=False)
            return
        if error_code in (2106, 2107):
            self._set_service_status(historical=True)
            return
        if error_code == 2105:
            self._set_service_status(historical=False)
            return
        if error_code == 2158:
            self._set_service_status(secdef=True)
            return
        if error_code == 2157:
            self._set_service_status(secdef=False)

    def services_status_summary(self) -> str:
        return (
            f'market={"ready" if self.market_data_ready else "waiting"} '
            f'historical={"ready" if self.historical_data_ready else "waiting"} '
            f'secdef={"ready" if self.secdef_ready else "waiting"}'
        )

    def wait_for_data_services(self, timeout: float = 90.0) -> None:
        if self.services_ready_event.wait(timeout):
            self.log(f'IBKR data services ready ({self.services_status_summary()}).')
            return
        raise TimeoutError(
            f'Timed out waiting for IBKR data services ({self.services_status_summary()})'
        )

    def contractDetails(self, reqId: int, contractDetails: Any) -> None:  # noqa: N802
        state = self.requests.get(reqId)
        if state:
            state.contract_details.append(contractDetails)

    def contractDetailsEnd(self, reqId: int) -> None:  # noqa: N802
        state = self.requests.get(reqId)
        if state:
            state.event.set()

    def historicalData(self, reqId: int, bar: Any) -> None:  # noqa: N802
        if reqId in self.live_subscriptions:
            self._process_live_bar(reqId, bar)
            return
        state = self.requests.get(reqId)
        if state:
            state.historical_bars.append(bar)

    def historicalDataEnd(self, reqId: int, start: str, end: str) -> None:  # noqa: N802
        if reqId in self.live_subscriptions:
            self._flush_live_buffer(reqId)
            return
        state = self.requests.get(reqId)
        if state:
            state.event.set()

    def historicalDataUpdate(self, reqId: int, bar: Any) -> None:  # noqa: N802
        if reqId in self.live_subscriptions:
            self._process_live_bar(reqId, bar)
            self._flush_live_buffer(reqId)

    def register_live_subscription(self, sub: LiveSubscriptionState) -> None:
        self.live_subscriptions[sub.req_id] = sub

    def _process_live_bar(self, req_id: int, bar: Any) -> None:
        sub = self.live_subscriptions.get(req_id)
        if sub is None:
            return
        record = normalize_ib_bar(sub.target_symbol, bar)
        if record is None:
            return
        if sub.partial_bar is None:
            sub.partial_bar = record
            return
        if record.timestamp == sub.partial_bar.timestamp:
            sub.partial_bar = record
            return
        if record.timestamp > sub.partial_bar.timestamp:
            if sub.partial_bar.timestamp != sub.last_emitted_ts:
                sub.buffered.append(sub.partial_bar)
                sub.last_emitted_ts = sub.partial_bar.timestamp
                if len(sub.buffered) >= sub.flush_batch_size:
                    self._flush_live_buffer(req_id)
            sub.partial_bar = record

    def _flush_live_buffer(self, req_id: int) -> None:
        sub = self.live_subscriptions.get(req_id)
        if sub is None or not sub.buffered or self.live_ingest_callback is None:
            return
        bars = list(sub.buffered)
        sub.buffered.clear()
        self.live_ingest_callback(bars)

    def request_contract_details(self, contract: Contract, timeout: float = 20.0) -> List[Any]:
        req_id = self.next_req_id()
        state = RequestState()
        self.requests[req_id] = state
        self.reqContractDetails(req_id, contract)
        if not state.event.wait(timeout):
            self.cancelContractDetails(req_id)
            self.requests.pop(req_id, None)
            raise TimeoutError(f'Timed out waiting for contract details for {contract.symbol}')
        self.requests.pop(req_id, None)
        if state.error and not state.contract_details:
            raise RuntimeError(state.error)
        return state.contract_details

    def request_historical_bars(
        self,
        contract: Contract,
        end_date_time: str,
        duration_str: str,
        bar_size_setting: str,
        what_to_show: str,
        use_rth: int,
        timeout: float = 60.0,
    ) -> List[Any]:
        req_id = self.next_req_id()
        state = RequestState()
        self.requests[req_id] = state
        self.reqHistoricalData(
            req_id,
            contract,
            end_date_time,
            duration_str,
            bar_size_setting,
            what_to_show,
            use_rth,
            2,
            False,
            [],
        )
        if not state.event.wait(timeout):
            self.cancelHistoricalData(req_id)
            self.requests.pop(req_id, None)
            raise TimeoutError(f'Timed out waiting for historical data for {contract.symbol}')
        self.requests.pop(req_id, None)
        if state.error and not state.historical_bars:
            raise RuntimeError(state.error)
        return state.historical_bars

    def subscribe_historical_keep_up_to_date(
        self,
        contract: Contract,
        duration_str: str,
        bar_size_setting: str,
        what_to_show: str,
        use_rth: int,
        source_symbol: str,
        target_symbol: str,
        flush_batch_size: int,
    ) -> LiveSubscriptionState:
        req_id = self.next_req_id()
        sub = LiveSubscriptionState(
            req_id=req_id,
            source_symbol=source_symbol,
            target_symbol=target_symbol,
            contract=contract,
            resolved_contract_summary=describe_contract(contract),
            flush_batch_size=max(1, flush_batch_size),
        )
        self.register_live_subscription(sub)
        self.reqHistoricalData(
            req_id,
            contract,
            '',
            duration_str,
            bar_size_setting,
            what_to_show,
            use_rth,
            2,
            True,
            [],
        )
        return sub


def parse_iso_to_utc(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith('Z'):
        normalized = normalized[:-1] + '+00:00'
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def format_ib_end_datetime(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime('%Y%m%d-%H:%M:%S')


def parse_bar_datetime(raw: Any) -> Optional[datetime]:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return datetime.fromtimestamp(float(raw), tz=timezone.utc)
    text = str(raw).strip()
    if not text:
        return None
    digits_only = text.isdigit()
    if digits_only and len(text) >= 10:
        return datetime.fromtimestamp(float(text[:10]), tz=timezone.utc)
    if digits_only and len(text) == 8:
        return datetime.strptime(text, '%Y%m%d').replace(tzinfo=timezone.utc)
    for fmt in ('%Y%m%d  %H:%M:%S', '%Y%m%d-%H:%M:%S', '%Y-%m-%d %H:%M:%S'):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        return parse_iso_to_utc(text)
    except Exception:
        return None


def normalize_ib_bar(target_symbol: str, bar: Any) -> Optional[HistoricalBarRecord]:
    dt = parse_bar_datetime(getattr(bar, 'date', None))
    if dt is None:
        return None
    open_value = float(getattr(bar, 'open', math.nan))
    high_value = float(getattr(bar, 'high', math.nan))
    low_value = float(getattr(bar, 'low', math.nan))
    close_value = float(getattr(bar, 'close', math.nan))
    if any(math.isnan(value) for value in (open_value, high_value, low_value, close_value)):
        return None
    volume_raw = getattr(bar, 'volume', None)
    volume = None
    if volume_raw not in (None, ''):
        try:
            volume = float(volume_raw)
        except Exception:
            volume = None
    return HistoricalBarRecord(
        symbol=target_symbol,
        timestamp=dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
        open=open_value,
        high=high_value,
        low=low_value,
        close=close_value,
        volume=volume,
    )


def describe_contract(contract: Contract) -> str:
    parts = [contract.secType, contract.symbol]
    local_symbol = getattr(contract, 'localSymbol', '') or ''
    expiry = getattr(contract, 'lastTradeDateOrContractMonth', '') or ''
    exchange = getattr(contract, 'exchange', '') or ''
    if local_symbol:
        parts.append(local_symbol)
    elif expiry:
        parts.append(expiry)
    if exchange:
        parts.append(exchange)
    return ' '.join(str(part) for part in parts if part)


def build_contract(spec: Dict[str, Any]) -> Contract:
    contract = Contract()
    contract.symbol = spec['symbol']
    contract.secType = spec.get('secType', 'FUT')
    contract.exchange = spec['exchange']
    contract.currency = spec['currency']
    if spec.get('multiplier'):
        contract.multiplier = str(spec['multiplier'])
    if spec.get('localSymbol'):
        contract.localSymbol = spec['localSymbol']
    if spec.get('lastTradeDateOrContractMonth'):
        contract.lastTradeDateOrContractMonth = spec['lastTradeDateOrContractMonth']
    if spec.get('includeExpired'):
        contract.includeExpired = True
    return contract


def resolve_live_contract(
    app: IbkrApiApp,
    entry: ContractEntry,
    *,
    retries: int = 6,
    retry_sleep_seconds: float = 10.0,
) -> Contract:
    base = build_contract(entry.contract)
    if getattr(base, 'conId', 0):
        return base
    if getattr(base, 'localSymbol', '') or getattr(base, 'lastTradeDateOrContractMonth', ''):
        return base

    last_error: Optional[Exception] = None
    for attempt in range(1, max(1, retries) + 1):
        try:
            details = app.request_contract_details(base)
            if not details:
                raise RuntimeError(f'No IBKR contracts returned for {entry.source_symbol}')

            today_token = datetime.now(timezone.utc).strftime('%Y%m')

            def expiry_token(detail: Any) -> str:
                raw = getattr(detail.contract, 'lastTradeDateOrContractMonth', '') or ''
                digits = ''.join(ch for ch in str(raw) if ch.isdigit())
                return digits[:8] if digits else '99999999'

            filtered = [detail for detail in details if expiry_token(detail)[:6] >= today_token]
            candidates = filtered or details
            candidates.sort(key=expiry_token)
            return candidates[0].contract
        except Exception as exc:
            last_error = exc
            if attempt >= max(1, retries):
                break
            app.log(
                f'Contract lookup retry {attempt}/{retries} for {entry.source_symbol} failed: {exc}. '
                f'Status: {app.services_status_summary()}. Waiting {retry_sleep_seconds:.1f}s.'
            )
            time.sleep(max(0.5, retry_sleep_seconds))

    raise RuntimeError(
        f'Could not resolve live contract for {entry.source_symbol}: {last_error}'
    )


def resolve_history_contract(entry: ContractEntry, continuous: bool) -> Contract:
    spec = dict(entry.contract)
    spec['secType'] = 'CONTFUT' if continuous else spec.get('secType', 'FUT')
    return build_contract(spec)


def post_training_bars(base_url: str, api_key: Optional[str], api_key_header: str, bars: List[HistoricalBarRecord]) -> None:
    if not bars:
        return
    payload = {
        'bars': [
            {
                'symbol': bar.symbol,
                'timestamp': bar.timestamp,
                'open': bar.open,
                'high': bar.high,
                'low': bar.low,
                'close': bar.close,
                'volume': bar.volume,
            }
            for bar in bars
        ]
    }
    data = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
    if api_key:
        headers[api_key_header] = api_key
    req = urllib_request.Request(
        f"{base_url.rstrip('/')}/training/ingest-bars", data=data, headers=headers, method='POST'
    )
    try:
        with urllib_request.urlopen(req, timeout=30) as response:
            response.read()
    except urllib_error.HTTPError as exc:
        body = exc.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'Training ingest HTTP {exc.code}: {body[:400]}') from exc


def post_json(url: str, payload: Dict[str, Any], api_key: Optional[str], api_key_header: str) -> None:
    data = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
    if api_key:
        headers[api_key_header] = api_key
    req = urllib_request.Request(url, data=data, headers=headers, method='POST')
    with urllib_request.urlopen(req, timeout=30) as response:
        response.read()


class LiveBridgeRunner:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.stop_event = threading.Event()
        self.app: Optional[IbkrApiApp] = None
        self.ingested_bars = 0
        self.ingest_calls = 0
        self.reconnect_attempts = 0
        self.last_ingest_at: Optional[str] = None
        self.flush_lock = threading.Lock()
        self.flush_buffer: List[HistoricalBarRecord] = []
        self.last_emitted_by_source: Dict[str, str] = {}
        self.contract_entries = [
            ContractEntry.from_payload(entry) for entry in json.loads(args.contracts_json)
        ]
        self.connected_notified = False
        self.login_required_notified = False
        self.symbol_last_ingest_monotonic: Dict[str, float] = {}
        self.connect_started_monotonic = time.monotonic()

    def log(self, message: str) -> None:
        print(f'{self.args.log_prefix} {message}', flush=True)

    def ingest_bars(self, bars: List[HistoricalBarRecord]) -> None:
        if not bars:
            return
        now_monotonic = time.monotonic()
        for bar in bars:
            self.last_emitted_by_source[bar.symbol] = bar.timestamp
            self.symbol_last_ingest_monotonic[bar.symbol] = now_monotonic
        with self.flush_lock:
            self.flush_buffer.extend(bars)
            if len(self.flush_buffer) < self.args.max_bars_per_ingest:
                return
            batch = list(self.flush_buffer)
            self.flush_buffer.clear()
        self._post_batch(batch)

    def flush_remaining(self) -> None:
        with self.flush_lock:
            if not self.flush_buffer:
                return
            batch = list(self.flush_buffer)
            self.flush_buffer.clear()
        self._post_batch(batch)

    def _post_batch(self, batch: List[HistoricalBarRecord]) -> None:
        post_training_bars(
            self.args.training_api_base_url,
            self.args.training_api_key,
            self.args.training_api_key_header,
            batch,
        )
        self.ingested_bars += len(batch)
        self.ingest_calls += 1
        self.last_ingest_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
        self.log(f'Forwarded {len(batch)} bars to training API.')
        self.notify_connected_once()

    def notify_connected_once(self) -> None:
        if self.connected_notified or not self.args.notify_connected_url:
            return
        symbols = [entry.target_symbol for entry in self.contract_entries]
        try:
            post_json(
                self.args.notify_connected_url,
                {
                    'source': 'ibkr-bridge',
                    'symbols': symbols,
                    'connectedAt': datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
                },
                self.args.notify_connected_api_key,
                self.args.notify_connected_api_key_header,
            )
            self.connected_notified = True
            self.login_required_notified = False
            self.log(f'Posted IBKR connected notification for {",".join(symbols)}.')
        except Exception as exc:
            self.log(f'Failed to post IBKR connected notification: {exc}')

    def notify_login_required_once(self, reason: str) -> None:
        if self.login_required_notified or not self.args.notify_login_required_url:
            return
        symbols = [entry.target_symbol for entry in self.contract_entries]
        try:
            post_json(
                self.args.notify_login_required_url,
                {
                    'source': 'ibkr-bridge',
                    'symbols': symbols,
                    'reason': reason,
                    'detectedAt': datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
                },
                self.args.notify_login_required_api_key,
                self.args.notify_login_required_api_key_header,
            )
            self.login_required_notified = True
            self.connected_notified = False
            self.log(f'Posted IBKR login-required notification for {",".join(symbols)}.')
        except Exception as exc:
            self.log(f'Failed to post IBKR login-required notification: {exc}')

    def poll_recent_bars(self) -> None:
        if self.app is None:
            return

        now_monotonic = time.monotonic()
        for entry in self.contract_entries:
            idle_seconds = now_monotonic - self.symbol_last_ingest_monotonic.get(
                entry.target_symbol,
                self.connect_started_monotonic,
            )
            if idle_seconds < self.args.poll_gap_seconds:
                continue

            subscription = next(
                (
                    sub
                    for sub in self.app.live_subscriptions.values()
                    if sub.target_symbol == entry.target_symbol
                ),
                None,
            )
            if subscription is None:
                continue

            try:
                bars = self.app.request_historical_bars(
                    subscription.contract,
                    '',
                    self.args.poll_backfill_duration,
                    self.args.bar_size,
                    self.args.what_to_show,
                    1 if self.args.use_rth else 0,
                    timeout=45.0,
                )
                normalized = [
                    record
                    for record in (
                        normalize_ib_bar(entry.target_symbol, bar)
                        for bar in bars
                    )
                    if record is not None
                ]
                normalized.sort(key=lambda bar: bar.timestamp)
                if normalized:
                    normalized = normalized[:-1]

                last_seen = self.last_emitted_by_source.get(entry.target_symbol)
                fresh = [
                    bar
                    for bar in normalized
                    if last_seen is None or bar.timestamp > last_seen
                ]
                if fresh:
                    self.ingest_bars(fresh)
                    self.flush_remaining()
                    self.log(
                        f'Polled {len(fresh)} catch-up bars for {entry.target_symbol} after {int(idle_seconds)}s without live updates.'
                    )
            except Exception as exc:
                self.log(f'Catch-up poll failed for {entry.target_symbol}: {exc}')

    def run(self) -> None:
        signal.signal(signal.SIGINT, lambda *_: self.stop_event.set())
        signal.signal(signal.SIGTERM, lambda *_: self.stop_event.set())
        backoff_ms = self.args.reconnect_min_ms

        while not self.stop_event.is_set():
            self.app = IbkrApiApp(self.args.log_prefix)
            self.app.live_ingest_callback = self.ingest_bars
            try:
                self.log(
                    f'Connecting to IBKR host={self.args.host} port={self.args.port} clientId={self.args.client_id}'
                )
                self.connect_started_monotonic = time.monotonic()
                self.symbol_last_ingest_monotonic = {}
                self.app.connect(self.args.host, self.args.port, self.args.client_id)
                self.app.start_network_loop()
                self.app.wait_until_connected(timeout=20)
                try:
                    self.app.wait_for_data_services(timeout=self.args.startup_ready_timeout_seconds)
                except TimeoutError as exc:
                    self.log(f'{exc}. Continuing with contract resolution retries.')

                for entry in self.contract_entries:
                    contract = resolve_live_contract(
                        self.app,
                        entry,
                        retries=self.args.contract_lookup_retries,
                        retry_sleep_seconds=self.args.contract_lookup_retry_sleep_seconds,
                    )
                    sub = self.app.subscribe_historical_keep_up_to_date(
                        contract,
                        self.args.initial_duration,
                        self.args.bar_size,
                        self.args.what_to_show,
                        1 if self.args.use_rth else 0,
                        entry.source_symbol,
                        entry.target_symbol,
                        self.args.max_bars_per_ingest,
                    )
                    self.log(
                        f'Subscribed {entry.source_symbol}->{entry.target_symbol} using {sub.resolved_contract_summary}'
                    )

                self.notify_connected_once()
                backoff_ms = self.args.reconnect_min_ms
                last_status = time.monotonic()
                while not self.stop_event.is_set() and not self.app.should_reconnect:
                    time.sleep(1)
                    if time.monotonic() - last_status >= self.args.status_seconds:
                        last_status = time.monotonic()
                        symbols = ','.join(entry.source_symbol for entry in self.contract_entries)
                        self.log(
                            f'status ingest_calls={self.ingest_calls} ingested_bars={self.ingested_bars} symbols={symbols}'
                        )
                        self.poll_recent_bars()
                self.flush_remaining()
                self.app.disconnect_and_join()
                if self.stop_event.is_set():
                    break
                reason = self.app.fatal_error or 'IBKR connection closed; reconnecting.'
                self.reconnect_attempts += 1
                self.log(f'{reason} Retrying in {backoff_ms}ms before asking for user action.')
                time.sleep(backoff_ms / 1000)
                backoff_ms = min(self.args.reconnect_max_ms, backoff_ms * 2)
            except Exception as exc:
                self.flush_remaining()
                if self.app is not None:
                    self.app.disconnect_and_join()
                self.reconnect_attempts += 1
                self.notify_login_required_once(str(exc))
                self.log(f'Bridge error: {exc}. Retrying in {backoff_ms}ms.')
                time.sleep(backoff_ms / 1000)
                backoff_ms = min(self.args.reconnect_max_ms, backoff_ms * 2)


def chunk_plan(start: datetime, end: datetime, bar_size: str) -> List[Dict[str, Any]]:
    normalized = bar_size.strip().lower()
    if normalized == '1 min':
        chunk_span = timedelta(days=1)
        duration = '1 D'
    elif normalized == '5 mins':
        chunk_span = timedelta(days=5)
        duration = '5 D'
    elif normalized == '15 mins':
        chunk_span = timedelta(days=10)
        duration = '10 D'
    elif normalized == '1 hour':
        chunk_span = timedelta(days=30)
        duration = '30 D'
    elif normalized == '1 day':
        chunk_span = timedelta(days=365)
        duration = '1 Y'
    elif normalized == '1 week':
        chunk_span = timedelta(days=3650)
        duration = '10 Y'
    else:
        chunk_span = timedelta(days=1)
        duration = '1 D'

    ranges: List[Dict[str, Any]] = []
    cursor = start
    while cursor < end:
        chunk_end = min(cursor + chunk_span, end)
        ranges.append({'start': cursor, 'end': chunk_end, 'duration': duration})
        cursor = chunk_end
    return ranges


def write_csv(output_path: Path, bars: List[HistoricalBarRecord]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.writer(handle)
        writer.writerow(['timestamp', 'symbol', 'open', 'high', 'low', 'close', 'volume'])
        for bar in bars:
            writer.writerow(
                [
                    bar.timestamp,
                    bar.symbol,
                    f'{bar.open:.10f}'.rstrip('0').rstrip('.'),
                    f'{bar.high:.10f}'.rstrip('0').rstrip('.'),
                    f'{bar.low:.10f}'.rstrip('0').rstrip('.'),
                    f'{bar.close:.10f}'.rstrip('0').rstrip('.'),
                    '' if bar.volume is None else f'{bar.volume:.10f}'.rstrip('0').rstrip('.'),
                ]
            )


def run_fetch_history(args: argparse.Namespace) -> None:
    app = IbkrApiApp(args.log_prefix)
    contract_entries = [ContractEntry.from_payload(entry) for entry in json.loads(args.contracts_json)]
    start = parse_iso_to_utc(args.start)
    end = parse_iso_to_utc(args.end)
    pacing_sleep = max(0.0, args.pacing_sleep_seconds)
    signal.signal(signal.SIGINT, lambda *_: sys.exit(130))
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))

    try:
        app.connect(args.host, args.port, args.client_id)
        app.start_network_loop()
        app.wait_until_connected(timeout=20)
        for entry in contract_entries:
            contract = resolve_history_contract(entry, args.continuous)
            bars_by_ts: Dict[str, HistoricalBarRecord] = {}
            plans = chunk_plan(start, end, args.bar_size)
            for idx, plan in enumerate(plans, start=1):
                request_end = '' if args.continuous else format_ib_end_datetime(plan['end'])
                app.log(
                    f"Fetching {entry.source_symbol}->{entry.target_symbol} chunk {idx}/{len(plans)} end={request_end} duration={plan['duration']}"
                )
                raw_bars = app.request_historical_bars(
                    contract,
                    request_end,
                    plan['duration'],
                    args.bar_size,
                    args.what_to_show,
                    1 if args.use_rth else 0,
                    timeout=max(60.0, args.request_timeout_seconds),
                )
                for raw_bar in raw_bars:
                    normalized = normalize_ib_bar(entry.target_symbol, raw_bar)
                    if normalized is None:
                        continue
                    ts = parse_iso_to_utc(normalized.timestamp)
                    if ts < plan['start'] or ts > end:
                        continue
                    bars_by_ts[normalized.timestamp] = normalized
                if pacing_sleep > 0 and idx < len(plans):
                    time.sleep(pacing_sleep)
            ordered = sorted(bars_by_ts.values(), key=lambda bar: bar.timestamp)
            start_tag = start.strftime('%Y%m%dT%H%M%SZ')
            end_tag = end.strftime('%Y%m%dT%H%M%SZ')
            interval_tag = args.bar_size.replace(' ', '').lower()
            file_name = f'ibkr_{entry.source_symbol.lower()}_{interval_tag}_{start_tag}_{end_tag}.csv'
            output_path = Path(args.output_dir) / file_name
            write_csv(output_path, ordered)
            app.log(f'Wrote {len(ordered)} bars to {output_path}')
    finally:
        app.disconnect_and_join()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='IBKR TWS / IB Gateway bridge utilities')
    subparsers = parser.add_subparsers(dest='command', required=True)

    live = subparsers.add_parser('live-bridge', help='Run live 1-minute bridge via historical keepUpToDate')
    live.add_argument('--host', required=True)
    live.add_argument('--port', required=True, type=int)
    live.add_argument('--client-id', required=True, type=int)
    live.add_argument('--contracts-json', required=True)
    live.add_argument('--training-api-base-url', required=True)
    live.add_argument('--training-api-key')
    live.add_argument('--training-api-key-header', default='x-api-key')
    live.add_argument('--notify-connected-url')
    live.add_argument('--notify-connected-api-key')
    live.add_argument('--notify-connected-api-key-header', default='x-api-key')
    live.add_argument('--notify-login-required-url')
    live.add_argument('--notify-login-required-api-key')
    live.add_argument('--notify-login-required-api-key-header', default='x-api-key')
    live.add_argument('--initial-duration', default='1800 S')
    live.add_argument('--bar-size', default='1 min')
    live.add_argument('--what-to-show', default='TRADES')
    live.add_argument('--use-rth', action='store_true')
    live.add_argument('--max-bars-per-ingest', type=int, default=400)
    live.add_argument('--status-seconds', type=int, default=60)
    live.add_argument('--reconnect-min-ms', type=int, default=1000)
    live.add_argument('--reconnect-max-ms', type=int, default=60000)
    live.add_argument('--startup-ready-timeout-seconds', type=float, default=90.0)
    live.add_argument('--contract-lookup-retries', type=int, default=6)
    live.add_argument('--contract-lookup-retry-sleep-seconds', type=float, default=10.0)
    live.add_argument('--poll-gap-seconds', type=int, default=120)
    live.add_argument('--poll-backfill-duration', default='1800 S')
    live.add_argument('--log-prefix', default='[ibkr-bridge]')

    fetch_history = subparsers.add_parser('fetch-history', help='Fetch historical IBKR futures bars to CSV')
    fetch_history.add_argument('--host', required=True)
    fetch_history.add_argument('--port', required=True, type=int)
    fetch_history.add_argument('--client-id', required=True, type=int)
    fetch_history.add_argument('--contracts-json', required=True)
    fetch_history.add_argument('--start', required=True)
    fetch_history.add_argument('--end', required=True)
    fetch_history.add_argument('--bar-size', default='1 min')
    fetch_history.add_argument('--what-to-show', default='TRADES')
    fetch_history.add_argument('--use-rth', action='store_true')
    fetch_history.add_argument('--continuous', action='store_true')
    fetch_history.add_argument('--output-dir', required=True)
    fetch_history.add_argument('--pacing-sleep-seconds', type=float, default=11.0)
    fetch_history.add_argument('--request-timeout-seconds', type=float, default=90.0)
    fetch_history.add_argument('--log-prefix', default='[ibkr-history]')

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.command == 'live-bridge':
        runner = LiveBridgeRunner(args)
        runner.run()
        return
    if args.command == 'fetch-history':
        run_fetch_history(args)
        return
    parser.error(f'Unsupported command: {args.command}')


if __name__ == '__main__':
    main()
