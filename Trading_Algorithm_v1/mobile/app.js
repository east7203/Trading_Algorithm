const API_BASE_KEY = 'trading_mobile_api_base';
const APPROVER_KEY = 'trading_mobile_approver';
const CHECKLIST_KEY = 'trading_mobile_manual_checklist';
const UI_PREFS_KEY = 'trading_mobile_ui_prefs_v1';
const NOTIFICATION_PREFS_KEY = 'trading_mobile_notification_prefs_v1';
const SEEN_ALERT_IDS_KEY = 'trading_mobile_seen_alert_ids_v1';
const NATIVE_PUSH_TOKEN_KEY = 'trading_mobile_native_push_token_v1';

const defaultUiPrefs = {
  theme: 'ocean',
  density: 'cozy',
  textScale: 100,
  reduceMotion: false
};

const defaultNotificationPrefs = {
  enabled: true
};

const apiBaseInput = document.getElementById('apiBase');
const saveApiBaseBtn = document.getElementById('saveApiBase');
const statusEl = document.getElementById('status');
const pullRefreshEl = document.getElementById('pullRefresh');
const pullRefreshLabelEl = document.getElementById('pullRefreshLabel');
const pullRefreshMetaEl = document.getElementById('pullRefreshMeta');
const liveBadgeEl = document.getElementById('liveBadge');
const lastSyncChipEl = document.getElementById('lastSyncChip');
const refreshAllBtn = document.getElementById('refreshAll');
const heroFocusEl = document.getElementById('heroFocus');
const heroSublineEl = document.getElementById('heroSubline');
const heroFeedBadgeEl = document.getElementById('heroFeedBadge');
const heroPushBadgeEl = document.getElementById('heroPushBadge');
const heroWindowEl = document.getElementById('heroWindow');
const heroStackEl = document.getElementById('heroStack');
const heroLastAlertEl = document.getElementById('heroLastAlert');
const approvedByInput = document.getElementById('approvedBy');
const manualChecklistConfirmInput = document.getElementById('manualChecklistConfirm');
const alertsListEl = document.getElementById('alertsList');
const pendingListEl = document.getElementById('pendingList');
const tradesListEl = document.getElementById('tradesList');
const reviewsPendingListEl = document.getElementById('reviewsPendingList');
const reviewsCompletedListEl = document.getElementById('reviewsCompletedList');
const signalTemplate = document.getElementById('signalItemTemplate');
const pendingTemplate = document.getElementById('pendingItemTemplate');
const tradeTemplate = document.getElementById('tradeItemTemplate');
const reviewTemplate = document.getElementById('reviewItemTemplate');
const signalCountEl = document.getElementById('signalCount');
const pendingCountEl = document.getElementById('pendingCount');
const sentCountEl = document.getElementById('sentCount');
const openRiskCountEl = document.getElementById('openRiskCount');
const topSetupStatEl = document.getElementById('topSetupStat');
const signalFilterSummaryEl = document.getElementById('signalFilterSummary');
const signalLeadIdeaEl = document.getElementById('signalLeadIdea');
const signalLeadWhyEl = document.getElementById('signalLeadWhy');
const signalReadyBlockedEl = document.getElementById('signalReadyBlocked');
const signalLeadSymbolEl = document.getElementById('signalLeadSymbol');
const signalQueueSummaryEl = document.getElementById('signalQueueSummary');
const reviewPendingStatEl = document.getElementById('reviewPendingStat');
const reviewSummaryChipEl = document.getElementById('reviewSummaryChip');
const reviewPendingQueueChipEl = document.getElementById('reviewPendingQueueChip');
const reviewCompletedQueueChipEl = document.getElementById('reviewCompletedQueueChip');
const sessionSummaryChipEl = document.getElementById('sessionSummaryChip');
const sessionSummaryHeadlineEl = document.getElementById('sessionSummaryHeadline');
const sessionSummaryContextEl = document.getElementById('sessionSummaryContext');
const sessionSummaryStrongestEl = document.getElementById('sessionSummaryStrongest');
const sessionSummaryWeakestEl = document.getElementById('sessionSummaryWeakest');
const sessionSummaryTomorrowEl = document.getElementById('sessionSummaryTomorrow');
const sessionSummaryFeedbackEl = document.getElementById('sessionSummaryFeedback');
const reviewSetupEdgeEl = document.getElementById('reviewSetupEdge');
const reviewTimeEdgeEl = document.getElementById('reviewTimeEdge');
const reviewScoreEdgeEl = document.getElementById('reviewScoreEdge');
const reviewBlockedVsReadyEl = document.getElementById('reviewBlockedVsReady');
const setupMixEl = document.getElementById('setupMix');
const guardrailSummaryEl = document.getElementById('guardrailSummary');
const journalSummaryEl = document.getElementById('journalSummary');

const themePresetEl = document.getElementById('themePreset');
const densityPresetEl = document.getElementById('densityPreset');
const textScaleEl = document.getElementById('textScale');
const reduceMotionEl = document.getElementById('reduceMotion');
const notificationToggleEl = document.getElementById('notificationToggle');
const sendTestAppAlertEl = document.getElementById('sendTestAppAlert');
const resetUiPrefsEl = document.getElementById('resetUiPrefs');
const applyMorningPresetEl = document.getElementById('applyMorningPreset');
const signalMinScoreEl = document.getElementById('signalMinScore');
const signalAPlusMinScoreEl = document.getElementById('signalAPlusMinScore');
const signalSessionStartEl = document.getElementById('signalSessionStart');
const signalSessionEndEl = document.getElementById('signalSessionEnd');
const signalNyRangeMinutesEl = document.getElementById('signalNyRangeMinutes');
const signalRequireRangeEl = document.getElementById('signalRequireRange');
const signalAPlusOnlyEl = document.getElementById('signalAPlusOnly');
const symbolNqToggleEl = document.getElementById('symbolNqToggle');
const symbolEsToggleEl = document.getElementById('symbolEsToggle');
const setupSweepMssToggleEl = document.getElementById('setupSweepMssToggle');
const setupSweepRevToggleEl = document.getElementById('setupSweepRevToggle');
const setupObToggleEl = document.getElementById('setupObToggle');
const setupBreakRetestToggleEl = document.getElementById('setupBreakRetestToggle');
const setupWerleinToggleEl = document.getElementById('setupWerleinToggle');
const saveSignalSettingsEl = document.getElementById('saveSignalSettings');
const diagLiveFeedEl = document.getElementById('diagLiveFeed');
const diagLastBarEl = document.getElementById('diagLastBar');
const diagModelEl = document.getElementById('diagModel');
const diagSubscribersEl = document.getElementById('diagSubscribers');
const diagSignalMonitorEl = document.getElementById('diagSignalMonitor');
const diagLastAlertEl = document.getElementById('diagLastAlert');
const diagCalendarSourceEl = document.getElementById('diagCalendarSource');
const diagCalendarCoverageEl = document.getElementById('diagCalendarCoverage');
const diagCalendarNextEl = document.getElementById('diagCalendarNext');
const calendarEventsListEl = document.getElementById('calendarEventsList');
const diagTrainingCadenceEl = document.getElementById('diagTrainingCadence');
const diagTrainingLastRunEl = document.getElementById('diagTrainingLastRun');
const diagTrainingActiveModelEl = document.getElementById('diagTrainingActiveModel');
const diagTrainingNextWindowEl = document.getElementById('diagTrainingNextWindow');
const diagTrainingPromotionEl = document.getElementById('diagTrainingPromotion');
const diagLearningFeedbackEl = document.getElementById('diagLearningFeedback');
const diagLearningSetupEl = document.getElementById('diagLearningSetup');
const diagLearningFrameEl = document.getElementById('diagLearningFrame');
const diagTrainingFramesEl = document.getElementById('diagTrainingFrames');
const diagTrainingTriggerEl = document.getElementById('diagTrainingTrigger');
const ibkrRecoveryPanelEl = document.getElementById('ibkrRecoveryPanel');
const diagQuietModeEl = document.getElementById('diagQuietMode');
const diagQuietModeHintEl = document.getElementById('diagQuietModeHint');
const diagIbkrRecoveryStateEl = document.getElementById('diagIbkrRecoveryState');
const diagIbkrRecoveryHintEl = document.getElementById('diagIbkrRecoveryHint');
const ibkrRetryLoginEl = document.getElementById('ibkrRetryLogin');
const ibkrResendPushEl = document.getElementById('ibkrResendPush');
const ibkrWebsiteFallbackEl = document.getElementById('ibkrWebsiteFallback');
const ibkrRecoveryTimelineEl = document.getElementById('ibkrRecoveryTimeline');
const systemOverviewEl = document.getElementById('systemOverview');
const apiBaseSummaryEl = document.getElementById('apiBaseSummary');
const sysGlanceFeedEl = document.getElementById('sysGlanceFeed');
const sysGlanceModelEl = document.getElementById('sysGlanceModel');
const sysGlanceTrainingEl = document.getElementById('sysGlanceTraining');
const sysGlanceAlertsEl = document.getElementById('sysGlanceAlerts');
const statusSegmentServerEl = document.getElementById('statusSegmentServer');
const statusSegmentFeedEl = document.getElementById('statusSegmentFeed');
const statusSegmentMonitorEl = document.getElementById('statusSegmentMonitor');
const statusSegmentTrainingEl = document.getElementById('statusSegmentTraining');
const statusSegmentAlertsEl = document.getElementById('statusSegmentAlerts');
const statusSegmentModelEl = document.getElementById('statusSegmentModel');
const quickActionButtons = [...document.querySelectorAll('.quick-action')];
const signalStatusFilterButtons = [...document.querySelectorAll('[data-status-filter]')];
const signalSymbolFilterButtons = [...document.querySelectorAll('[data-symbol-filter]')];
const chartLightboxEl = document.getElementById('chartLightbox');
const chartLightboxBackdropEl = document.getElementById('chartLightboxBackdrop');
const chartLightboxSheetEl = document.getElementById('chartLightboxSheet');
const chartLightboxFrameEl = document.getElementById('chartLightboxFrame');
const chartLightboxTitleEl = document.getElementById('chartLightboxTitle');
const chartLightboxMetaEl = document.getElementById('chartLightboxMeta');
const chartLightboxCloseEl = document.getElementById('chartLightboxClose');

const tabButtons = [...document.querySelectorAll('.tab-btn')];
const views = {
  signals: document.getElementById('view-signals'),
  pending: document.getElementById('view-pending'),
  trades: document.getElementById('view-trades'),
  reviews: document.getElementById('view-reviews'),
  settings: document.getElementById('view-settings'),
  status: document.getElementById('view-status')
};

let latestAlerts = [];
let latestPending = [];
let latestTrades = [];
let latestEvents = [];
let latestReviews = [];
let latestDiagnostics = null;
let latestRiskConfig = null;
let latestHealth = null;
let lastSyncAt = null;
let serviceWorkerRegistrationPromise = null;
let nativePushListenersBound = false;
let nativePushServerReady = false;
let reviewSummary = {
  pending: 0,
  completed: 0,
  total: 0
};
let signalSettings = null;
let signalFilters = {
  status: 'ALL',
  symbol: 'ALL'
};
let refreshInFlight = null;
let serviceWorkerReloading = false;
let activeRouteAlertId = null;
let focusedAlertId = null;
let localNotificationListenersBound = false;
let pullRefreshFrame = 0;
let chartLightboxListenersBound = false;

const pullRefreshGesture = {
  active: false,
  refreshing: false,
  startX: 0,
  startY: 0,
  distance: 0
};

const PULL_REFRESH_TRIGGER_PX = 72;
const PULL_REFRESH_MAX_PX = 112;
const PULL_REFRESH_SETTLE_PX = 40;
const CHART_LIGHTBOX_DISMISS_PX = 120;
const chartLightboxGesture = {
  active: false,
  startY: 0,
  offsetY: 0
};

const setupToggleMap = {
  LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION: setupSweepMssToggleEl,
  LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES: setupSweepRevToggleEl,
  DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION: setupObToggleEl,
  NY_BREAK_RETEST_MOMENTUM: setupBreakRetestToggleEl,
  WERLEIN_FOREVER_MODEL: setupWerleinToggleEl
};

const fallbackApiBase = window.location.origin;
const defaultIbkrWebsiteUrl = 'https://www.interactivebrokers.com/en/general/qr-code-ibkr-mobile-routing.php';

const setupLabels = {
  LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION: 'Sweep -> MSS -> FVG',
  LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES: 'Sweep Reversal Extremes',
  DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION: 'Displacement + OB Retest',
  NY_BREAK_RETEST_MOMENTUM: 'NY Break & Retest',
  WERLEIN_FOREVER_MODEL: 'Werlein Forever Model'
};

const reviewValidityLabels = {
  VALID: 'Valid',
  INVALID: 'Invalid',
  UNSURE: 'Unsure'
};

const reviewOutcomeLabels = {
  WOULD_WIN: 'Would Win',
  WOULD_LOSE: 'Would Lose',
  BREAKEVEN: 'Breakeven',
  MISSED: 'Missed',
  SKIPPED: 'Skipped'
};

const setupLabel = (code) => setupLabels[code] ?? code;
const reviewValidityLabel = (code) => reviewValidityLabels[code] ?? code ?? '--';
const reviewOutcomeLabel = (code) => reviewOutcomeLabels[code] ?? code ?? '--';

const signalBiasLabel = (alert) => {
  const regimeScore = Number(alert?.candidate?.metadata?.regimeScore);
  if (!Number.isFinite(regimeScore)) {
    return 'Mixed';
  }
  if (regimeScore >= 0.15) {
    return alert.side === 'LONG' ? 'Aligned' : 'Counter';
  }
  if (regimeScore <= -0.15) {
    return alert.side === 'SHORT' ? 'Aligned' : 'Counter';
  }
  return 'Mixed';
};

const signalEvidenceTags = (alert) => {
  const metadata = alert.candidate?.metadata ?? {};
  const tags = [];

  if (typeof metadata.sweptLevel === 'number') {
    tags.push(`Sweep ${fmtNum(metadata.sweptLevel, 2)}`);
  }
  if (typeof metadata.mssBreakReference === 'number') {
    tags.push(`MSS ${fmtNum(metadata.mssBreakReference, 2)}`);
  }
  if (typeof metadata.fvgGapLow === 'number' && typeof metadata.fvgGapHigh === 'number') {
    tags.push(`FVG ${fmtNum(metadata.fvgGapLow, 2)}-${fmtNum(metadata.fvgGapHigh, 2)}`);
  }
  if (typeof metadata.orderBlockLevel === 'number') {
    tags.push(`OB ${fmtNum(metadata.orderBlockLevel, 2)}`);
  }
  if (typeof metadata.brokenRangeLevel === 'number') {
    tags.push(`Range ${fmtNum(metadata.brokenRangeLevel, 2)}`);
  }
  if (typeof metadata.regimeScore === 'number') {
    tags.push(`Regime ${metadata.regimeScore >= 0.15 ? 'Bull' : metadata.regimeScore <= -0.15 ? 'Bear' : 'Mixed'}`);
  }

  return tags.slice(0, 4);
};

const humanizeRiskReason = (code) => {
  const friendly = {
    CRITICAL_MACRO_EVENT_WINDOW_BLOCK: 'a critical macro event window is active',
    HIGH_IMPACT_MACRO_WINDOW_BLOCK: 'a high-impact macro event window is active',
    HIGH_IMPACT_USD_NEWS_WINDOW_BLOCK: 'a high-impact U.S. news window is active',
    MEDIUM_IMPACT_USD_NEWS_WINDOW_BLOCK: 'a medium-impact U.S. news window is active',
    HIGH_IMPACT_NEWS_WINDOW: 'the news blackout is active',
    TRADING_WINDOW_CLOSED: 'it is outside your morning window',
    OUTSIDE_ALLOWED_TRADING_WINDOW: 'it is outside your morning window',
    DAILY_LOSS_CAP_REACHED: 'the daily loss brake is active',
    SESSION_LOSS_CAP_REACHED: 'the session loss brake is active',
    MAX_CONSECUTIVE_LOSSES_REACHED: 'the consecutive-loss brake is active',
    SPREAD_GUARD_ACTIVE: 'the spread guard is active',
    SPREAD_GUARD_TRIGGERED: 'the spread guard is active',
    SLIPPAGE_GUARD_ACTIVE: 'the slippage guard is active',
    SLIPPAGE_GUARD_TRIGGERED: 'the slippage guard is active',
    POLICY_CONFIRMATION_REQUIRED: 'policy confirmation is still required',
    POLICY_GUARD_BLOCKED: 'policy guard is blocking entries',
    KILL_SWITCH_ACTIVE: 'the kill switch is on',
    INVALID_STOP_DISTANCE: 'the stop distance is invalid'
  };

  if (friendly[code]) {
    return friendly[code];
  }

  return code
    .toLowerCase()
    .split('_')
    .join(' ');
};

