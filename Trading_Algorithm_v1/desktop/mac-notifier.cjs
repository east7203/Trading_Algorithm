#!/usr/bin/env node

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const API_BASE = (process.env.TRADING_MAC_NOTIFIER_API_BASE || 'https://167-172-252-171.sslip.io').replace(/\/$/, '');
const OPEN_URL = process.env.TRADING_MAC_NOTIFIER_OPEN_URL || `${API_BASE}/mobile/`;
const POLL_MS = Math.max(Number.parseInt(process.env.TRADING_MAC_NOTIFIER_POLL_MS || '30000', 10) || 30000, 5000);
const STATE_DIR =
  process.env.TRADING_MAC_NOTIFIER_STATE_DIR ||
  path.join(os.homedir(), 'Library', 'Application Support', 'TradingAlgo');
const STATE_FILE = path.join(STATE_DIR, 'mac-notifier-state.json');
const MAX_SEEN_IDS = 300;
const RUN_ONCE = process.argv.includes('--once');

let inFlight = false;

const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const escapeAppleScript = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

const notify = (title, body, subtitle = '') =>
  new Promise((resolve) => {
    const script = subtitle.length
      ? `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}" subtitle "${escapeAppleScript(subtitle)}" sound name "Glass"`
      : `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}" sound name "Glass"`;

    const child = spawn('/usr/bin/osascript', ['-e', script], {
      stdio: 'ignore'
    });
    child.on('error', () => resolve(false));
    child.on('exit', () => resolve(true));
  });

const ensureStateDir = async () => {
  await fs.mkdir(STATE_DIR, { recursive: true });
};

const readState = async () => {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      primed: parsed.primed === true,
      seenAlertIds: Array.isArray(parsed.seenAlertIds)
        ? parsed.seenAlertIds.filter((value) => typeof value === 'string').slice(-MAX_SEEN_IDS)
        : [],
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : undefined
    };
  } catch {
    return {
      primed: false,
      seenAlertIds: [],
      lastSyncAt: undefined
    };
  }
};

const writeState = async (state) => {
  await ensureStateDir();
  await fs.writeFile(
    STATE_FILE,
    JSON.stringify(
      {
        ...state,
        seenAlertIds: state.seenAlertIds.slice(-MAX_SEEN_IDS)
      },
      null,
      2
    )
  );
};

const fetchAlerts = async () => {
  const response = await fetch(`${API_BASE}/signals/alerts?limit=30`, {
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`alert poll failed with HTTP ${response.status}`);
  }

  const body = await response.json();
  return Array.isArray(body.alerts) ? body.alerts : [];
};

const buildNotificationBody = (alert) => {
  const reminderLabel =
    Number.isFinite(alert?.reviewState?.escalationCount) && alert.reviewState.escalationCount > 0
      ? `Reminder ${alert.reviewState.escalationCount}`
      : null;
  const parts = [
    reminderLabel,
    alert.setupType || 'Unknown setup',
    typeof alert?.candidate?.finalScore === 'number' ? `Score ${alert.candidate.finalScore.toFixed(1)}` : null,
    alert?.riskDecision?.allowed ? 'Ready to review' : alert?.riskDecision?.reasonCodes?.[0] || 'Risk blocked'
  ].filter(Boolean);

  return parts.join(' • ');
};

const pollOnce = async () => {
  if (inFlight) {
    return;
  }

  inFlight = true;
  try {
    const alerts = await fetchAlerts();
    const state = await readState();
    const fingerprintFor = (alert) =>
      `${alert.alertId}:${Number.isFinite(alert?.reviewState?.escalationCount) ? alert.reviewState.escalationCount : 0}`;
    const currentIds = alerts.map(fingerprintFor).filter((value) => typeof value === 'string');

    if (!state.primed) {
      await writeState({
        primed: true,
        seenAlertIds: currentIds,
        lastSyncAt: new Date().toISOString()
      });
      log(`Primed notifier with ${currentIds.length} existing alerts`);
      return;
    }

    const seen = new Set(state.seenAlertIds);
    const unseen = alerts
      .filter((alert) => !seen.has(fingerprintFor(alert)))
      .sort((a, b) => new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime());

    for (const alert of unseen) {
      const reminderLabel =
        Number.isFinite(alert?.reviewState?.escalationCount) && alert.reviewState.escalationCount > 0
          ? `Reminder ${alert.reviewState.escalationCount}: `
          : '';
      const title = `${reminderLabel}${alert.title || `${alert.symbol || 'Market'} signal`}`;
      const body = buildNotificationBody(alert);
      const subtitle = `${OPEN_URL}?tab=signals&alertId=${encodeURIComponent(alert.alertId)}`;
      await notify(title, body, subtitle);
      log(`Notified ${alert.alertId} (${title})`);
      seen.add(fingerprintFor(alert));
    }

    for (const alertId of currentIds) {
      seen.add(alertId);
    }

    await writeState({
      primed: true,
      seenAlertIds: [...seen],
      lastSyncAt: new Date().toISOString()
    });
  } catch (error) {
    log(`Poll error: ${error.message}`);
  } finally {
    inFlight = false;
  }
};

const main = async () => {
  await ensureStateDir();
  log(`Starting macOS notifier against ${API_BASE}`);
  await pollOnce();

  if (RUN_ONCE) {
    return;
  }

  setInterval(() => {
    void pollOnce();
  }, POLL_MS);
};

process.on('uncaughtException', (error) => {
  log(`uncaughtException: ${error.message}`);
});

process.on('unhandledRejection', (error) => {
  log(`unhandledRejection: ${error instanceof Error ? error.message : String(error)}`);
});

void main();