const summarizeSignalSetup = (alert) => {
  const setup = setupLabel(alert.setupType);
  if (alert.riskDecision.allowed) {
    return `${alert.symbol} is showing a ${setup} and it has passed the current rule checks.`;
  }
  return `${alert.symbol} is shaping a ${setup}, but it is still blocked by one or more guardrails.`;
};

const summarizeSignalNextStep = (alert) => {
  if (alert.reviewState?.acknowledgedAt) {
    return 'You already acknowledged this idea. Use the chart to review whether the setup was actually clean.';
  }

  if (alert.riskDecision.allowed) {
    return 'Check the chart, confirm the levels, and decide whether you want to act manually in Tradovate.';
  }

  const primaryReason = alert.riskDecision.reasonCodes?.[0];
  return primaryReason
    ? `Wait for now. Do not enter until ${humanizeRiskReason(primaryReason)}.`
    : 'Wait for now and review the chart only.';
};

const formatTimeValue = (hour, minute) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

const parseTimeValue = (value) => {
  const [hour, minute] = value.split(':').map((part) => Number(part));
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0
  };
};

const recommendedMorningPreset = () => ({
  sessionStartHour: 8,
  sessionStartMinute: 30,
  sessionEndHour: 10,
  sessionEndMinute: 30,
  nyRangeMinutes: 60,
  minFinalScore: 74,
  aPlusOnlyAfterFirstHour: true,
  aPlusMinScore: 82,
  requireOpeningRangeComplete: true
});

const parseRouteState = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    tab: params.get('tab') || null,
    alertId: params.get('alertId') || null,
    focus: params.get('focus') || null
  };
};

const updateRouteState = ({ tab, alertId, focus }) => {
  const next = new URL(window.location.href);
  if (tab) {
    next.searchParams.set('tab', tab);
  } else {
    next.searchParams.delete('tab');
  }

  if (alertId) {
    next.searchParams.set('alertId', alertId);
  } else {
    next.searchParams.delete('alertId');
  }

  if (focus) {
    next.searchParams.set('focus', focus);
  } else {
    next.searchParams.delete('focus');
  }

  window.history.replaceState({}, '', next.toString());
};

const routeToSignalAlert = (alertId, tab = 'signals') => {
  activeRouteAlertId = alertId || null;
  focusedAlertId = alertId || null;
  if (tab === 'signals') {
    signalFilters.status = 'ALL';
    signalFilters.symbol = 'ALL';
    updateSegmentedControls();
  }
  updateRouteState({
    tab,
    alertId
  });
};

const alertNotificationFingerprint = (alert) =>
  `${alert.alertId}:${Number.isFinite(alert?.reviewState?.escalationCount) ? alert.reviewState.escalationCount : 0}`;

const describeApiBase = (value) => {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') {
      return 'Secure cloud desk server';
    }
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return 'Local desk server';
    }
    return 'Custom desk server';
  } catch {
    return 'Custom desk server';
  }
};

const describeDeskRules = (config) => {
  if (!config) {
    return 'Loading morning rules';
  }

  const timeWindow = `${formatTimeValue(config.sessionStartHour, config.sessionStartMinute)}-${formatTimeValue(config.sessionEndHour, config.sessionEndMinute)} ET`;
  const setupCount = (config.enabledSetups ?? []).length;
  const aPlusMode = config.aPlusOnlyAfterFirstHour ? 'A+ after hour 1' : 'Normal scoring all morning';
  return `${timeWindow} • ${setupCount} setups • ${aPlusMode}`;
};

const updateSystemSummary = () => {
  const diagnostics = latestDiagnostics?.diagnostics ?? null;
  const alertsEnabled = getNotificationPrefs().enabled;
  const feedState = getFeedStateMeta(diagnostics);
  const connection = diagnostics
    ? `${feedState.summary}. ${feedState.detail}`
    : 'Checking desk connection.';
  const rules = signalSettings
    ? `Morning window ${formatTimeValue(signalSettings.sessionStartHour, signalSettings.sessionStartMinute)}-${formatTimeValue(signalSettings.sessionEndHour, signalSettings.sessionEndMinute)} ET.`
    : 'Morning rules are loading.';
  const alerts = alertsEnabled
    ? diagnostics?.notifications?.telegramReady
      ? 'Phone alerts, Mac alerts, and Telegram backup are armed.'
      : 'Phone alerts and Mac alerts are armed.'
    : 'Phone alerts are currently off on this device.';
  const learning = diagnostics?.training?.enabled
    ? `Learning is running every ${diagnostics.training.cadence?.retrainIntervalMinutes ?? '--'} minutes.`
    : 'Learning is currently paused.';
  const calendar = diagnostics?.calendar?.sourceName
    ? `Macro calendar source: ${diagnostics.calendar.sourceName}.`
    : 'Macro calendar source is not configured.';

  systemOverviewEl.textContent = `${connection} ${rules} ${alerts} ${learning} ${calendar}`;
  apiBaseSummaryEl.textContent = describeApiBase(getApiBase());
};

const setStatusSegment = (element, tone, text) => {
  if (!element) {
    return;
  }
  element.dataset.tone = tone;
  const valueEl = element.querySelector('.status-segment-value');
  if (valueEl) {
    valueEl.textContent = text;
  }
};

const setRecoveryState = (tone, text, hint) => {
  if (diagIbkrRecoveryStateEl) {
    diagIbkrRecoveryStateEl.dataset.tone = tone;
    diagIbkrRecoveryStateEl.textContent = text;
  }
  if (diagIbkrRecoveryHintEl) {
    diagIbkrRecoveryHintEl.textContent = hint;
  }
  if (ibkrRecoveryPanelEl) {
    ibkrRecoveryPanelEl.dataset.tone = tone;
  }
};

const getFeedStateMeta = (diagnostics) => {
  if (!diagnostics) {
    return {
      tone: 'warn',
      segment: 'Checking',
      summary: 'Checking feed status',
      detail: 'Waiting for the latest desk diagnostics.'
    };
  }

  const recovery = diagnostics.ibkrRecovery ?? null;
  const ibkrSessionConnected = Boolean(recovery?.lastConnectedAt) && !recovery?.pendingReconnect;
  const lastBarText = diagnostics.latestBarTimestamp
    ? `Last bar ${fmtRelativeMinutes(diagnostics.latestBarTimestamp)}.`
    : 'No confirmed bar yet.';

  if (recovery?.pendingReconnect) {
    return {
      tone: 'bad',
      segment: 'Reauth',
      summary: 'Reauthentication needed',
      detail: recovery.lastLoginRequiredAt
        ? `Gateway auth was requested ${fmtRelativeMinutes(recovery.lastLoginRequiredAt)}.`
        : 'The IBKR bridge is waiting for a fresh login.'
    };
  }

  if (ibkrSessionConnected) {
    if (diagnostics.liveFeedStatus === 'LIVE') {
      return {
        tone: 'good',
        segment: 'Live',
        summary: 'IBKR connected and updating',
        detail: lastBarText
      };
    }

    if (diagnostics.liveFeedStatus === 'FROZEN') {
      return {
        tone: 'bad',
        segment: 'Frozen',
        summary: 'IBKR connected but quotes are frozen',
        detail: diagnostics.latestBarTimestamp
          ? `${lastBarText} The timestamps are recent, but prices are not moving normally. Treat this as invalid market data.`
          : 'The session is connected, but the quote stream appears frozen.'
      };
    }

    if (diagnostics.liveFeedStatus === 'DELAYED') {
      return {
        tone: 'warn',
        segment: 'Delayed',
        summary: 'IBKR connected but delayed',
        detail: diagnostics.latestBarTimestamp
          ? `${lastBarText} The session is up, but market data is lagging. Check IBKR market-data subscriptions and API access.`
          : 'The session is up, but market data is lagging. Check IBKR market-data subscriptions and API access.'
      };
    }

    if (diagnostics.liveFeedStatus === 'WAITING') {
      return {
        tone: 'warn',
        segment: 'Warming',
        summary: 'IBKR connected and waiting',
        detail: 'The session is authenticated and waiting for the first confirmed bar.'
      };
    }

    if (diagnostics.liveFeedStatus === 'AFTER_HOURS') {
      return {
        tone: 'warn',
        segment: 'After Hours',
        summary: 'IBKR connected after hours',
        detail: diagnostics.latestBarTimestamp
          ? `${lastBarText} The market is likely idle or closed, not disconnected.`
          : recovery?.lastConnectedAt
            ? `Gateway auth was confirmed ${fmtRelativeMinutes(recovery.lastConnectedAt)}. The market is likely idle or closed.`
            : 'The market is likely idle or closed, not disconnected.'
      };
    }

    return {
      tone: 'bad',
      segment: 'Stalled',
      summary: 'IBKR connected but stalled',
      detail: diagnostics.latestBarTimestamp
        ? `${lastBarText} This is beyond normal delay. Use the recovery controls below.`
        : 'The bridge is connected, but no confirmed bars are coming through.'
    };
  }

  if (diagnostics.liveFeedStatus === 'LIVE') {
    return {
      tone: 'good',
      segment: 'Live',
      summary: 'Feed updating',
      detail: lastBarText
    };
  }

  if (diagnostics.liveFeedStatus === 'FROZEN') {
    return {
      tone: 'bad',
      segment: 'Frozen',
      summary: 'Quotes look frozen',
      detail: diagnostics.latestBarTimestamp
        ? `${lastBarText} Prices are repeating without real movement. Do not trust this feed yet.`
        : 'Prices are repeating without real movement. Do not trust this feed yet.'
    };
  }

  if (diagnostics.liveFeedStatus === 'WAITING') {
    return {
      tone: 'warn',
      segment: 'Waiting',
      summary: 'Waiting for first bar',
      detail: 'The desk is up and waiting for IBKR to publish the first bar.'
    };
  }

  if (diagnostics.liveFeedStatus === 'DELAYED') {
    return {
      tone: 'warn',
      segment: 'Delayed',
      summary: 'Market data delayed',
      detail: diagnostics.latestBarTimestamp
        ? `${lastBarText} The feed is behind live market time. Check IBKR market-data subscriptions and API access.`
        : 'The feed is behind live market time. Check IBKR market-data subscriptions and API access.'
    };
  }

  if (diagnostics.liveFeedStatus === 'AFTER_HOURS') {
    return {
      tone: 'warn',
      segment: 'After Hours',
      summary: 'Market closed or idle',
      detail: diagnostics.latestBarTimestamp
        ? `${lastBarText} The desk is connected, but the CME session is not actively trading.`
        : 'The desk is connected, but the CME session is not actively trading.'
    };
  }

  if (diagnostics.liveFeedStatus === 'STALE') {
    return {
      tone: 'bad',
      segment: 'Stalled',
      summary: 'No recent bars confirmed',
      detail: diagnostics.latestBarTimestamp
        ? `${lastBarText} If you expected live market data, use the recovery controls below.`
        : 'If you expected live market data, use the recovery controls below.'
    };
  }

  return {
    tone: 'bad',
    segment: 'Offline',
    summary: 'Feed offline',
    detail: 'The desk connection needs attention.'
  };
};

const parseTimeZoneClock = (isoTimestamp, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date(isoTimestamp));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return hour * 60 + minute;
};

const isWithinRiskWindow = (nowIso, riskConfig) => {
  const window = riskConfig?.tradingWindow;
  if (!window?.enabled) {
    return true;
  }

  const nowMinutes = parseTimeZoneClock(nowIso, window.timezone);
  if (nowMinutes === null) {
    return false;
  }

  const startMinutes = window.startHour * 60 + window.startMinute;
  const endMinutes = window.endHour * 60 + window.endMinute;
  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }

  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
};

const renderQuietModeState = () => {
  if (!diagQuietModeEl) {
    return;
  }

  const riskConfig = latestRiskConfig?.config ?? null;
  const window = riskConfig?.tradingWindow ?? null;
  if (!window) {
    diagQuietModeEl.dataset.tone = 'warn';
    diagQuietModeEl.textContent = 'Quiet mode --';
    if (diagQuietModeHintEl) {
      diagQuietModeHintEl.textContent = 'Quiet mode follows the trading window once risk config loads.';
    }
    return;
  }

  const insideWindow = isWithinRiskWindow(new Date().toISOString(), riskConfig);
  const tzLabel = window.timezone === 'America/New_York' ? 'ET' : window.timezone;
  const startText = formatTimeValue(window.startHour, window.startMinute);
  const endText = formatTimeValue(window.endHour, window.endMinute);

  diagQuietModeEl.dataset.tone = insideWindow ? 'good' : 'warn';
  diagQuietModeEl.textContent = insideWindow ? 'Quiet mode off' : 'Quiet mode on';
  if (diagQuietModeHintEl) {
    diagQuietModeHintEl.textContent = insideWindow
      ? `Recovery alerts stay normal during the ${startText}-${endText} ${tzLabel} window.`
      : `Outside the ${startText}-${endText} ${tzLabel} window, recovery alerts stay quiet unless you trigger them manually.`;
  }
};

const recoveryEventTitle = (kind) => {
  const map = {
    LOGIN_REQUIRED: 'Login required',
    RECOVERY_REQUESTED: 'Recovery request received',
    RECOVERY_ATTEMPT: 'Server recovery started',
    REMINDER: 'Recovery retry sent',
    CONNECTED: 'IBKR connected',
    FALLBACK_ACTIVATED: 'Yahoo fallback activated'
  };
  return map[kind] ?? kind;
};

const compactRecoveryReason = (value, maxLength = 220) => {
  if (!value) {
    return '';
  }

  const normalized = String(value).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

const getRecoveryAttemptReason = (attempt) => {
  if (!attempt) {
    return '';
  }

  if (attempt.skipped) {
    if (attempt.reason === 'cooldown') {
      return 'login retry is cooling down to avoid duplicate submissions';
    }
    if (attempt.reason === 'disabled') {
      return 'server auto-login is disabled';
    }
  }

  return compactRecoveryReason(attempt.stderr || attempt.stdout || attempt.reason);
};

const getLatestRecoveryDetail = (recovery) => {
  const latestEntry = Array.isArray(recovery?.history) ? recovery.history[0] : null;
  return compactRecoveryReason(latestEntry?.detail);
};

const isGatewayConnectionIssue = (detail) =>
  /code=502|couldn't connect to tws|socket port|code=1100|connectivity between ibkr and trader workstation has been lost/i.test(
    detail || ''
  );

const renderRecoveryTimeline = (recovery) => {
  if (!ibkrRecoveryTimelineEl) {
    return;
  }

  ibkrRecoveryTimelineEl.innerHTML = '';
  const history = Array.isArray(recovery?.history) ? recovery.history.slice(0, 6) : [];

  if (!history.length) {
    const empty = document.createElement('p');
    empty.className = 'recovery-timeline-empty';
    empty.textContent = 'No reconnect history yet. The next disconnect or reconnect will show up here.';
    ibkrRecoveryTimelineEl.appendChild(empty);
    return;
  }

  history.forEach((entry) => {
    const item = document.createElement('article');
    item.className = 'recovery-event';
    item.dataset.kind = entry.kind;

    const heading = document.createElement('div');
    heading.className = 'recovery-event-head';

    const title = document.createElement('p');
    title.className = 'recovery-event-title';
    title.textContent = recoveryEventTitle(entry.kind);

    const time = document.createElement('p');
    time.className = 'recovery-event-time';
    time.textContent = `${fmtDateTimeCompact(entry.at)} • ${fmtRelativeMinutes(entry.at)}`;

    heading.append(title, time);
    item.appendChild(heading);

    const metaParts = [];
    if (Array.isArray(entry.symbols) && entry.symbols.length) {
      metaParts.push(entry.symbols.join(', '));
    }
    if (entry.source) {
      metaParts.push(entry.source);
    }
    if (metaParts.length) {
      const meta = document.createElement('p');
      meta.className = 'recovery-event-meta';
      meta.textContent = metaParts.join(' • ');
      item.appendChild(meta);
    }

    if (entry.detail) {
      const detail = document.createElement('p');
      detail.className = 'recovery-event-detail';
      detail.textContent = entry.detail;
      item.appendChild(detail);
    }

    ibkrRecoveryTimelineEl.appendChild(item);
  });
};

const renderStatusRail = () => {
  const diagnostics = latestDiagnostics?.diagnostics ?? null;
  const training = diagnostics?.training ?? null;
  const notifications = diagnostics?.notifications ?? null;
  const recovery = diagnostics?.ibkrRecovery ?? null;
  const feedState = getFeedStateMeta(diagnostics);

  setStatusSegment(
    statusSegmentServerEl,
    latestHealth?.ok === true ? 'good' : latestHealth?.ok === false ? 'bad' : 'warn',
    latestHealth?.ok === true ? 'Online' : latestHealth?.ok === false ? 'Offline' : 'Checking'
  );
  setStatusSegment(
    statusSegmentFeedEl,
    feedState.tone,
    feedState.segment
  );
  setStatusSegment(
    statusSegmentMonitorEl,
    diagnostics?.signalMonitor?.started ? 'good' : 'bad',
    diagnostics?.signalMonitor?.started ? 'Watching' : 'Off'
  );
  setStatusSegment(
    statusSegmentTrainingEl,
    training?.enabled ? (training.trainingInProgress ? 'good' : 'warn') : 'bad',
    training?.enabled ? (training.trainingInProgress ? 'Running' : 'Armed') : 'Paused'
  );
  setStatusSegment(
    statusSegmentAlertsEl,
    getNotificationPrefs().enabled && notifications?.telegramReady
      ? 'good'
      : getNotificationPrefs().enabled || notifications?.telegramReady
        ? 'warn'
        : 'bad',
    getNotificationPrefs().enabled && notifications?.telegramReady
      ? 'Armed'
      : getNotificationPrefs().enabled || notifications?.telegramReady
        ? 'Partial'
        : 'Off'
  );
  setStatusSegment(
    statusSegmentModelEl,
    diagnostics?.rankingModel?.modelId ? 'good' : 'bad',
    diagnostics?.rankingModel?.modelId ? 'Loaded' : 'Missing'
  );

  if (!diagnostics) {
    setRecoveryState('warn', 'Checking', 'Waiting for the current IBKR recovery state.');
    renderRecoveryTimeline(null);
    return;
  }

  if (recovery?.pendingReconnect) {
    const lastAttemptText = recovery.lastLoginRequiredAt
      ? `Login required ${fmtRelativeMinutes(recovery.lastLoginRequiredAt)}.`
      : 'The bridge is waiting for reauthentication.';
    const latestDetail = getLatestRecoveryDetail(recovery);
    const latestDetailText = latestDetail
      ? isGatewayConnectionIssue(latestDetail)
        ? ` Latest server note: ${latestDetail} This looks like an IB Gateway/API connection issue, so the phone recovery buttons may not work until Gateway is back on the login or second-factor screen.`
        : ` Latest server note: ${latestDetail}`
      : '';
    setRecoveryState(
      'bad',
      'Reauth Needed',
      `${lastAttemptText}${latestDetailText} Tap Run Full Recovery first. If the official IBKR phone alert still does not arrive after a few seconds, tap Run Broker Fallback. Only use Last-Resort Website if the broker prompt never shows up.`
    );
    renderRecoveryTimeline(recovery);
    return;
  }
  if (recovery?.lastConnectedAt) {
    const apiTone = feedState.tone === 'bad' ? 'warn' : feedState.tone;
    const connectedText = `Gateway auth was confirmed ${fmtRelativeMinutes(recovery.lastConnectedAt)}.`;
    setRecoveryState(
      apiTone,
      'IBKR API Connected',
      `${connectedText} ${feedState.detail}`
    );
    renderRecoveryTimeline(recovery);
    return;
  }

  setRecoveryState(feedState.tone, feedState.summary, feedState.detail);
  renderRecoveryTimeline(recovery);
};

const renderSignalSettings = (config) => {
  if (!config) {
    return;
  }

  signalSettings = { ...config };
  signalMinScoreEl.value = String(config.minFinalScore ?? 72);
  signalAPlusMinScoreEl.value = String(config.aPlusMinScore ?? 82);
  signalSessionStartEl.value = formatTimeValue(config.sessionStartHour, config.sessionStartMinute);
  signalSessionEndEl.value = formatTimeValue(config.sessionEndHour, config.sessionEndMinute);
  signalNyRangeMinutesEl.value = String(config.nyRangeMinutes ?? 60);
  signalRequireRangeEl.checked = Boolean(config.requireOpeningRangeComplete);
  signalAPlusOnlyEl.checked = Boolean(config.aPlusOnlyAfterFirstHour);
  symbolNqToggleEl.checked = (config.enabledSymbols ?? []).includes('NQ');
  symbolEsToggleEl.checked = (config.enabledSymbols ?? []).includes('ES');

  Object.entries(setupToggleMap).forEach(([setup, toggle]) => {
    toggle.checked = (config.enabledSetups ?? []).includes(setup);
  });

  updateSystemSummary();
};

const selectedSetups = () =>
  Object.entries(setupToggleMap)
    .filter(([, toggle]) => toggle.checked)
    .map(([setup]) => setup);

const currentSignalSettingsPayload = () => {
  const sessionStart = parseTimeValue(signalSessionStartEl.value || '08:30');
  const sessionEnd = parseTimeValue(signalSessionEndEl.value || '11:30');

  return {
    minFinalScore: Number(signalMinScoreEl.value),
    aPlusMinScore: Number(signalAPlusMinScoreEl.value),
    sessionStartHour: sessionStart.hour,
    sessionStartMinute: sessionStart.minute,
    sessionEndHour: sessionEnd.hour,
    sessionEndMinute: sessionEnd.minute,
    nyRangeMinutes: Number(signalNyRangeMinutesEl.value),
    requireOpeningRangeComplete: signalRequireRangeEl.checked,
    aPlusOnlyAfterFirstHour: signalAPlusOnlyEl.checked,
    enabledSymbols: [symbolNqToggleEl.checked ? 'NQ' : null, symbolEsToggleEl.checked ? 'ES' : null].filter(Boolean),
    enabledSetups: selectedSetups()
  };
};

const getApiBase = () => {
  const saved = localStorage.getItem(API_BASE_KEY);
  return saved && saved.length > 0 ? saved : fallbackApiBase;
};

const setApiBase = (value) => {
  localStorage.setItem(API_BASE_KEY, value.replace(/\/$/, ''));
};

const getUiPrefs = () => {
  const raw = localStorage.getItem(UI_PREFS_KEY);
  if (!raw) {
    return { ...defaultUiPrefs };
  }

  try {
    const parsed = JSON.parse(raw);
    const theme = ['ocean', 'ember', 'graphite'].includes(parsed.theme) ? parsed.theme : defaultUiPrefs.theme;
    const density = ['cozy', 'compact'].includes(parsed.density) ? parsed.density : defaultUiPrefs.density;
    const textScale =
      typeof parsed.textScale === 'number' && parsed.textScale >= 90 && parsed.textScale <= 120
        ? parsed.textScale
        : defaultUiPrefs.textScale;
    const reduceMotion = Boolean(parsed.reduceMotion);

    return {
      theme,
      density,
      textScale,
      reduceMotion
    };
  } catch {
    return { ...defaultUiPrefs };
  }
};

const saveUiPrefs = (prefs) => {
  localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
};

const getNotificationPrefs = () => {
  const raw = localStorage.getItem(NOTIFICATION_PREFS_KEY);
  if (!raw) {
    return { ...defaultNotificationPrefs };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false
    };
  } catch {
    return { ...defaultNotificationPrefs };
  }
};

const saveNotificationPrefs = (prefs) => {
  localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
};

const getSeenAlertIds = () => {
  const raw = localStorage.getItem(SEEN_ALERT_IDS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
  } catch {
    return [];
  }
};

const saveSeenAlertIds = (ids) => {
  localStorage.setItem(SEEN_ALERT_IDS_KEY, JSON.stringify(ids.slice(-200)));
};

const applyUiPrefs = (prefs) => {
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.dataset.density = prefs.density;
  document.documentElement.style.setProperty('--text-scale', String((prefs.textScale / 100).toFixed(2)));
  document.documentElement.classList.toggle('reduce-motion', prefs.reduceMotion);

  themePresetEl.value = prefs.theme;
  densityPresetEl.value = prefs.density;
  textScaleEl.value = String(prefs.textScale);
  reduceMotionEl.checked = prefs.reduceMotion;
};

const setStatus = (text, isError = false) => {
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#ff9e9f' : '#9fb4cb';
  liveBadgeEl.textContent = isError ? 'Offline' : 'Online';
  liveBadgeEl.classList.toggle('chip-offline', isError);
  liveBadgeEl.classList.toggle('chip-online', !isError);
};

const currentScrollTop = () =>
  Math.max(window.scrollY, document.scrollingElement?.scrollTop ?? 0, document.documentElement.scrollTop, 0);

const pullRefreshMetaText = (label = 'Live desk sync') => (lastSyncAt ? `${label} • ${fmtTime(lastSyncAt)}` : label);

const setPullRefreshDistance = (distance) => {
  const nextDistance = `${Math.max(0, distance)}px`;
  const raf = globalThis.requestAnimationFrame;
  const caf = globalThis.cancelAnimationFrame;

  if (!raf || !caf) {
    document.documentElement.style.setProperty('--pull-distance', nextDistance);
    return;
  }

  if (pullRefreshFrame) {
    caf(pullRefreshFrame);
  }
  pullRefreshFrame = raf(() => {
    document.documentElement.style.setProperty('--pull-distance', nextDistance);
    pullRefreshFrame = 0;
  });
};

const resetPullRefreshUi = () => {
  pullRefreshGesture.distance = 0;
  document.body.classList.remove('is-pulling', 'is-refreshing');
  pullRefreshEl?.classList.remove('is-active', 'is-armed', 'is-refreshing');
  setPullRefreshDistance(0);
  if (pullRefreshLabelEl) {
    pullRefreshLabelEl.textContent = 'Pull to refresh';
  }
  if (pullRefreshMetaEl) {
    pullRefreshMetaEl.textContent = pullRefreshMetaText();
  }
};

const updatePullRefreshUi = (distance) => {
  if (!pullRefreshEl || !pullRefreshLabelEl || !pullRefreshMetaEl) {
    return;
  }

  const armed = distance >= PULL_REFRESH_TRIGGER_PX;
  document.body.classList.add('is-pulling');
  pullRefreshEl.classList.add('is-active');
  pullRefreshEl.classList.toggle('is-armed', armed);
  pullRefreshLabelEl.textContent = armed ? 'Release to sync' : 'Pull to refresh';
  pullRefreshMetaEl.textContent = armed ? 'Refresh live desk now' : pullRefreshMetaText();
  setPullRefreshDistance(distance);
};

const easedPullDistance = (deltaY) => {
  if (deltaY <= 72) {
    return Math.min(PULL_REFRESH_MAX_PX, deltaY * 0.38);
  }

  const base = 28 + (deltaY - 72) * 0.13;
  return Math.min(PULL_REFRESH_MAX_PX, base);
};

const isInteractivePullTarget = (target) =>
  target instanceof Element &&
  target.closest('button, input, textarea, select, label, a, [role="button"], .tabbar, .segmented-control');

const fmtDateTime = (value) => {
  if (!value) {
    return '--';
  }
  return new Date(value).toLocaleString();
};

const fmtTime = (value) => {
  if (!value) {
    return '--';
  }
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const fmtDateTimeCompact = (value) => {
  if (!value) {
    return '--';
  }
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const fmtRelativeMinutes = (value) => {
  if (!value) {
    return '--';
  }

  const diffMs = Date.now() - Date.parse(value);
  if (!Number.isFinite(diffMs)) {
    return '--';
  }

  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffMinutes === 1) {
    return '1 min ago';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours === 1) {
    return '1 hr ago';
  }
  return `${diffHours} hr ago`;
};

const fmtNum = (value, decimals = 2) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

const formatSetupMix = (trades) => {
  if (!trades.length) {
    return '--';
  }

  const counts = new Map();
  for (const trade of trades) {
    const label = setupLabel(trade.setupType);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  return ranked.map(([label, count]) => `${label} (${count})`).join(' • ');
};

const computeTopSetup = (trades) => {
  const approved = trades.filter((trade) => trade.status === 'APPROVED');
  if (!approved.length) {
    return '--';
  }

  const counts = new Map();
  for (const trade of approved) {
    counts.set(trade.setupType, (counts.get(trade.setupType) ?? 0) + 1);
  }
  const [winner] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return setupLabel(winner[0]);
};

const countGuardrails = (events) => {
  const counts = new Map();

  for (const event of events) {
    if (event.type !== 'RISK_CHECKED' || !event.payload || !Array.isArray(event.payload.reasonCodes)) {
      continue;
    }

    for (const reason of event.payload.reasonCodes) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }

  if (!counts.size) {
    return 'No recent guardrail hits';
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, count]) => `${code} (${count})`)
    .join(' • ');
};

const reviewPerformanceSummary = (reviews) => {
  const diagnosticsSummary = latestDiagnostics?.diagnostics?.learningPerformance;
  if (diagnosticsSummary?.resolvedReviews > 0) {
    const setup = diagnosticsSummary.bySetup?.[0];
    const timeBucket = diagnosticsSummary.byTimeBucket?.[0];
    const scoreBucket = diagnosticsSummary.byScoreBucket?.[0];
    const ready = diagnosticsSummary.blockedVsReady?.readyResolved ?? 0;
    const blocked = diagnosticsSummary.blockedVsReady?.blockedResolved ?? 0;

    return {
      bySetup: setup ? `${setup.label} ${Math.round(setup.winRate * 100)}% (${setup.wins}/${setup.total})` : 'Need more resolved reviews',
      byTime: timeBucket
        ? `${timeBucket.label} ${Math.round(timeBucket.winRate * 100)}% (${timeBucket.wins}/${timeBucket.total})`
        : 'Need more resolved reviews',
      byScore: scoreBucket
        ? `${scoreBucket.label} ${Math.round(scoreBucket.winRate * 100)}% (${scoreBucket.wins}/${scoreBucket.total})`
        : 'Need more resolved reviews',
      blockedVsReady: `Ready ${ready} • Blocked ${blocked}`
    };
  }

  const resolved = reviews.filter((review) => {
    const effectiveOutcome =
      review.effectiveOutcome ??
      review.alertSnapshot?.reviewState?.effectiveOutcome ??
      review.outcome ??
      review.autoOutcome;
    return effectiveOutcome === 'WOULD_WIN' || effectiveOutcome === 'WOULD_LOSE';
  });
  if (!resolved.length) {
    return {
      bySetup: 'Need more resolved reviews',
      byTime: 'Need more resolved reviews',
      byScore: 'Need more resolved reviews',
      blockedVsReady: 'No resolved signals yet'
    };
  }

  const ratioText = (wins, total) => `${Math.round((wins / total) * 100)}% (${wins}/${total})`;

  const summarizeBestBucket = (items, labelBuilder) => {
    const ranked = [...items.entries()]
      .map(([key, value]) => ({
        key,
        wins: value.wins,
        total: value.total,
        ratio: value.total > 0 ? value.wins / value.total : 0
      }))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.ratio - a.ratio || b.total - a.total);

    if (!ranked.length) {
      return 'Need more resolved reviews';
    }

    const top = ranked[0];
    return `${labelBuilder(top.key)} ${ratioText(top.wins, top.total)}`;
  };

  const setupBuckets = new Map();
  const timeBuckets = new Map();
  const scoreBuckets = new Map();
  let blockedCount = 0;
  let readyCount = 0;

  for (const review of resolved) {
    const effectiveOutcome =
      review.effectiveOutcome ??
      review.alertSnapshot?.reviewState?.effectiveOutcome ??
      review.outcome ??
      review.autoOutcome;
    const isWin = effectiveOutcome === 'WOULD_WIN';
    const setupKey = review.setupType;
    const hour = new Date(review.detectedAt).getHours();
    const timeKey = hour < 15 ? 'Opening Hour' : 'Late Morning';
    const score = Number(review.alertSnapshot?.candidate?.finalScore ?? review.alertSnapshot?.candidate?.baseScore ?? 0);
    const scoreKey = score >= 85 ? '85+' : score >= 78 ? '78-84.9' : '70-77.9';

    for (const [bucket, key] of [
      [setupBuckets, setupKey],
      [timeBuckets, timeKey],
      [scoreBuckets, scoreKey]
    ]) {
      const existing = bucket.get(key) ?? { wins: 0, total: 0 };
      bucket.set(key, {
        wins: existing.wins + (isWin ? 1 : 0),
        total: existing.total + 1
      });
    }

    if (review.alertSnapshot?.riskDecision?.allowed) {
      readyCount += 1;
    } else {
      blockedCount += 1;
    }
  }

  return {
    bySetup: summarizeBestBucket(setupBuckets, (key) => setupLabel(key)),
    byTime: summarizeBestBucket(timeBuckets, (key) => key),
    byScore: summarizeBestBucket(scoreBuckets, (key) => `Score ${key}`),
    blockedVsReady: `Ready ${readyCount} • Blocked ${blockedCount}`
  };
};

const effectiveReviewOutcome = (review) =>
  review.effectiveOutcome ??
  review.alertSnapshot?.reviewState?.effectiveOutcome ??
  review.outcome ??
  review.autoOutcome;

const reviewSessionKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown-session';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatSessionLabel = (sessionKey) => {
  if (!sessionKey || sessionKey === 'unknown-session') {
    return 'Latest Session';
  }

  const [year, month, day] = sessionKey.split('-').map((part) => Number(part));
  const sessionDate = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(sessionDate.getTime())) {
    return 'Latest Session';
  }

  const now = new Date();
  const nowKey = reviewSessionKey(now.toISOString());
  if (sessionKey === nowKey) {
    return 'Today';
  }

  return sessionDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
};

const buildSessionSummary = (reviews) => {
  if (!reviews.length) {
    return {
      chip: 'Waiting on reviews',
      headline: 'No session summary yet',
      context: 'The review loop will summarize the latest trading session once signals are reviewed or auto-resolved.',
      strongest: 'Need more resolved reviews',
      weakest: 'Need more resolved reviews',
      tomorrow: 'Keep the review loop active so the app can learn what to tighten next.',
      feedback: '0 manual • 0 auto'
    };
  }

  const latestReviewedAt =
    reviews.find((review) => review.detectedAt)?.detectedAt ??
    reviews.find((review) => review.reviewedAt)?.reviewedAt;
  const sessionKey = latestReviewedAt ? reviewSessionKey(latestReviewedAt) : null;
  const sessionReviews = sessionKey
    ? reviews.filter((review) => reviewSessionKey(review.detectedAt ?? review.reviewedAt ?? latestReviewedAt) === sessionKey)
    : reviews;

  const completed = sessionReviews.filter((review) => review.reviewStatus === 'COMPLETED').length;
  const pending = sessionReviews.filter((review) => review.reviewStatus !== 'COMPLETED').length;
  const wins = sessionReviews.filter((review) => effectiveReviewOutcome(review) === 'WOULD_WIN').length;
  const losses = sessionReviews.filter((review) => effectiveReviewOutcome(review) === 'WOULD_LOSE').length;
  const breakeven = sessionReviews.filter((review) => effectiveReviewOutcome(review) === 'BREAKEVEN').length;
  const skipped = sessionReviews.filter((review) => {
    const outcome = effectiveReviewOutcome(review);
    return outcome === 'SKIPPED' || outcome === 'MISSED';
  }).length;
  const invalid = sessionReviews.filter((review) => review.validity === 'INVALID').length;
  const manualFeedback = sessionReviews.filter(
    (review) =>
      review.reviewStatus === 'COMPLETED' ||
      review.effectiveOutcomeSource === 'MANUAL' ||
      review.validity ||
      review.notes
  ).length;
  const autoFeedback = sessionReviews.filter(
    (review) => review.effectiveOutcomeSource === 'AUTO' && review.reviewStatus !== 'COMPLETED'
  ).length;

  const resolvedForRanking = sessionReviews.filter((review) => {
    const outcome = effectiveReviewOutcome(review);
    return outcome === 'WOULD_WIN' || outcome === 'WOULD_LOSE';
  });

  const setupBuckets = new Map();
  let readyCount = 0;
  let blockedCount = 0;

  for (const review of resolvedForRanking) {
    const key = review.setupType;
    const outcome = effectiveReviewOutcome(review);
    const isWin = outcome === 'WOULD_WIN';
    const existing = setupBuckets.get(key) ?? { wins: 0, total: 0 };
    setupBuckets.set(key, {
      wins: existing.wins + (isWin ? 1 : 0),
      total: existing.total + 1
    });

    if (review.alertSnapshot?.riskDecision?.allowed) {
      readyCount += 1;
    } else {
      blockedCount += 1;
    }
  }

  const rankedBuckets = [...setupBuckets.entries()]
    .map(([key, value]) => ({
      key,
      wins: value.wins,
      total: value.total,
      winRate: value.total > 0 ? value.wins / value.total : 0
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.winRate - a.winRate || b.total - a.total);

  const strongest = rankedBuckets[0]
    ? `${setupLabel(rankedBuckets[0].key)} ${Math.round(rankedBuckets[0].winRate * 100)}% (${rankedBuckets[0].wins}/${rankedBuckets[0].total})`
    : 'Need more resolved reviews';
  const weakest = rankedBuckets[rankedBuckets.length - 1]
    ? `${setupLabel(rankedBuckets[rankedBuckets.length - 1].key)} ${Math.round(rankedBuckets[rankedBuckets.length - 1].winRate * 100)}% (${rankedBuckets[rankedBuckets.length - 1].wins}/${rankedBuckets[rankedBuckets.length - 1].total})`
    : invalid > 0
      ? `${invalid} invalid setup${invalid === 1 ? '' : 's'} marked`
      : 'Need more resolved reviews';

  let tomorrow = 'Keep feeding manual reviews so the ranking model learns what you actually want to trade.';
  if (pending > 0) {
    tomorrow = `Clear ${pending} pending review${pending === 1 ? '' : 's'} before the next session so the model is not learning with blind spots.`;
  } else if (invalid >= 2) {
    tomorrow = `You rejected ${invalid} setup${invalid === 1 ? '' : 's'}. Tighten entry quality before trusting borderline signals tomorrow.`;
  } else if (blockedCount > readyCount && blockedCount > 0) {
    tomorrow = 'Most resolved ideas were blocked. Recheck your score threshold and session window before the open.';
  } else if (rankedBuckets.length > 1) {
    tomorrow = `Stay selective on ${setupLabel(rankedBuckets[rankedBuckets.length - 1].key)} until follow-through improves.`;
  }

  const sessionLabel = formatSessionLabel(sessionKey);
  const chip =
    pending > 0
      ? `${sessionLabel} • ${pending} pending`
      : `${sessionLabel} • ${completed} reviewed`;
  const headlineParts = [`${wins} win${wins === 1 ? '' : 's'}`, `${losses} loss${losses === 1 ? '' : 'es'}`];
  if (breakeven > 0) {
    headlineParts.push(`${breakeven} BE`);
  }
  if (skipped > 0) {
    headlineParts.push(`${skipped} skipped`);
  }

  return {
    chip,
    headline: `${sessionLabel}: ${headlineParts.join(' • ')}`,
    context: `${completed} reviewed • ${pending} pending • Ready ${readyCount} • Blocked ${blockedCount}`,
    strongest,
    weakest,
    tomorrow,
    feedback: `${manualFeedback} manual • ${autoFeedback} auto`
  };
};

const formatSignalWhy = (alert) => {
  const reasons = [...(alert.candidate?.eligibility?.passReasons ?? [])];
  const metadata = alert.candidate?.metadata ?? {};

  if (typeof metadata.regimeScore === 'number') {
    const regime = metadata.regimeScore >= 0.15 ? 'Bullish regime' : metadata.regimeScore <= -0.15 ? 'Bearish regime' : 'Mixed regime';
    reasons.push(regime);
  }

  if (typeof metadata.sweptLevel === 'number') {
    reasons.push(`Sweep level ${fmtNum(metadata.sweptLevel, 2)}`);
  }

  if (typeof metadata.mssBreakReference === 'number') {
    reasons.push(`MSS ref ${fmtNum(metadata.mssBreakReference, 2)}`);
  }

  if (typeof metadata.orderBlockLevel === 'number') {
    reasons.push(`OB ${fmtNum(metadata.orderBlockLevel, 2)}`);
  }

  if (typeof metadata.fvgGapLow === 'number' && typeof metadata.fvgGapHigh === 'number') {
    reasons.push(`FVG ${fmtNum(metadata.fvgGapLow, 2)}-${fmtNum(metadata.fvgGapHigh, 2)}`);
  }

  if (typeof metadata.brokenRangeLevel === 'number') {
    reasons.push(`Break level ${fmtNum(metadata.brokenRangeLevel, 2)}`);
  }

  return reasons.slice(0, 4).join(' • ') || 'Rule-qualified signal';
};

const renderSignalChartMarkup = (snapshot) => {
  if (!snapshot?.bars?.length) {
    return '<div class="signalChartPlaceholder">Chart pending</div>';
  }

  const width = 320;
  const height = 144;
  const padding = { top: 12, right: 88, bottom: 16, left: 12 };
  const bars = snapshot.bars;
  const levelDefinitions = [
    {
      price: snapshot.levels.sessionHigh,
      label: 'Sess High',
      color: '#8ab6ff',
      dash: '5 4',
      fill: 'rgba(37, 78, 132, 0.92)'
    },
    {
      price: snapshot.levels.sessionLow,
      label: 'Sess Low',
      color: '#8ab6ff',
      dash: '5 4',
      fill: 'rgba(37, 78, 132, 0.92)'
    },
    {
      price: snapshot.levels.nyRangeHigh,
      label: 'NY High',
      color: '#ffcf82',
      dash: '4 3',
      fill: 'rgba(118, 76, 18, 0.96)'
    },
    {
      price: snapshot.levels.nyRangeLow,
      label: 'NY Low',
      color: '#ffcf82',
      dash: '4 3',
      fill: 'rgba(118, 76, 18, 0.96)'
    },
    {
      price: snapshot.levels.entry,
      label: 'Entry',
      color: '#d5fff0',
      fill: 'rgba(28, 87, 74, 0.96)'
    },
    {
      price: snapshot.levels.stopLoss,
      label: 'Stop',
      color: '#ff9898',
      fill: 'rgba(117, 40, 40, 0.96)'
    },
    {
      price: snapshot.levels.takeProfit,
      label: 'TP1',
      color: '#88f2ba',
      fill: 'rgba(25, 92, 59, 0.96)'
    }
  ].filter((level) => typeof level.price === 'number');

  const allPrices = [...bars.flatMap((bar) => [bar.high, bar.low]), ...levelDefinitions.map((level) => level.price)];

  const maxPrice = Math.max(...allPrices);
  const minPrice = Math.min(...allPrices);
  const range = Math.max(maxPrice - minPrice, 1e-6);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const barGap = Math.max(2, plotWidth / (bars.length * 6));
  const slotWidth = plotWidth / bars.length;
  const bodyWidth = Math.max(4, slotWidth - barGap * 2);
  const priceToY = (price) => padding.top + ((maxPrice - price) / range) * plotHeight;
  const candleX = (index) => padding.left + index * slotWidth + slotWidth / 2;
  const labelWidth = 58;
  const labelHeight = 14;
  const labelGap = 11;
  const labelX = width - padding.right + 8;
  const labelMaxCenterY = height - padding.bottom - labelHeight / 2;
  const labelMinCenterY = padding.top + labelHeight / 2;

  const levelLine = (level) =>
    `<line x1="${padding.left}" y1="${priceToY(level.price)}" x2="${width - padding.right}" y2="${priceToY(level.price)}" stroke="${level.color}" stroke-width="1.2" ${level.dash ? `stroke-dasharray="${level.dash}"` : ''} opacity="0.92" />`;

  const candles = bars
    .map((bar, index) => {
      const x = candleX(index);
      const openY = priceToY(bar.open);
      const closeY = priceToY(bar.close);
      const highY = priceToY(bar.high);
      const lowY = priceToY(bar.low);
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(Math.abs(closeY - openY), 2);
      const fill = bar.close >= bar.open ? '#6fe3c0' : '#ff8f8f';

      return `
        <line x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" stroke="${fill}" stroke-width="1.4" opacity="0.9" />
        <rect x="${x - bodyWidth / 2}" y="${bodyTop}" width="${bodyWidth}" height="${bodyHeight}" rx="1.5" fill="${fill}" opacity="0.92" />
      `;
    })
    .join('');

  const placedLabels = levelDefinitions
    .map((level) => ({ ...level, targetY: priceToY(level.price) }))
    .sort((a, b) => a.targetY - b.targetY)
    .map((level, index, sorted) => {
      const previous = sorted[index - 1];
      const minCenterY = previous ? previous.labelCenterY + labelGap : labelMinCenterY;
      const labelCenterY = Math.max(level.targetY, minCenterY, labelMinCenterY);
      return { ...level, labelCenterY };
    });

  for (let index = placedLabels.length - 1; index >= 0; index -= 1) {
    const next = placedLabels[index + 1];
    const maxCenterY = next ? next.labelCenterY - labelGap : labelMaxCenterY;
    placedLabels[index].labelCenterY = Math.min(placedLabels[index].labelCenterY, maxCenterY, labelMaxCenterY);
    placedLabels[index].labelCenterY = Math.max(placedLabels[index].labelCenterY, labelMinCenterY);
  }

  const levelLabels = placedLabels
    .map(
      (level) => `
        <g>
          <line
            x1="${width - padding.right}"
            y1="${priceToY(level.price)}"
            x2="${labelX - 4}"
            y2="${level.labelCenterY}"
            stroke="${level.color}"
            stroke-width="1"
            opacity="0.55"
          />
          <rect
            x="${labelX}"
            y="${level.labelCenterY - labelHeight / 2}"
            width="${labelWidth}"
            height="${labelHeight}"
            rx="7"
            fill="${level.fill}"
            stroke="${level.color}"
            stroke-width="0.9"
          />
          <text
            x="${labelX + labelWidth / 2}"
            y="${level.labelCenterY + 3}"
            fill="#f6fbff"
            font-size="8.2"
            font-weight="700"
            text-anchor="middle"
            letter-spacing="0.02em"
          >${level.label}</text>
        </g>
      `
    )
    .join('');

  const chartBadge = `
    <g>
      <rect x="${padding.left}" y="${padding.top}" width="72" height="16" rx="8" fill="rgba(6, 15, 25, 0.86)" stroke="rgba(213, 234, 255, 0.18)" />
      <text x="${padding.left + 36}" y="${padding.top + 11}" fill="#d8ecff" font-size="8.5" font-weight="700" text-anchor="middle" letter-spacing="0.04em">
        ${snapshot.timeframe ?? '5m'} trigger map
      </text>
    </g>
  `;

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="rgba(5, 12, 21, 0.74)" />
      ${levelDefinitions.map(levelLine).join('')}
      ${candles}
      ${chartBadge}
      ${levelLabels}
    </svg>
  `;
};

const configureExpandableChart = (chartEl, title, meta) => {
  if (!chartEl) {
    return;
  }

  if (chartEl.querySelector('svg')) {
    chartEl.classList.add('is-expandable');
    chartEl.tabIndex = 0;
    chartEl.setAttribute('role', 'button');
    chartEl.setAttribute('aria-label', `Expand ${title || 'chart'}`);
    chartEl.dataset.chartLightboxTitle = title || 'Trigger Snapshot';
    chartEl.dataset.chartLightboxMeta = meta || 'Swipe down to return to the desk.';
    return;
  }

  chartEl.classList.remove('is-expandable');
  chartEl.removeAttribute('role');
  chartEl.removeAttribute('aria-label');
  chartEl.removeAttribute('tabindex');
  delete chartEl.dataset.chartLightboxTitle;
  delete chartEl.dataset.chartLightboxMeta;
};

const setChartLightboxOffset = (offsetY = 0) => {
  if (!chartLightboxSheetEl) {
    return;
  }

  chartLightboxSheetEl.style.setProperty('--chart-lightbox-offset', `${Math.max(0, offsetY)}px`);
};

const closeChartLightbox = () => {
  if (!chartLightboxEl || chartLightboxEl.hidden) {
    return;
  }

  chartLightboxGesture.active = false;
  chartLightboxGesture.startY = 0;
  chartLightboxGesture.offsetY = 0;
  chartLightboxSheetEl?.classList.remove('is-dragging');
  setChartLightboxOffset(0);
  chartLightboxEl.hidden = true;
  chartLightboxEl.setAttribute('aria-hidden', 'true');
  if (chartLightboxFrameEl) {
    chartLightboxFrameEl.innerHTML = '';
  }
  document.body.classList.remove('chart-lightbox-open');
};

const openChartLightbox = (chartEl) => {
  if (!chartLightboxEl || !chartLightboxFrameEl || !chartEl?.querySelector('svg')) {
    return;
  }

  chartLightboxTitleEl.textContent = chartEl.dataset.chartLightboxTitle || 'Trigger Snapshot';
  chartLightboxMetaEl.textContent = chartEl.dataset.chartLightboxMeta || 'Swipe down to return to the desk.';
  chartLightboxFrameEl.innerHTML = chartEl.innerHTML;
  chartLightboxEl.hidden = false;
  chartLightboxEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('chart-lightbox-open');
  chartLightboxGesture.active = false;
  chartLightboxGesture.startY = 0;
  chartLightboxGesture.offsetY = 0;
  chartLightboxSheetEl?.classList.remove('is-dragging');
  setChartLightboxOffset(0);
};

const bindChartLightbox = () => {
  if (chartLightboxListenersBound || !chartLightboxEl || !chartLightboxSheetEl) {
    return;
  }

  chartLightboxListenersBound = true;

  document.addEventListener('click', (event) => {
    const chartEl = event.target.closest('.signalChart.is-expandable');
    if (!chartEl || chartLightboxEl.contains(chartEl)) {
      return;
    }

    openChartLightbox(chartEl);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !chartLightboxEl.hidden) {
      closeChartLightbox();
      return;
    }

    const chartEl = event.target.closest('.signalChart.is-expandable');
    if (!chartEl) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openChartLightbox(chartEl);
    }
  });

  chartLightboxBackdropEl?.addEventListener('click', closeChartLightbox);
  chartLightboxCloseEl?.addEventListener('click', closeChartLightbox);

  chartLightboxSheetEl.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1 || event.target.closest('button')) {
      return;
    }

    chartLightboxGesture.active = true;
    chartLightboxGesture.startY = event.touches[0].clientY;
    chartLightboxGesture.offsetY = 0;
    chartLightboxSheetEl.classList.add('is-dragging');
  });

  chartLightboxSheetEl.addEventListener(
    'touchmove',
    (event) => {
      if (!chartLightboxGesture.active) {
        return;
      }

      const deltaY = event.touches[0].clientY - chartLightboxGesture.startY;
      if (deltaY <= 0) {
        setChartLightboxOffset(0);
        return;
      }

      chartLightboxGesture.offsetY = deltaY;
      setChartLightboxOffset(deltaY);
      event.preventDefault();
    },
    { passive: false }
  );

  chartLightboxSheetEl.addEventListener('touchend', () => {
    if (!chartLightboxGesture.active) {
      return;
    }

    chartLightboxSheetEl.classList.remove('is-dragging');
    if (chartLightboxGesture.offsetY >= CHART_LIGHTBOX_DISMISS_PX) {
      closeChartLightbox();
      return;
    }

    chartLightboxGesture.active = false;
    chartLightboxGesture.startY = 0;
    chartLightboxGesture.offsetY = 0;
    setChartLightboxOffset(0);
  });

  chartLightboxSheetEl.addEventListener('touchcancel', () => {
    chartLightboxGesture.active = false;
    chartLightboxGesture.startY = 0;
    chartLightboxGesture.offsetY = 0;
    chartLightboxSheetEl.classList.remove('is-dragging');
    setChartLightboxOffset(0);
  });
};

const getFilteredAlerts = (alerts) =>
  alerts.filter((alert) => {
    const statusMatch =
      signalFilters.status === 'ALL' ||
      (signalFilters.status === 'READY' && alert.riskDecision.allowed) ||
      (signalFilters.status === 'BLOCKED' && !alert.riskDecision.allowed);
    const symbolMatch = signalFilters.symbol === 'ALL' || alert.symbol === signalFilters.symbol;
    return statusMatch && symbolMatch;
  });

const updateSegmentedControls = () => {
  signalStatusFilterButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.statusFilter === signalFilters.status);
  });

  signalSymbolFilterButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.symbolFilter === signalFilters.symbol);
  });
};

const isSameLocalDay = (iso, date = new Date()) => {
  if (!iso) {
    return false;
  }
  return new Date(iso).toDateString() === date.toDateString();
};

const calcRr = (entry, stop, tp) => {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(tp - entry);
  if (!risk || !reward) {
    return '--';
  }
  return `${(reward / risk).toFixed(2)}R`;
};

const formatProjectionNote = (entry, level, type) => {
  if (!Number.isFinite(entry) || !Number.isFinite(level)) {
    return '--';
  }

  const move = Math.abs(level - entry);
  const direction = level >= entry ? 'above' : 'below';
  if (!move) {
    return 'At entry price';
  }

  return type === 'target'
    ? `${fmtNum(move, 2)} points ${direction} entry`
    : `${fmtNum(move, 2)} points ${direction} entry before invalidation`;
};

const vibrateLight = () => {
  if ('vibrate' in navigator) {
    navigator.vibrate(12);
  }
};

const hashAlertId = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash % 2147483000;
};

const getLocalNotificationsPlugin = () => window.Capacitor?.Plugins?.LocalNotifications ?? null;
const getNativePushPlugin = () => window.Capacitor?.Plugins?.PushNotifications ?? null;
const hasNativePush = () =>
  nativePushServerReady && Boolean(getNativePushPlugin()?.requestPermissions && getNativePushPlugin()?.register);

const saveNativePushToken = (token) => {
  if (token) {
    localStorage.setItem(NATIVE_PUSH_TOKEN_KEY, token);
    return;
  }
  localStorage.removeItem(NATIVE_PUSH_TOKEN_KEY);
};

const getNativePushToken = () => localStorage.getItem(NATIVE_PUSH_TOKEN_KEY) || '';

const bindLocalNotificationListeners = () => {
  const localNotifications = getLocalNotificationsPlugin();
  if (!localNotifications?.addListener || localNotificationListenersBound) {
    return;
  }

  localNotificationListenersBound = true;
  localNotifications.addListener('localNotificationActionPerformed', (event) => {
    const extra = event?.notification?.extra ?? {};
    const alertId = typeof extra.alertId === 'string' ? extra.alertId : null;
    if (alertId) {
      routeToSignalAlert(alertId, 'signals');
    }
    setActiveTab('signals');
    void refreshAll();
  });
};

const bindNativePushListeners = () => {
  const push = getNativePushPlugin();
  if (!push || nativePushListenersBound) {
    return;
  }

  nativePushListenersBound = true;

  push.addListener('registration', async (token) => {
    saveNativePushToken(token?.value || '');
    try {
      await apiFetch('/notifications/native/register', {
        method: 'POST',
        body: JSON.stringify({
          deviceToken: token.value,
          platform: 'ios',
          deviceLabel: 'capacitor-ios'
        })
      });
    } catch (error) {
      setStatus(`Status: native push registration failed (${error.message})`, true);
    }
  });

  push.addListener('registrationError', (error) => {
    const message = error?.error || error?.message || 'native push registration error';
    setStatus(`Status: ${message}`, true);
  });

  push.addListener('pushNotificationReceived', () => {
    void refreshAll();
  });

  push.addListener('pushNotificationActionPerformed', () => {
    const routeAlertId = parseRouteState().alertId;
    if (routeAlertId) {
      routeToSignalAlert(routeAlertId, 'signals');
    }
    setActiveTab('signals');
    void refreshAll();
  });
};

const requestNotificationPermission = async () => {
  const nativePush = getNativePushPlugin();
  if (nativePushServerReady && nativePush?.requestPermissions && nativePush?.register) {
    bindNativePushListeners();
    try {
      const permissions = await nativePush.requestPermissions();
      if (permissions.receive === 'granted') {
        await nativePush.register();
        return true;
      }
    } catch {
      // fall through to other notification paths
    }
  }

  const localNotifications = getLocalNotificationsPlugin();
  if (localNotifications?.requestPermissions) {
    try {
      const result = await localNotifications.requestPermissions();
      if (result.display === 'granted') {
        return true;
      }
    } catch {
      // fall through to browser notifications
    }
  }

  if (!('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  return (await Notification.requestPermission()) === 'granted';
};

const triggerServerTestAlert = async () => {
  try {
    await apiFetch('/notifications/test/alert', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'NQ' })
    });
    return true;
  } catch {
    return false;
  }
};

const pushSignalNotification = async (alert) => {
  const prefs = getNotificationPrefs();
  if (!prefs.enabled) {
    return;
  }

  const body = [
    alert?.reviewState?.escalationCount > 0 ? `Reminder ${alert.reviewState.escalationCount}` : null,
    setupLabel(alert.setupType),
    typeof alert.candidate.finalScore === 'number' ? `Score ${fmtNum(alert.candidate.finalScore, 1)}` : 'Score --',
    alert.riskDecision.allowed ? 'Ready to review' : alert.riskDecision.reasonCodes[0] || 'Risk blocked'
  ]
    .filter(Boolean)
    .join(' • ');

  const localNotifications = getLocalNotificationsPlugin();
  if (localNotifications?.schedule) {
    bindLocalNotificationListeners();
    try {
      await localNotifications.schedule({
        notifications: [
          {
            id: hashAlertId(alertNotificationFingerprint(alert)),
            title:
              alert?.reviewState?.escalationCount > 0
                ? `Reminder ${alert.reviewState.escalationCount}: ${alert.title}`
                : alert.title,
            body,
            schedule: { at: new Date(Date.now() + 250) },
            extra: {
              tab: 'signals',
              alertId: alert.alertId
            }
          }
        ]
      });
      return;
    } catch {
      // fall back to browser notifications
    }
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(alert.title, {
      body,
      tag: alert.alertId
    });
  }
};

const sendTestAppAlert = async () => {
  const granted = await requestNotificationPermission();
  let localSent = false;

  if (granted) {
    const localNotifications = getLocalNotificationsPlugin();
    if (localNotifications?.schedule) {
      try {
        await localNotifications.schedule({
          notifications: [
            {
              id: hashAlertId(`manual-test-${Date.now()}`),
              title: 'Trading Assist test alert',
              body: 'Direct local alert from the iPhone app is working.',
              schedule: { at: new Date(Date.now() + 2_000) }
            }
          ]
        });
        localSent = true;
      } catch {
        // fall back to browser notifications
      }
    }

    if (!localSent && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Trading Assist test alert', {
        body: 'Direct local alert from this app is working.'
      });
      localSent = true;
    }
  }

  const serverSent = await triggerServerTestAlert();

  if (localSent && serverSent) {
    setStatus('Status: phone test alert scheduled and Telegram/server test sent. Lock or background the app for the next 2 seconds to see the banner.');
    return true;
  }

  if (localSent) {
    setStatus('Status: phone test alert scheduled, but the Telegram/server test did not go through.', true);
    return true;
  }

  if (serverSent) {
    setStatus('Status: local phone notifications are unavailable on this device, but the Telegram/server test was sent.', true);
    return true;
  }

  setStatus(
    granted
      ? 'Status: test alerts are unavailable on this device right now.'
      : 'Status: notification permission is blocked on this device, and the Telegram/server test failed.',
    true
  );
  return false;
};

const syncSeenAlerts = async (alerts) => {
  const seenIds = getSeenAlertIds();
  const known = new Set(seenIds);
  const fingerprints = alerts.map((alert) => alertNotificationFingerprint(alert));

  if (seenIds.length === 0) {
    saveSeenAlertIds(fingerprints);
    return;
  }

  const unseen = alerts
    .filter((alert) => !known.has(alertNotificationFingerprint(alert)))
    .sort((a, b) => new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime());

  for (const alert of unseen) {
    await pushSignalNotification(alert);
    known.add(alertNotificationFingerprint(alert));
  }

  for (const fingerprint of fingerprints) {
    known.add(fingerprint);
  }

  saveSeenAlertIds([...known]);
};

const setActiveTab = (tabName) => {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle('is-active', isActive);
    if (isActive) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });

  quickActionButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.targetTab === tabName);
  });

  Object.entries(views).forEach(([name, view]) => {
    view.classList.toggle('is-active', name === tabName);
  });

  updateRouteState({
    tab: tabName,
    alertId: tabName === 'signals' ? activeRouteAlertId : null
  });

  try {
    window.scrollTo({
      top: 0,
      behavior: document.documentElement.classList.contains('reduce-motion') ? 'auto' : 'smooth'
    });
  } catch {
    // no-op in test/non-browser environments that stub scrollTo
  }
};

const acknowledgeAlert = async (alertId, buttonEl) => {
  const acknowledgedBy = approvedByInput.value.trim() || localStorage.getItem(APPROVER_KEY) || '';
  buttonEl.disabled = true;
  buttonEl.textContent = 'Acknowledging...';

  try {
    await apiFetch(`/signals/alerts/${encodeURIComponent(alertId)}/ack`, {
      method: 'POST',
      body: JSON.stringify(acknowledgedBy ? { acknowledgedBy } : {})
    });
    vibrateLight();
    setStatus('Status: alert acknowledged. Repeat reminders are now suppressed for this signal.');
    await Promise.all([loadAlerts(), loadReviews(), loadDiagnostics()]);
  } catch (error) {
    buttonEl.disabled = false;
    buttonEl.textContent = 'Acknowledge';
    setStatus(`Status: acknowledge failed (${error.message})`, true);
  }
};

const apiFetch = async (path, options = {}) => {
  const base = getApiBase();
  const hasBody = options.body !== undefined && options.body !== null;
  const headers = {
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`${base}${path}`, {
    cache: 'no-store',
    headers,
    ...options
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body.message) {
        message = body.message;
      }
    } catch {
      // no-op
    }
    throw new Error(message);
  }

  return response.json();
};

const supportsRemoteWebPush = () =>
  window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window;

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .register('sw.js')
      .then((registration) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (serviceWorkerReloading) {
            return;
          }
          serviceWorkerReloading = true;
          window.location.reload();
        });

        const promptActivation = (worker) => {
          worker?.postMessage?.({
            type: 'SKIP_WAITING'
          });
        };

        if (registration.waiting) {
          promptActivation(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const nextWorker = registration.installing;
          if (!nextWorker) {
            return;
          }

          nextWorker.addEventListener('statechange', () => {
            if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
              promptActivation(nextWorker);
            }
          });
        });

        void registration.update().catch(() => null);
        return registration;
      })
      .catch(() => null);
  }

  return serviceWorkerRegistrationPromise;
};

const urlBase64ToUint8Array = (value) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }

  return output;
};

const getPushPlatform = () => {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'ios';
  }
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return 'macos';
  }
  return 'web';
};

const getPushDeviceLabel = () => {
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return `${isStandalone ? 'installed' : 'browser'}-${getPushPlatform()}`;
};

const syncRemotePushSubscription = async () => {
  if (!supportsRemoteWebPush()) {
    return false;
  }

  const registration = await registerServiceWorker();
  if (!registration?.pushManager) {
    return false;
  }

  const { publicKey } = await apiFetch('/notifications/webpush/public-key');
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  await apiFetch('/notifications/webpush/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      deviceLabel: getPushDeviceLabel(),
      platform: getPushPlatform()
    })
  });

  return true;
};

const unsubscribeRemotePushSubscription = async () => {
  if (!supportsRemoteWebPush()) {
    return false;
  }

  const registration = await registerServiceWorker();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) {
    return false;
  }

  await apiFetch('/notifications/webpush/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint
    })
  }).catch(() => null);

  await subscription.unsubscribe().catch(() => false);
  return true;
};

const renderEmpty = (container, text) => {
  container.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = text;
  container.appendChild(empty);
};

const renderInsights = () => {
  setupMixEl.textContent = formatSetupMix(latestTrades.slice(0, 100));
  guardrailSummaryEl.textContent = countGuardrails(latestEvents.slice(0, 200));

  const approved = latestTrades.filter((trade) => trade.status === 'APPROVED').length;
  const rejected = latestTrades.filter((trade) => trade.status === 'REJECTED').length;
  journalSummaryEl.textContent = `${approved} approved • ${rejected} rejected • ${latestEvents.length} events`;
};

const renderCalendarEvents = (calendar) => {
  if (!calendarEventsListEl) {
    return;
  }

  calendarEventsListEl.innerHTML = '';
  const events = calendar?.upcomingEvents ?? [];

  if (!events.length) {
    renderEmpty(calendarEventsListEl, 'No upcoming macro events in the current calendar window.');
    return;
  }

  events.forEach((event) => {
    const card = document.createElement('article');
    card.className = 'insight-card calendar-event-card';

    const title = document.createElement('p');
    title.className = 'stat-label';
    title.textContent = `${(event.impact ?? 'low').toUpperCase()} • ${event.country ?? event.currency ?? 'Macro event'}`;
    card.appendChild(title);

    const headline = document.createElement('p');
    headline.className = 'insight-text';
    headline.textContent = event.title ?? event.category ?? 'Economic event';
    card.appendChild(headline);

    const meta = document.createElement('p');
    meta.className = 'hint';
    const metaParts = [
      fmtDateTimeCompact(event.startsAt),
      event.category ?? null,
      event.reference ?? null
    ].filter(Boolean);
    meta.textContent = metaParts.join(' • ');
    card.appendChild(meta);

    const figures = [event.actual ? `Actual ${event.actual}` : null, event.forecast ? `Forecast ${event.forecast}` : null, event.previous ? `Prev ${event.previous}` : null]
      .filter(Boolean)
      .join(' • ');
    if (figures) {
      const figuresEl = document.createElement('p');
      figuresEl.className = 'hint';
      figuresEl.textContent = figures;
      card.appendChild(figuresEl);
    }

    calendarEventsListEl.appendChild(card);
  });
};

const renderReviewInsights = () => {
  const summary = reviewPerformanceSummary(latestReviews);
  reviewSetupEdgeEl.textContent = summary.bySetup;
  reviewTimeEdgeEl.textContent = summary.byTime;
  reviewScoreEdgeEl.textContent = summary.byScore;
  reviewBlockedVsReadyEl.textContent = summary.blockedVsReady;

  const sessionSummary = buildSessionSummary(latestReviews);
  sessionSummaryChipEl.textContent = sessionSummary.chip;
  sessionSummaryHeadlineEl.textContent = sessionSummary.headline;
  sessionSummaryContextEl.textContent = sessionSummary.context;
  sessionSummaryStrongestEl.textContent = sessionSummary.strongest;
  sessionSummaryWeakestEl.textContent = sessionSummary.weakest;
  sessionSummaryTomorrowEl.textContent = sessionSummary.tomorrow;
  sessionSummaryFeedbackEl.textContent = sessionSummary.feedback;
};

const renderDiagnostics = () => {
  const diagnostics = latestDiagnostics?.diagnostics;
  if (!diagnostics) {
    diagLiveFeedEl.textContent = '--';
    diagLastBarEl.textContent = '--';
    diagModelEl.textContent = '--';
    diagSubscribersEl.textContent = '--';
    diagSignalMonitorEl.textContent = '--';
    diagLastAlertEl.textContent = '--';
    diagCalendarSourceEl.textContent = '--';
    diagCalendarCoverageEl.textContent = '--';
    diagCalendarNextEl.textContent = '--';
    renderCalendarEvents(null);
    diagTrainingCadenceEl.textContent = '--';
    diagTrainingLastRunEl.textContent = '--';
    diagTrainingActiveModelEl.textContent = '--';
    diagTrainingNextWindowEl.textContent = '--';
    diagTrainingPromotionEl.textContent = '--';
    diagLearningFeedbackEl.textContent = '--';
    diagLearningSetupEl.textContent = '--';
    diagLearningFrameEl.textContent = '--';
    diagTrainingFramesEl.textContent = '--';
    diagTrainingTriggerEl.textContent = '--';
    sysGlanceFeedEl.textContent = '--';
    sysGlanceModelEl.textContent = '--';
    sysGlanceTrainingEl.textContent = '--';
    sysGlanceAlertsEl.textContent = '--';
    updateSystemSummary();
    return;
  }

  const training = diagnostics.training ?? null;
  const learningPerformance = diagnostics.learningPerformance ?? null;
  const recovery = diagnostics.ibkrRecovery ?? null;
  const calendar = diagnostics.calendar ?? null;
  const feedState = getFeedStateMeta(diagnostics);
  const cadence = training?.cadence ?? null;
  const analysisFrames = training?.data?.analysisTimeframes ?? [];
  const topSetup = learningPerformance?.bySetup?.[0] ?? null;
  const topFrame = learningPerformance?.byExecutionTimeframe?.[0] ?? null;

  diagLiveFeedEl.textContent = feedState.summary;
  diagLastBarEl.textContent = diagnostics.latestBarTimestamp
    ? `${fmtDateTimeCompact(diagnostics.latestBarTimestamp)} • ${fmtRelativeMinutes(diagnostics.latestBarTimestamp)}`
    : 'No recent bar';
  diagModelEl.textContent = diagnostics.rankingModel?.modelId ?? '--';
  diagSubscribersEl.textContent = `Web ${diagnostics.notifications?.webPushSubscribers ?? 0} • Native ${diagnostics.notifications?.nativePushDevices ?? 0} • TG ${diagnostics.notifications?.telegramReady ? 'on' : 'off'} • Sun ${diagnostics.notifications?.ibkrLoginReminderEnabled ? 'on' : 'off'}`;
  diagSignalMonitorEl.textContent = diagnostics.signalMonitor?.started
    ? `On • ${diagnostics.signalMonitor.alertCount ?? 0} alerts`
    : 'Off';
  diagLastAlertEl.textContent = diagnostics.lastAlert
    ? `${diagnostics.lastAlert.symbol} ${diagnostics.lastAlert.side} • ${fmtTime(diagnostics.lastAlert.detectedAt)}`
    : 'No alert yet';
  diagCalendarSourceEl.textContent = calendar?.sourceName
    ? `${calendar.sourceName}${calendar.lastError ? ' • degraded' : ''}`
    : 'Not configured';
  diagCalendarCoverageEl.textContent = calendar
    ? `${calendar.cachedEventCount ?? 0} cached • ${calendar.filteredCountryCount ? `${calendar.filteredCountryCount} countries` : 'global'}`
    : '--';
  diagCalendarNextEl.textContent = calendar?.nextEventAt
    ? `${fmtDateTimeCompact(calendar.nextEventAt)} • ${fmtRelativeMinutes(calendar.nextEventAt)}`
    : 'No upcoming event';
  renderCalendarEvents(calendar);
  diagTrainingCadenceEl.textContent = training?.enabled
    ? `${cadence?.retrainIntervalMinutes ?? '--'}m cadence • ${cadence?.minNewBarsForRetrain ?? '--'} bars`
    : 'Disabled';
  const lastAttemptAt = training?.lastRun?.trainedAt ?? training?.lastTrainedAt;
  diagTrainingLastRunEl.textContent = lastAttemptAt
    ? `${fmtDateTimeCompact(lastAttemptAt)} • completed ${fmtRelativeMinutes(lastAttemptAt)}`
    : 'No retrain attempt yet';
  const activeModelTrainedAt = training?.model?.trainedAt ?? training?.lastTrainedAt;
  diagTrainingActiveModelEl.textContent = activeModelTrainedAt
    ? `${fmtDateTimeCompact(activeModelTrainedAt)} • live ${fmtRelativeMinutes(activeModelTrainedAt)}`
    : 'Current live model has not been promoted yet';
  diagTrainingNextWindowEl.textContent = training?.trainingInProgress
    ? 'Training now'
    : cadence?.nextWindowAt
      ? `${fmtDateTimeCompact(cadence.nextWindowAt)} • needs ${cadence?.barsNeededForNextRetrain ?? '--'} bars`
      : 'Waiting for new bars';
  diagTrainingPromotionEl.textContent = training?.promotion?.lastDecision
    ? training.promotion.alwaysPromoteLatestModel
      ? `Newest retrain goes live • validation ${fmtNum(training.promotion.lastDecision.delta * 100, 2)}%`
      : training.promotion.lastDecision.promoted
        ? `Promoted challenger • +${fmtNum(training.promotion.lastDecision.delta * 100, 2)}%`
        : `Held champion • ${fmtNum(training.promotion.lastDecision.delta * 100, 2)}%`
    : 'No decision yet';
  diagLearningFeedbackEl.textContent = training?.feedback
    ? `${training.feedback.manualResolvedReviews ?? 0} manual • ${training.feedback.autoResolvedReviews ?? 0} auto`
    : '--';
  diagLearningSetupEl.textContent = topSetup
    ? `${topSetup.label} ${Math.round(topSetup.winRate * 100)}%`
    : 'Need more resolved reviews';
  diagLearningFrameEl.textContent = topFrame
    ? `${topFrame.label} ${Math.round(topFrame.winRate * 100)}%`
    : 'Need more resolved reviews';
  diagTrainingFramesEl.textContent = analysisFrames.length ? analysisFrames.join(' • ') : '--';
  diagTrainingTriggerEl.textContent = training?.enabled
    ? training?.promotion?.alwaysPromoteLatestModel
      ? `Latest retrain becomes the live model automatically. Last run was ${lastAttemptAt ? fmtRelativeMinutes(lastAttemptAt) : 'never'} and the next run needs ${cadence?.barsNeededForNextRetrain ?? '--'} new bars.`
      : `Last retrain attempt ${lastAttemptAt ? fmtRelativeMinutes(lastAttemptAt) : 'never'} • next run needs ${cadence?.barsNeededForNextRetrain ?? '--'} new bars.`
    : 'Continuous training is disabled.';
  sysGlanceFeedEl.textContent =
    recovery?.pendingReconnect
      ? 'Reauth needed • use the recovery controls below'
      : `${feedState.summary} • ${feedState.detail}`;
  sysGlanceModelEl.textContent = describeDeskRules(signalSettings);
  sysGlanceTrainingEl.textContent = training?.enabled
    ? `${cadence?.retrainIntervalMinutes ?? '--'}m cadence • ${training?.promotion?.promotions ?? 0} promoted`
    : 'Disabled';
  sysGlanceAlertsEl.textContent = getNotificationPrefs().enabled
    ? diagnostics.notifications?.telegramReady
      ? diagnostics.notifications?.ibkrLoginReminderEnabled
        ? 'Phone • Mac • Telegram • Sunday'
        : 'Phone • Mac • Telegram'
      : diagnostics.notifications?.ibkrLoginReminderEnabled
      ? 'Phone • Mac • Sunday'
      : 'Phone • Mac'
    : 'Phone alerts off';
  renderQuietModeState();
  updateSystemSummary();
};

const renderHero = () => {
  const diagnostics = latestDiagnostics?.diagnostics;
  const filteredAlerts = getFilteredAlerts(latestAlerts);
  const topAlert = filteredAlerts[0] ?? latestAlerts[0] ?? null;
  const readyCount = latestAlerts.filter((alert) => alert.riskDecision.allowed).length;
  const blockedCount = latestAlerts.length - readyCount;

  heroWindowEl.textContent = '08:30-11:30 ET';
  if (signalSettings) {
    heroWindowEl.textContent = `${formatTimeValue(signalSettings.sessionStartHour, signalSettings.sessionStartMinute)}-${formatTimeValue(signalSettings.sessionEndHour, signalSettings.sessionEndMinute)} ET`;
  }
  heroStackEl.textContent = diagnostics?.notifications?.telegramReady
    ? 'Web Push • Mac • Telegram'
    : 'Web Push • Mac';

  if (!topAlert) {
    heroFocusEl.textContent = 'Waiting for structure';
    heroSublineEl.textContent = 'The system is watching for qualified morning setups.';
    signalLeadIdeaEl.textContent = 'No live idea yet';
    signalLeadWhyEl.textContent = 'Waiting for opening range structure.';
    signalLeadSymbolEl.textContent = '--';
  } else {
    heroFocusEl.textContent = `${topAlert.symbol} ${topAlert.side} ${topAlert.riskDecision.allowed ? 'ready' : 'watch'}`;
    heroSublineEl.textContent = formatSignalWhy(topAlert);
    signalLeadIdeaEl.textContent = `${setupLabel(topAlert.setupType)} • ${topAlert.symbol}`;
    signalLeadWhyEl.textContent = topAlert.riskDecision.allowed
      ? formatSignalWhy(topAlert)
      : `Blocked by ${topAlert.riskDecision.reasonCodes.join(' • ') || 'guardrails'}`;
    signalLeadSymbolEl.textContent = `${topAlert.symbol} • ${signalBiasLabel(topAlert)}`;
  }

  const feedState = getFeedStateMeta(diagnostics ?? null);
  heroFeedBadgeEl.textContent = `Feed ${feedState.segment}`;
  heroPushBadgeEl.textContent = `${readyCount} ready • ${reviewSummary.pending} review`;
  heroLastAlertEl.textContent = diagnostics?.lastAlert
    ? `Last alert ${fmtTime(diagnostics.lastAlert.detectedAt)}`
    : 'No alert yet';
  signalReadyBlockedEl.textContent = `${readyCount} ready / ${blockedCount} blocked`;
  signalQueueSummaryEl.textContent = `${filteredAlerts.length} shown • ${readyCount} ready`;

  const statusText = signalFilters.status === 'ALL' ? 'All' : signalFilters.status;
  const symbolText = signalFilters.symbol === 'ALL' ? 'all markets' : signalFilters.symbol;
  signalFilterSummaryEl.textContent = `${statusText} • ${symbolText}`;
};

const updateStats = () => {
  signalCountEl.textContent = String(latestAlerts.length);
  pendingCountEl.textContent = String(latestPending.length);
  reviewPendingStatEl.textContent = String(reviewSummary.pending);
  reviewSummaryChipEl.textContent = `${reviewSummary.pending} pending • ${reviewSummary.completed} done`;
  reviewPendingQueueChipEl.textContent = `${reviewSummary.pending} pending`;
  reviewCompletedQueueChipEl.textContent = `${reviewSummary.completed} completed`;

  const approvedToday = latestTrades.filter(
    (trade) => trade.status === 'APPROVED' && isSameLocalDay(trade.approvedAt ?? trade.createdAt)
  ).length;
  sentCountEl.textContent = String(approvedToday);

  const openRisk = latestPending.reduce((sum, intent) => sum + (Number(intent.riskPct) || 0), 0);
  openRiskCountEl.textContent = `${fmtNum(openRisk, 2)}%`;

  topSetupStatEl.textContent = computeTopSetup(latestTrades);
  lastSyncChipEl.textContent = `Sync: ${fmtTime(lastSyncAt)}`;
  renderHero();
};

const loadHealth = async () => {
  try {
    const health = await apiFetch('/health');
    latestHealth = { ok: true, service: health.service };
    renderStatusRail();
    setStatus(`Status: online (${health.service})`);
    return true;
  } catch (error) {
    latestHealth = { ok: false, service: error.message };
    renderStatusRail();
    setStatus(`Status: offline (${error.message})`, true);
    return false;
  }
};

const loadDiagnostics = async () => {
  try {
    latestDiagnostics = await apiFetch('/diagnostics');
    nativePushServerReady = Boolean(latestDiagnostics?.diagnostics?.notifications?.nativePushReady);
    if (latestDiagnostics?.diagnostics?.signalConfig) {
      renderSignalSettings(latestDiagnostics.diagnostics.signalConfig);
    }
    renderDiagnostics();
    renderStatusRail();
  } catch {
    latestDiagnostics = null;
    nativePushServerReady = false;
    renderDiagnostics();
    renderStatusRail();
  }
};

const loadRiskConfig = async () => {
  try {
    latestRiskConfig = await apiFetch('/risk/config');
  } catch {
    latestRiskConfig = null;
  }
  renderQuietModeState();
};

const loadSignalSettings = async () => {
  try {
    const { config } = await apiFetch('/signals/config');
    renderSignalSettings(config);
  } catch (error) {
    setStatus(`Status: failed to load signal settings (${error.message})`, true);
  }
};

const loadAlerts = async () => {
  try {
    const { alerts } = await apiFetch('/signals/alerts?limit=30');
    latestAlerts = alerts ?? [];
    alertsListEl.innerHTML = '';
    await syncSeenAlerts(latestAlerts);

    const filteredAlerts = getFilteredAlerts(latestAlerts);

    if (!latestAlerts.length) {
      renderEmpty(alertsListEl, 'No live signals yet. The app will alert you when a setup is detected.');
      updateStats();
      return;
    }

    if (!filteredAlerts.length) {
      renderEmpty(alertsListEl, 'No signals match the current filters.');
      updateStats();
      return;
    }

    let focusedNode = null;
    filteredAlerts.forEach((alert) => {
      const node = signalTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.alertId = alert.alertId;
      node.querySelector('.symbol').textContent = `${alert.symbol} ${alert.side}`;
      node.querySelector('.setupType').textContent = setupLabel(alert.setupType);
      node.querySelector('.signalSummary').textContent = summarizeSignalSetup(alert);
      node.querySelector('.signalNextStep').textContent = summarizeSignalNextStep(alert);
      const signalChartEl = node.querySelector('.signalChart');
      signalChartEl.innerHTML = renderSignalChartMarkup(alert.chartSnapshot);
      configureExpandableChart(
        signalChartEl,
        `${alert.symbol} ${alert.side} • ${setupLabel(alert.setupType)}`,
        `${alert.chartSnapshot?.timeframe ?? '5m'} snapshot • swipe down to return`
      );
      node.querySelector('.signalScore').textContent =
        typeof alert.candidate.finalScore === 'number' ? fmtNum(alert.candidate.finalScore, 1) : '--';
      node.querySelector('.signalRisk').textContent = alert.riskDecision.allowed
        ? `${fmtNum(alert.riskDecision.finalRiskPct, 2)}%`
        : 'Blocked';
      node.querySelector('.entry').textContent = fmtNum(alert.candidate.entry, 2);
      node.querySelector('.stopLoss').textContent = fmtNum(alert.candidate.stopLoss, 2);
      node.querySelector('.takeProfitOne').textContent = fmtNum(alert.candidate.takeProfit?.[0], 2);
      node.querySelector('.signalProjectedTakeProfit').textContent = fmtNum(alert.candidate.takeProfit?.[0], 2);
      node.querySelector('.signalProjectedTakeProfitNote').textContent = formatProjectionNote(
        alert.candidate.entry,
        alert.candidate.takeProfit?.[0],
        'target'
      );
      node.querySelector('.signalProjectedStopLoss').textContent = fmtNum(alert.candidate.stopLoss, 2);
      node.querySelector('.signalProjectedStopLossNote').textContent = formatProjectionNote(
        alert.candidate.entry,
        alert.candidate.stopLoss,
        'stop'
      );
      node.querySelector('.signalBias').textContent = signalBiasLabel(alert);
      node.querySelector('.oneMinuteConfidence').textContent = fmtNum(alert.candidate.oneMinuteConfidence, 2);
      node.querySelector('.rr').textContent = calcRr(
        alert.candidate.entry,
        alert.candidate.stopLoss,
        alert.candidate.takeProfit?.[0]
      );
      const whySignal = formatSignalWhy(alert);
      const blockedReason =
        alert.riskDecision.reasonCodes.length > 0
          ? `Guardrails: ${alert.riskDecision.reasonCodes.map(humanizeRiskReason).join(' • ')}`
          : null;
      node.querySelector('.signalReasons').textContent = blockedReason ? `${whySignal} • ${blockedReason}` : whySignal;
      node.querySelector('.signalIntentHint').textContent = alert.executionIntentId
        ? `Approval log ${alert.executionIntentId.slice(0, 8)}`
        : 'Manual entry only';
      const detectedAtLabel = alert.reviewState?.acknowledgedAt
        ? `${fmtDateTime(alert.detectedAt)} • Ack ${fmtDateTime(alert.reviewState.acknowledgedAt)}`
        : fmtDateTime(alert.detectedAt);
      node.querySelector('.detectedAt').textContent = detectedAtLabel;

      const statePill = node.querySelector('.signalState');
      if (alert.reviewState?.acknowledgedAt) {
        statePill.textContent = 'SEEN';
        statePill.classList.add('REVIEWED');
      } else {
        statePill.textContent = alert.riskDecision.allowed ? 'READY' : 'WAIT';
        statePill.classList.add(alert.riskDecision.allowed ? 'READY' : 'BLOCKED');
      }

      const evidenceEl = node.querySelector('.signalEvidence');
      signalEvidenceTags(alert).forEach((tag) => {
        const chip = document.createElement('span');
        chip.className = 'evidence-chip';
        chip.textContent = tag;
        evidenceEl.appendChild(chip);
      });

      const ackBtn = node.querySelector('.acknowledgeBtn');
      const reviewBtn = node.querySelector('.reviewSignalBtn');
      if (alert.reviewState?.acknowledgedAt) {
        ackBtn.disabled = true;
        ackBtn.textContent = 'Seen';
      } else {
        ackBtn.addEventListener('click', () => acknowledgeAlert(alert.alertId, ackBtn));
      }

      reviewBtn.addEventListener('click', () => {
        routeToSignalAlert(alert.alertId, 'reviews');
        setActiveTab('reviews');
      });
      reviewBtn.textContent = 'Open Review';

      if (activeRouteAlertId && alert.alertId === activeRouteAlertId) {
        node.classList.add('is-focus');
        focusedNode = node;
      }

      alertsListEl.appendChild(node);
    });
    updateStats();

    if (focusedNode) {
      focusedNode.scrollIntoView({
        block: 'center',
        behavior: document.documentElement.classList.contains('reduce-motion') ? 'auto' : 'smooth'
      });
      setStatus('Status: routed to the alert that triggered your notification.');
      focusedAlertId = activeRouteAlertId;
    }
  } catch (error) {
    latestAlerts = [];
    updateStats();
    renderEmpty(alertsListEl, `Failed to load signals: ${error.message}`);
  }
};

const approveIntent = async (intentId, buttonEl) => {
  const approvedBy = approvedByInput.value.trim();
  if (!approvedBy) {
    setStatus('Status: add your approver name first', true);
    setActiveTab('pending');
    return;
  }

  if (!manualChecklistConfirmInput.checked) {
    setStatus('Status: checklist confirmation is required before approval', true);
    setActiveTab('pending');
    return;
  }

  localStorage.setItem(APPROVER_KEY, approvedBy);
  localStorage.setItem(CHECKLIST_KEY, 'true');
  buttonEl.disabled = true;
  buttonEl.textContent = 'Confirming...';

  try {
    await apiFetch('/execution/approve', {
      method: 'POST',
      body: JSON.stringify({
        intentId,
        approvedBy,
        manualChecklistConfirmed: true,
        paperAccountConfirmed: true,
        now: new Date().toISOString()
      })
    });

    vibrateLight();
    await Promise.all([loadPending(), loadTrades()]);
    setStatus('Status: setup approved - execute it manually in Tradovate');
  } catch (error) {
    buttonEl.disabled = false;
    buttonEl.textContent = 'Approve (Manual Execute)';
    setStatus(`Status: approval failed (${error.message})`, true);
  }
};

const loadPending = async () => {
  try {
    const { intents } = await apiFetch('/execution/pending');
    latestPending = intents ?? [];
    pendingListEl.innerHTML = '';

    if (!latestPending.length) {
      renderEmpty(pendingListEl, 'No pending approvals right now.');
      updateStats();
      return;
    }

    latestPending
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .forEach((intent) => {
        const node = pendingTemplate.content.firstElementChild.cloneNode(true);
        node.querySelector('.symbol').textContent = `${intent.symbol} ${intent.side}`;
        node.querySelector('.setupType').textContent = setupLabel(intent.setupType);
        node.querySelector('.entry').textContent = fmtNum(intent.entry, 2);
        node.querySelector('.stopLoss').textContent = fmtNum(intent.stopLoss, 2);
        node.querySelector('.takeProfit').textContent = intent.takeProfit.map((tp) => fmtNum(tp, 2)).join(' / ');
        node.querySelector('.rr').textContent = calcRr(intent.entry, intent.stopLoss, intent.takeProfit[0]);
        node.querySelector('.riskPct').textContent = fmtNum(intent.riskPct, 2);
        node.querySelector('.quantity').textContent = fmtNum(intent.quantity, 2);
        node.querySelector('.createdAt').textContent = fmtDateTime(intent.createdAt);

        const approveBtn = node.querySelector('.approveBtn');
        approveBtn.addEventListener('click', () => approveIntent(intent.intentId, approveBtn));

        pendingListEl.appendChild(node);
      });

    updateStats();
  } catch (error) {
    latestPending = [];
    updateStats();
    renderEmpty(pendingListEl, `Failed to load pending intents: ${error.message}`);
  }
};

const loadTrades = async () => {
  try {
    const { trades, events } = await apiFetch('/journal/trades');
    latestTrades = trades ?? [];
    latestEvents = events ?? [];
    tradesListEl.innerHTML = '';

    if (!latestTrades.length) {
      renderEmpty(tradesListEl, 'No trades recorded yet.');
      renderInsights();
      updateStats();
      return;
    }

    latestTrades
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 30)
      .forEach((trade) => {
        const node = tradeTemplate.content.firstElementChild.cloneNode(true);
        node.querySelector('.symbol').textContent = `${trade.symbol} ${trade.side}`;
        node.querySelector('.setupType').textContent = setupLabel(trade.setupType);
        node.querySelector('.riskPct').textContent = fmtNum(trade.riskPct, 2);
        node.querySelector('.intentId').textContent = trade.intentId.slice(0, 8);
        node.querySelector('.createdAt').textContent = fmtDateTime(trade.createdAt);
        node.querySelector('.approvedAt').textContent = fmtDateTime(trade.approvedAt);

        const statusPill = node.querySelector('.tradeStatus');
        statusPill.textContent = trade.status;
        statusPill.classList.add(trade.status);

        tradesListEl.appendChild(node);
      });

    renderInsights();
    updateStats();
  } catch (error) {
    latestTrades = [];
    latestEvents = [];
    renderInsights();
    updateStats();
    renderEmpty(tradesListEl, `Failed to load trades: ${error.message}`);
  }
};

const saveReview = async (review, buttonEl) => {
  const card = buttonEl.closest('.review-card');
  const validity = card.querySelector('.reviewValidity').value || undefined;
  const outcome = card.querySelector('.reviewOutcome').value || undefined;
  const notes = card.querySelector('.reviewNotes').value.trim();
  const reviewedBy = approvedByInput.value.trim() || localStorage.getItem(APPROVER_KEY) || '';

  if (!validity && !outcome && !notes) {
    setStatus('Status: add a validity, outcome, or note before saving a review', true);
    return;
  }

  buttonEl.disabled = true;
  buttonEl.textContent = 'Saving...';

  try {
    await apiFetch('/signals/reviews', {
      method: 'POST',
      body: JSON.stringify({
        alertId: review.alertId,
        ...(validity ? { validity } : {}),
        ...(outcome ? { outcome } : {}),
        ...(notes ? { notes } : {}),
        ...(reviewedBy ? { reviewedBy } : {})
      })
    });

    vibrateLight();
    await Promise.all([loadReviews(), loadTrades(), loadDiagnostics()]);
    setStatus('Status: review saved');
  } catch (error) {
    setStatus(`Status: review save failed (${error.message})`, true);
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = 'Save Review';
  }
};

const renderReviewCard = (review) => {
  const node = reviewTemplate.content.firstElementChild.cloneNode(true);
  const chartSnapshot = review.alertSnapshot?.chartSnapshot;
  node.querySelector('.symbol').textContent = `${review.symbol} ${review.side}`;
  node.querySelector('.setupType').textContent = setupLabel(review.setupType);
  const reviewChartEl = node.querySelector('.reviewSnapshotChart');
  reviewChartEl.innerHTML = renderSignalChartMarkup(chartSnapshot);
  configureExpandableChart(
    reviewChartEl,
    `${review.symbol} ${review.side} • ${setupLabel(review.setupType)}`,
    `${chartSnapshot?.timeframe ?? '5m'} replay snapshot • swipe down to return`
  );
  node.querySelector('.reviewEntry').textContent = fmtNum(review.alertSnapshot?.candidate?.entry, 2);
  node.querySelector('.reviewStopLoss').textContent = fmtNum(review.alertSnapshot?.candidate?.stopLoss, 2);
  node.querySelector('.reviewTakeProfitOne').textContent = fmtNum(review.alertSnapshot?.candidate?.takeProfit?.[0], 2);
  node.querySelector('.reviewProjectedTakeProfit').textContent = fmtNum(
    review.alertSnapshot?.candidate?.takeProfit?.[0],
    2
  );
  node.querySelector('.reviewProjectedTakeProfitNote').textContent = formatProjectionNote(
    review.alertSnapshot?.candidate?.entry,
    review.alertSnapshot?.candidate?.takeProfit?.[0],
    'target'
  );
  node.querySelector('.reviewProjectedStopLoss').textContent = fmtNum(review.alertSnapshot?.candidate?.stopLoss, 2);
  node.querySelector('.reviewProjectedStopLossNote').textContent = formatProjectionNote(
    review.alertSnapshot?.candidate?.entry,
    review.alertSnapshot?.candidate?.stopLoss,
    'stop'
  );
  node.querySelector('.reviewSnapshotTimeframe').textContent = chartSnapshot?.timeframe ?? '--';
  node.querySelector('.reviewSnapshotNote').textContent = chartSnapshot?.generatedAt
    ? `Saved at ${fmtTime(chartSnapshot.generatedAt)}`
    : 'No saved trigger snapshot';
  node.querySelector('.signalScore').textContent = fmtNum(
    review.alertSnapshot?.candidate?.finalScore ?? review.alertSnapshot?.candidate?.baseScore,
    1
  );
  node.querySelector('.signalRisk').textContent = review.alertSnapshot?.riskDecision?.allowed
    ? `${fmtNum(review.alertSnapshot.riskDecision.finalRiskPct, 2)}%`
    : 'Blocked';
  node.querySelector('.signalConfidence').textContent = fmtNum(
    review.alertSnapshot?.candidate?.oneMinuteConfidence,
    2
  );
  node.querySelector('.detectedAt').textContent = fmtDateTime(review.detectedAt);
  node.querySelector('.reviewValidity').value = review.validity ?? '';
  node.querySelector('.reviewOutcome').value = review.outcome ?? '';
  node.querySelector('.reviewNotes').value = review.notes ?? '';
  node.querySelector('.reviewUpdatedAt').textContent = review.reviewedAt
    ? `Reviewed ${fmtDateTime(review.reviewedAt)}`
    : review.autoLabeledAt
      ? `Auto-read ${fmtDateTime(review.autoLabeledAt)}`
      : 'Not reviewed yet';
  node.querySelector('.reviewedByHint').textContent = review.reviewedBy ? `by ${review.reviewedBy}` : '';

  const statusPill = node.querySelector('.reviewStatus');
  const statusLabel =
    review.validity === 'INVALID'
      ? 'INVALID'
      : review.outcome === 'MISSED'
        ? 'MISSED'
        : review.autoOutcome && review.reviewStatus !== 'COMPLETED'
          ? 'AUTO'
        : review.reviewStatus === 'COMPLETED'
          ? 'REVIEWED'
          : 'NEW';
  statusPill.textContent = statusLabel;
  statusPill.classList.add(statusLabel);

  const saveBtn = node.querySelector('.saveReviewBtn');
  saveBtn.textContent = review.reviewStatus === 'COMPLETED' ? 'Update Review' : 'Save Review';
  saveBtn.addEventListener('click', () => saveReview(review, saveBtn));

  return node;
};

const loadReviews = async () => {
  try {
    const { reviews, summary } = await apiFetch('/signals/reviews?status=ALL&limit=80');
    latestReviews = reviews ?? [];
    reviewSummary = summary ?? { pending: 0, completed: 0, total: 0 };

    reviewsPendingListEl.innerHTML = '';
    reviewsCompletedListEl.innerHTML = '';

    const pending = latestReviews.filter((review) => review.reviewStatus === 'PENDING');
    const completed = latestReviews.filter((review) => review.reviewStatus === 'COMPLETED');

    if (!pending.length) {
      renderEmpty(reviewsPendingListEl, 'No pending reviews. New signals will queue here automatically.');
    } else {
      pending.forEach((review) => {
        reviewsPendingListEl.appendChild(renderReviewCard(review));
      });
    }

    if (!completed.length) {
      renderEmpty(reviewsCompletedListEl, 'No completed reviews yet.');
    } else {
      completed.slice(0, 12).forEach((review) => {
        reviewsCompletedListEl.appendChild(renderReviewCard(review));
      });
    }

    renderReviewInsights();
    updateStats();
  } catch (error) {
    latestReviews = [];
    reviewSummary = { pending: 0, completed: 0, total: 0 };
    renderReviewInsights();
    updateStats();
    renderEmpty(reviewsPendingListEl, `Failed to load reviews: ${error.message}`);
    renderEmpty(reviewsCompletedListEl, 'Review history unavailable.');
  }
};

const refreshAll = async () => {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshAllBtn.disabled = true;
  if (pullRefreshMetaEl && !pullRefreshGesture.refreshing) {
    pullRefreshMetaEl.textContent = pullRefreshMetaText('Syncing');
  }
  refreshInFlight = Promise.all([
    loadHealth(),
    loadAlerts(),
    loadPending(),
    loadTrades(),
    loadReviews(),
    loadDiagnostics(),
    loadRiskConfig()
  ])
    .then(() => {
      lastSyncAt = new Date().toISOString();
      updateStats();
      if (pullRefreshMetaEl) {
        pullRefreshMetaEl.textContent = pullRefreshMetaText('Updated');
      }
    })
    .finally(() => {
      refreshAllBtn.disabled = false;
      refreshInFlight = null;
    });

  return refreshInFlight;
};

const bindPullToRefresh = () => {
  if (!pullRefreshEl || !pullRefreshLabelEl || !('ontouchstart' in window)) {
    return;
  }

  const cancelPull = () => {
    pullRefreshGesture.active = false;
    if (!pullRefreshGesture.refreshing) {
      resetPullRefreshUi();
    }
  };

  const handleStart = (event) => {
    if (pullRefreshGesture.refreshing || refreshInFlight || event.touches.length !== 1 || currentScrollTop() > 2) {
      return;
    }
    if (isInteractivePullTarget(event.target)) {
      return;
    }

    const touch = event.touches[0];
    pullRefreshGesture.active = true;
    pullRefreshGesture.startX = touch.clientX;
    pullRefreshGesture.startY = touch.clientY;
    pullRefreshGesture.distance = 0;
  };

  const handleMove = (event) => {
    if (event.touches.length > 1) {
      cancelPull();
      return;
    }

    if (!pullRefreshGesture.active || pullRefreshGesture.refreshing || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - pullRefreshGesture.startX;
    const deltaY = touch.clientY - pullRefreshGesture.startY;

    if (currentScrollTop() > 2 || deltaY <= 0 || Math.abs(deltaX) > deltaY) {
      if (pullRefreshGesture.distance > 0) {
        resetPullRefreshUi();
      }
      pullRefreshGesture.active = false;
      return;
    }

    const distance = easedPullDistance(deltaY);
    if (distance < 6) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    pullRefreshGesture.distance = distance;
    updatePullRefreshUi(distance);
  };

  const finishPull = async () => {
    if (!pullRefreshGesture.active || pullRefreshGesture.refreshing) {
      return;
    }

    const shouldRefresh = pullRefreshGesture.distance >= PULL_REFRESH_TRIGGER_PX;
    pullRefreshGesture.active = false;

    if (!shouldRefresh) {
      resetPullRefreshUi();
      return;
    }

    pullRefreshGesture.refreshing = true;
    document.body.classList.remove('is-pulling');
    document.body.classList.add('is-refreshing');
    pullRefreshEl.classList.add('is-active', 'is-refreshing');
    pullRefreshEl.classList.remove('is-armed');
    pullRefreshLabelEl.textContent = 'Refreshing';
    if (pullRefreshMetaEl) {
      pullRefreshMetaEl.textContent = 'Updating signals, reviews, and health';
    }
    setPullRefreshDistance(PULL_REFRESH_SETTLE_PX);

    try {
      await refreshAll();
      vibrateLight();
    } finally {
      pullRefreshGesture.refreshing = false;
      resetPullRefreshUi();
    }
  };

  window.addEventListener('touchstart', handleStart, { passive: true });
  window.addEventListener('touchmove', handleMove, { passive: false });
  window.addEventListener('touchend', () => {
    void finishPull();
  });
  window.addEventListener('touchcancel', cancelPull);
};

const bindUiPreferenceControls = () => {
  const nextPrefs = () => ({
    theme: themePresetEl.value,
    density: densityPresetEl.value,
    textScale: Number(textScaleEl.value),
    reduceMotion: reduceMotionEl.checked
  });

  const onChange = () => {
    const prefs = nextPrefs();
    applyUiPrefs(prefs);
    saveUiPrefs(prefs);
  };

  themePresetEl.addEventListener('change', onChange);
  densityPresetEl.addEventListener('change', onChange);
  textScaleEl.addEventListener('input', onChange);
  reduceMotionEl.addEventListener('change', onChange);

  resetUiPrefsEl.addEventListener('click', () => {
    applyUiPrefs(defaultUiPrefs);
    saveUiPrefs(defaultUiPrefs);
  });
};

const bindNotificationControls = () => {
  const prefs = getNotificationPrefs();
  notificationToggleEl.checked = prefs.enabled;
  const isNativeApp = Boolean(window.Capacitor?.isNativePlatform?.());

  notificationToggleEl.addEventListener('change', async () => {
    const next = { enabled: notificationToggleEl.checked };
    saveNotificationPrefs(next);

    if (next.enabled) {
      const granted = await requestNotificationPermission();
      if (granted && !hasNativePush()) {
        await syncRemotePushSubscription().catch(() => false);
      }
      setStatus(
        granted
          ? isNativeApp && !nativePushServerReady
            ? 'Status: local permissions enabled. Remote signal alerts continue through Telegram or the hosted app.'
            : 'Status: signal notifications enabled'
          : 'Status: notifications blocked at device/browser level',
        !granted
      );
      updateSystemSummary();
      renderStatusRail();
      return;
    }

    const nativeToken = getNativePushToken();
    if (nativeToken) {
      await apiFetch('/notifications/native/unregister', {
        method: 'POST',
        body: JSON.stringify({
          deviceToken: nativeToken
        })
      }).catch(() => null);
      saveNativePushToken('');
    }

    await unsubscribeRemotePushSubscription().catch(() => false);
    setStatus('Status: signal notifications disabled on this device');
    updateSystemSummary();
    renderStatusRail();
  });

  sendTestAppAlertEl?.addEventListener('click', async () => {
    await sendTestAppAlert();
  });
};

const bindSignalSettingsControls = () => {
  applyMorningPresetEl.addEventListener('click', () => {
    const preset = recommendedMorningPreset();
    renderSignalSettings({
      ...(signalSettings ?? {}),
      ...preset,
      enabledSymbols: signalSettings?.enabledSymbols ?? ['NQ', 'ES'],
      enabledSetups:
        signalSettings?.enabledSetups ?? [
          'LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION',
          'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES',
          'DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION',
          'NY_BREAK_RETEST_MOMENTUM',
          'WERLEIN_FOREVER_MODEL'
        ]
    });
    setStatus('Status: optimal morning preset loaded. Save to apply.');
  });

  saveSignalSettingsEl.addEventListener('click', async () => {
    const payload = currentSignalSettingsPayload();
    if (payload.enabledSymbols.length === 0) {
      setStatus('Status: enable at least one symbol', true);
      return;
    }
    if (payload.enabledSetups.length === 0) {
      setStatus('Status: enable at least one setup', true);
      return;
    }

    saveSignalSettingsEl.disabled = true;
    saveSignalSettingsEl.textContent = 'Saving...';

    try {
      const { config } = await apiFetch('/signals/config', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      renderSignalSettings(config);
      await Promise.all([loadDiagnostics(), loadAlerts()]);
      setStatus('Status: signal rules updated');
    } catch (error) {
      setStatus(`Status: failed to save signal rules (${error.message})`, true);
    } finally {
      saveSignalSettingsEl.disabled = false;
      saveSignalSettingsEl.textContent = 'Save Signal Rules';
    }
  });
};

const bindStatusRecoveryControls = () => {
  ibkrRetryLoginEl?.addEventListener('click', async () => {
    ibkrRetryLoginEl.disabled = true;
    ibkrRetryLoginEl.textContent = 'Retrying...';
    setStatus('Status: sending full recovery request to the server...');
    try {
      const response = await apiFetch('/ibkr/recovery/retry-login', {
        method: 'POST'
      });
      const result = response?.result ?? {};
      const loginAttempt = result.loginAttempt ?? {};
      const resendAttempt = result.resendAttempt ?? {};
      const loginReason = getRecoveryAttemptReason(loginAttempt);
      const resendReason = getRecoveryAttemptReason(resendAttempt);
      setStatus(
        response?.ok
          ? 'Status: server recovery submitted. Telegram and the recovery timeline will show each server-side step.'
          : loginAttempt.skipped
            ? `Status: server login retry skipped. ${loginReason || 'Please wait a few seconds and try again.'}`
            : resendAttempt.ok
              ? 'Status: server login retry did not resubmit credentials, but Gateway still ran the built-in broker fallback controls.'
            : `Status: server recovery did not complete.${loginReason ? ` Login: ${loginReason}.` : ''}${resendReason ? ` Fallback: ${resendReason}.` : ''}`,
        !response?.ok
      );
      await loadDiagnostics();
    } catch (error) {
      setStatus(`Status: retry login failed (${error.message})`, true);
    } finally {
      ibkrRetryLoginEl.disabled = false;
      ibkrRetryLoginEl.textContent = 'Run Full Recovery';
    }
  });

  ibkrResendPushEl?.addEventListener('click', async () => {
    ibkrResendPushEl.disabled = true;
    ibkrResendPushEl.textContent = 'Running...';
    setStatus('Status: asking the server to run the broker fallback...');
    try {
      const response = await apiFetch('/ibkr/recovery/resend-push', {
        method: 'POST'
      });
      const result = response?.result ?? {};
      const resendReason = getRecoveryAttemptReason(result);
      setStatus(
        result.ok
          ? 'Status: broker fallback ran on the server. Telegram and the recovery timeline will show the next step.'
          : `Status: broker fallback could not be triggered.${resendReason ? ` ${resendReason}.` : ''}`,
        !result.ok
      );
      await loadDiagnostics();
    } catch (error) {
      setStatus(`Status: resend push failed (${error.message})`, true);
    } finally {
      ibkrResendPushEl.disabled = false;
      ibkrResendPushEl.textContent = 'Run Broker Fallback';
    }
  });

  ibkrWebsiteFallbackEl?.addEventListener('click', () => {
    const recoveryUrl =
      latestDiagnostics?.diagnostics?.ibkrRecovery?.lastResortWebsiteUrl
      ?? latestDiagnostics?.diagnostics?.ibkrRecovery?.websiteFallbackUrl
      ?? defaultIbkrWebsiteUrl;
    window.open(recoveryUrl, '_blank', 'noopener,noreferrer');
  });
};

const bootstrap = async () => {
  const prefs = getUiPrefs();
  const routeState = parseRouteState();
  activeRouteAlertId = routeState.alertId;
  focusedAlertId = routeState.alertId;
  applyUiPrefs(prefs);
  bindUiPreferenceControls();
  bindNotificationControls();
  bindSignalSettingsControls();
  bindStatusRecoveryControls();
  bindChartLightbox();
  bindPullToRefresh();
  resetPullRefreshUi();
  bindLocalNotificationListeners();

  apiBaseInput.value = getApiBase();
  updateSystemSummary();
  renderStatusRail();
  approvedByInput.value = localStorage.getItem(APPROVER_KEY) || '';
  manualChecklistConfirmInput.checked = localStorage.getItem(CHECKLIST_KEY) === 'true';
  manualChecklistConfirmInput.addEventListener('change', () => {
    localStorage.setItem(CHECKLIST_KEY, manualChecklistConfirmInput.checked ? 'true' : 'false');
  });

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });
  quickActionButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.targetTab));
  });
  setActiveTab(routeState.tab ?? tabButtons.find((button) => button.classList.contains('is-active'))?.dataset.tab ?? 'signals');
  if (routeState.tab === 'status' && routeState.focus === 'ibkr-connection') {
    setTimeout(() => {
      ibkrRecoveryPanelEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
  }
  signalStatusFilterButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      signalFilters.status = button.dataset.statusFilter;
      updateSegmentedControls();
      await loadAlerts();
    });
  });
  signalSymbolFilterButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      signalFilters.symbol = button.dataset.symbolFilter;
      updateSegmentedControls();
      await loadAlerts();
    });
  });
  updateSegmentedControls();

  window.addEventListener('popstate', () => {
    const nextRoute = parseRouteState();
    activeRouteAlertId = nextRoute.alertId;
    focusedAlertId = nextRoute.alertId;
    if (nextRoute.tab) {
      setActiveTab(nextRoute.tab);
    }
    void refreshAll();
  });

  saveApiBaseBtn.addEventListener('click', async () => {
    const nextValue = apiBaseInput.value.trim();
    if (!nextValue) {
      setStatus('Status: provide a valid API URL', true);
      return;
    }
    setApiBase(nextValue);
    updateSystemSummary();
    await refreshAll();
  });

  refreshAllBtn.addEventListener('click', () => {
    void refreshAll();
  });

  await registerServiceWorker();

  await loadSignalSettings();
  await loadRiskConfig();
  await refreshAll();
  if (getNotificationPrefs().enabled) {
    const granted = await requestNotificationPermission();
    if (granted && !hasNativePush()) {
      void syncRemotePushSubscription().catch(() => false);
    }
  }

  window.setInterval(() => {
    void refreshAll();
  }, 30_000);
};

void bootstrap();
