const API_BASE_KEY = 'trading_mobile_api_base';
const APPROVER_KEY = 'trading_mobile_approver';
const CHECKLIST_KEY = 'trading_mobile_manual_checklist';
const UI_PREFS_KEY = 'trading_mobile_ui_prefs_v1';
const NOTIFICATION_PREFS_KEY = 'trading_mobile_notification_prefs_v1';
const SEEN_ALERT_IDS_KEY = 'trading_mobile_seen_alert_ids_v1';
const NATIVE_PUSH_TOKEN_KEY = 'trading_mobile_native_push_token_v1';
const TV_CHECKLISTS_KEY = 'trading_mobile_tv_checklists_v1';

const defaultUiPrefs = {
  theme: 'ocean',
  density: 'cozy',
  textScale: 100,
  reduceMotion: false
};

const defaultNotificationPrefs = {
  enabled: true
};

const tradingViewSymbolMap = {
  NQ: 'CME_MINI:NQ1!',
  ES: 'CME_MINI:ES1!'
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const tvChecklistFields = ['macro_clear', 'sweep_confirmed', 'structure_confirmed', 'rr_acceptable', 'session_valid'];

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
const homeSessionChipEl = document.getElementById('homeSessionChip');
const homeDirectionCardEl = document.getElementById('homeDirectionCard');
const homeBiasLabelEl = document.getElementById('homeBiasLabel');
const homeBiasDetailEl = document.getElementById('homeBiasDetail');
const homeBiasConfidenceEl = document.getElementById('homeBiasConfidence');
const homeBiasWindowEl = document.getElementById('homeBiasWindow');
const homeBiasReasonEl = document.getElementById('homeBiasReason');
const homeMacroReasonEl = document.getElementById('homeMacroReason');
const homeDirectionTagsEl = document.getElementById('homeDirectionTags');
const homeDeskBriefCardEl = document.getElementById('homeDeskBriefCard');
const homeDeskBriefStampEl = document.getElementById('homeDeskBriefStamp');
const homeDeskBriefHeadlineEl = document.getElementById('homeDeskBriefHeadline');
const homeDeskBriefSummaryEl = document.getElementById('homeDeskBriefSummary');
const homeDeskBriefActionsEl = document.getElementById('homeDeskBriefActions');
const homeDeskBriefReasonsEl = document.getElementById('homeDeskBriefReasons');
const homeDeskBriefWatchEl = document.getElementById('homeDeskBriefWatch');
const homeResearchLabStampEl = document.getElementById('homeResearchLabStamp');
const homeResearchLabHeadlineEl = document.getElementById('homeResearchLabHeadline');
const homeResearchBestThesisEl = document.getElementById('homeResearchBestThesis');
const homeResearchLatestInsightEl = document.getElementById('homeResearchLatestInsight');
const homeResearchHypothesesEl = document.getElementById('homeResearchHypotheses');
const homeDeckStampEl = document.getElementById('homeDeckStamp');
const homeWatchlistListEl = document.getElementById('homeWatchlistList');
const homeDeskStateEl = document.getElementById('homeDeskState');
const homeTopIdeaEl = document.getElementById('homeTopIdea');
const homeReplayStateEl = document.getElementById('homeReplayState');
const homeModelStateEl = document.getElementById('homeModelState');
const homeResearchStateEl = document.getElementById('homeResearchState');
const homeAlertStateEl = document.getElementById('homeAlertState');
const homePaperAccountCardEl = document.getElementById('homePaperAccountCard');
const homePaperBalanceEl = document.getElementById('homePaperBalance');
const homePaperPnlEl = document.getElementById('homePaperPnl');
const rhPortfolioValueEl = document.getElementById('rhPortfolioValue');
const rhPortfolioPnlEl = document.getElementById('rhPortfolioPnl');
const homePaperMetaEl = document.getElementById('homePaperMeta');
const homePaperChipEl = document.getElementById('homePaperChip');
const homePaperMarketChipEl = document.getElementById('homePaperMarketChip');
const homePaperSymbolsChipEl = document.getElementById('homePaperSymbolsChip');
const homePaperAutonomyStampEl = document.getElementById('homePaperAutonomyStamp');
const homePaperAutonomyHeadlineEl = document.getElementById('homePaperAutonomyHeadline');
const homePaperAutonomyBestThesisEl = document.getElementById('homePaperAutonomyBestThesis');
const homePaperAutonomyPerformanceEl = document.getElementById('homePaperAutonomyPerformance');
const homePaperAutonomyThesesEl = document.getElementById('homePaperAutonomyTheses');
const homePaperAutonomySymbolsEl = document.getElementById('homePaperAutonomySymbols');
const homePaperAutonomyStateEl = document.getElementById('homePaperAutonomyState');
const homePaperAutonomyStateNoteEl = document.getElementById('homePaperAutonomyStateNote');
const homeMacroSummaryEl = document.getElementById('homeMacroSummary');
const homeMacroListEl = document.getElementById('homeMacroList');
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
const learningProfileChipEl = document.getElementById('learningProfileChip');
const learningHeadlineEl = document.getElementById('learningHeadline');
const learningContextEl = document.getElementById('learningContext');
const learningResolvedRecordsEl = document.getElementById('learningResolvedRecords');
const learningRefreshStateEl = document.getElementById('learningRefreshState');
const learningTopWinReasonEl = document.getElementById('learningTopWinReason');
const learningTopLossReasonEl = document.getElementById('learningTopLossReason');
const learningBestEdgeEl = document.getElementById('learningBestEdge');
const learningBiggestDragEl = document.getElementById('learningBiggestDrag');
const learningResearchEdgeEl = document.getElementById('learningResearchEdge');
const learningAutonomyEdgeEl = document.getElementById('learningAutonomyEdge');
const learningFavoringListEl = document.getElementById('learningFavoringList');
const learningAvoidingListEl = document.getElementById('learningAvoidingList');
const setupMixEl = document.getElementById('setupMix');
const guardrailSummaryEl = document.getElementById('guardrailSummary');
const journalSummaryEl = document.getElementById('journalSummary');
const paperAccountChipEl = document.getElementById('paperAccountChip');
const paperHeroEquityEl = document.getElementById('paperHeroEquity');
const paperHeroPnlEl = document.getElementById('paperHeroPnl');
const paperHeroUpdatedEl = document.getElementById('paperHeroUpdated');
const paperHeroWindowEl = document.getElementById('paperHeroWindow');
const paperMarketStateChipEl = document.getElementById('paperMarketStateChip');
const paperSymbolsChipEl = document.getElementById('paperSymbolsChip');
const paperHeroSparklineEl = document.getElementById('paperHeroSparkline');
const paperBalanceEl = document.getElementById('paperBalance');
const paperUnrealizedEl = document.getElementById('paperUnrealized');
const paperRealizedEl = document.getElementById('paperRealized');
const paperHitRateEl = document.getElementById('paperHitRate');
const paperOpenCountEl = document.getElementById('paperOpenCount');
const paperClosedCountEl = document.getElementById('paperClosedCount');
const paperHeroMetaEl = document.getElementById('paperHeroMeta');
const paperOpenChipEl = document.getElementById('paperOpenChip');
const paperClosedChipEl = document.getElementById('paperClosedChip');
const paperOpenPositionsListEl = document.getElementById('paperOpenPositionsList');
const paperClosedTradesListEl = document.getElementById('paperClosedTradesList');

const themePresetEl = document.getElementById('themePreset');
const densityPresetEl = document.getElementById('densityPreset');
const textScaleEl = document.getElementById('textScale');
const reduceMotionEl = document.getElementById('reduceMotion');
const notificationToggleEl = document.getElementById('notificationToggle');
const paperMaxConcurrentTradesEl = document.getElementById('paperMaxConcurrentTrades');
const paperAutonomyModeEl = document.getElementById('paperAutonomyMode');
const paperAutonomyRiskPctEl = document.getElementById('paperAutonomyRiskPct');
const savePaperSettingsEl = document.getElementById('savePaperSettings');
const paperConfigMetaEl = document.getElementById('paperConfigMeta');
const sendTestAppAlertEl = document.getElementById('sendTestAppAlert');
const installWebAppEl = document.getElementById('installWebApp');
const webAppInstallStatusEl = document.getElementById('webAppInstallStatus');
const webAppInstallHintEl = document.getElementById('webAppInstallHint');
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
const diagResearchOverallEl = document.getElementById('diagResearchOverall');
const diagResearchLeadEl = document.getElementById('diagResearchLead');
const diagResearchConfidenceEl = document.getElementById('diagResearchConfidence');
const diagResearchComputedEl = document.getElementById('diagResearchComputed');
const diagResearchHitRateEl = document.getElementById('diagResearchHitRate');
const diagResearchPredictionsEl = document.getElementById('diagResearchPredictions');
const diagResearchWhyEl = document.getElementById('diagResearchWhy');
const diagResearchBestThesisEl = document.getElementById('diagResearchBestThesis');
const diagResearchHypothesesEl = document.getElementById('diagResearchHypotheses');
const diagResearchInsightEl = document.getElementById('diagResearchInsight');
const diagPaperAutonomyStatusEl = document.getElementById('diagPaperAutonomyStatus');
const diagPaperAutonomyIdeasEl = document.getElementById('diagPaperAutonomyIdeas');
const diagPaperAutonomyWinRateEl = document.getElementById('diagPaperAutonomyWinRate');
const diagPaperAutonomyPnlEl = document.getElementById('diagPaperAutonomyPnl');
const diagPaperAutonomyBestThesisEl = document.getElementById('diagPaperAutonomyBestThesis');
const diagPaperAutonomyLastIdeaEl = document.getElementById('diagPaperAutonomyLastIdea');
const diagPaperAutonomySymbolsEl = document.getElementById('diagPaperAutonomySymbols');
const diagPaperAutonomyThesesEl = document.getElementById('diagPaperAutonomyTheses');
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
const symbolDetailViewerEl = document.getElementById('symbolDetailViewer');
const symbolDetailViewerBackdropEl = document.getElementById('symbolDetailViewerBackdrop');
const symbolDetailViewerSheetEl = document.getElementById('symbolDetailViewerSheet');
const symbolDetailViewerTitleEl = document.getElementById('symbolDetailViewerTitle');
const symbolDetailViewerMetaEl = document.getElementById('symbolDetailViewerMeta');
const symbolDetailViewerTradingViewEl = document.getElementById('symbolDetailViewerTradingView');
const symbolDetailViewerCloseEl = document.getElementById('symbolDetailViewerClose');
const symbolDetailViewerPriceEl = document.getElementById('symbolDetailViewerPrice');
const symbolDetailViewerDirectionEl = document.getElementById('symbolDetailViewerDirection');
const symbolDetailViewerToneEl = document.getElementById('symbolDetailViewerTone');
const symbolDetailViewerFreshnessEl = document.getElementById('symbolDetailViewerFreshness');
const symbolDetailViewerMeterFillEl = document.getElementById('symbolDetailViewerMeterFill');
const symbolDetailViewerStatsEl = document.getElementById('symbolDetailViewerStats');
const symbolDetailViewerSetupEl = document.getElementById('symbolDetailViewerSetup');
const symbolDetailViewerReasonListEl = document.getElementById('symbolDetailViewerReasonList');
const symbolDetailViewerFrameEl = document.getElementById('symbolDetailViewerFrame');
const tradingViewViewerEl = document.getElementById('tradingViewViewer');
const tradingViewViewerBackdropEl = document.getElementById('tradingViewViewerBackdrop');
const tradingViewViewerSheetEl = document.getElementById('tradingViewViewerSheet');
const tradingViewViewerTitleEl = document.getElementById('tradingViewViewerTitle');
const tradingViewViewerMetaEl = document.getElementById('tradingViewViewerMeta');
const tradingViewViewerPlanEl = document.getElementById('tradingViewViewerPlan');
const tradingViewViewerFrameEl = document.getElementById('tradingViewViewerFrame');
const tradingViewViewerExternalEl = document.getElementById('tradingViewViewerExternal');
const tradingViewViewerCloseEl = document.getElementById('tradingViewViewerClose');

const tabButtons = [...document.querySelectorAll('.tab-btn')];
const views = {
  home: document.getElementById('view-home'),
  signals: document.getElementById('view-signals'),
  pending: document.getElementById('view-pending'),
  trades: document.getElementById('view-trades'),
  learning: document.getElementById('view-learning'),
  settings: document.getElementById('view-settings'),
  status: document.getElementById('view-status')
};

let latestAlerts = [];
let latestPending = [];
let latestTrades = [];
let latestEvents = [];
let latestReviews = [];
let latestDiagnostics = null;
let latestCalendar = null;
let latestDeskBrief = null;
let latestHomeDeck = null;
let latestRiskConfig = null;
let latestHealth = null;
let latestSelfLearningStatus = null;
let lastSyncAt = null;
const latestReplayLearningByAlertId = new Map();
let serviceWorkerRegistrationPromise = null;
let serviceWorkerMessageListenerBound = false;
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
let deferredInstallPrompt = null;
let activeRouteAlertId = null;
let focusedAlertId = null;
let localNotificationListenersBound = false;
let pullRefreshFrame = 0;
let chartLightboxListenersBound = false;
const chartLightboxContext = new WeakMap();
let tradingViewViewerBound = false;
let tradingViewViewerContext = null;

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
  offsetY: 0,
  scrollTop: 0
};
let symbolDetailViewerBound = false;
let symbolDetailViewerContext = null;

const setupToggleMap = {
  LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION: setupSweepMssToggleEl,
  LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES: setupSweepRevToggleEl,
  DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION: setupObToggleEl,
  NY_BREAK_RETEST_MOMENTUM: setupBreakRetestToggleEl,
  WERLEIN_FOREVER_MODEL: setupWerleinToggleEl
};

const fallbackApiBase = window.location.origin;
const defaultIbkrWebsiteUrl = 'https://www.interactivebrokers.com/en/general/qr-code-ibkr-mobile-routing.php';
const tradingViewWidgetScriptUrl = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

const isStandaloneWebApp = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIosBrowser = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || '');

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

const isPaperLabeledReview = (review) => review?.autoLabeledBy === 'paper-trading-engine';

const paperOutcomeBadgeLabel = (review) => {
  if (!isPaperLabeledReview(review)) {
    return null;
  }

  const outcome = review?.autoOutcome ?? review?.effectiveOutcome;
  if (outcome === 'WOULD_WIN') {
    return 'Paper result • Win';
  }
  if (outcome === 'WOULD_LOSE') {
    return 'Paper result • Loss';
  }
  if (outcome === 'BREAKEVEN') {
    return 'Paper result • Breakeven';
  }
  return 'Paper result';
};

const replayLearningOutcome = (review) => {
  if (review?.outcome === 'WOULD_WIN') {
    return 'WIN';
  }
  if (review?.outcome === 'WOULD_LOSE') {
    return 'LOSS';
  }
  if (review?.outcome === 'BREAKEVEN') {
    return 'FLAT';
  }
  if (review?.validity === 'VALID') {
    return 'WIN';
  }
  if (review?.validity === 'INVALID') {
    return 'LOSS';
  }
  return null;
};

const researchThesisLabel = (thesis) => {
  switch (thesis) {
    case 'TREND_FLIP_DIRECTIONAL':
      return 'Trend Flip';
    case 'ALIGNED_CONTINUATION':
      return 'Aligned Continuation';
    case 'LEADERSHIP_BREAKOUT':
      return 'Leadership Breakout';
    case 'DIVERGENCE_RESOLUTION':
      return 'Divergence Resolution';
    default:
      return thesis ?? 'Research';
  }
};

const inferReplayResearchThesis = (review) => {
  const metadata = review?.alertSnapshot?.candidate?.metadata ?? {};
  const aligned = typeof metadata.researchTrendAligned === 'boolean' ? metadata.researchTrendAligned : undefined;
  const leadSymbol = metadata.researchTrendLeadSymbol;
  if (aligned === true) {
    return 'ALIGNED_CONTINUATION';
  }
  if (aligned === false) {
    return 'DIVERGENCE_RESOLUTION';
  }
  if (leadSymbol === review?.symbol) {
    return 'LEADERSHIP_BREAKOUT';
  }
  return 'TREND_FLIP_DIRECTIONAL';
};

const buildReplayLearningImpact = (review) => {
  const metadata = review?.alertSnapshot?.candidate?.metadata ?? {};
  const persisted = latestReplayLearningByAlertId.get(review?.alertId) ?? null;
  const outcome = replayLearningOutcome(review);
  const items = [];
  const details = [];

  if (review?.reviewStatus === 'COMPLETED') {
    const smcTone = outcome === 'WIN' ? 'is-positive' : outcome === 'LOSS' ? 'is-negative' : 'is-neutral';
    const smcLabel =
      outcome === 'WIN'
        ? 'SMC learned win'
        : outcome === 'LOSS'
          ? 'SMC learned loss'
          : outcome === 'FLAT'
            ? 'SMC learned breakeven'
            : 'SMC note captured';
    items.push({
      label: smcLabel,
      className: `pill replayLearningPill ${smcTone}`
    });
    details.push(
      outcome
        ? `SMC feedback updated from ${reviewValidityLabel(review.validity)} / ${reviewOutcomeLabel(review.outcome)}`
        : 'SMC captured your replay notes for future learning context'
    );
  }

  const autonomyOutcome = persisted?.paperAutonomy?.outcome ?? outcome;
  const autonomyThesis = persisted?.paperAutonomy?.thesis ?? metadata.autonomyThesis;
  if (review?.reviewStatus === 'COMPLETED' && autonomyThesis && autonomyOutcome) {
    items.push({
      label: `Paper ${persisted?.paperAutonomy?.thesisLabel ?? paperAutonomyThesisLabel(autonomyThesis)} ${autonomyOutcome.toLowerCase()}`,
      className: `pill replayLearningPill ${autonomyOutcome === 'WIN' ? 'is-positive' : autonomyOutcome === 'LOSS' ? 'is-negative' : 'is-neutral'}`
    });
    if (persisted?.paperAutonomy) {
      details.push(
        `Paper autonomy updated ${persisted.paperAutonomy.thesisLabel} • ${Math.round((persisted.paperAutonomy.thesisHitRate ?? 0) * 100)}% hit over ${persisted.paperAutonomy.thesisClosed ?? 0} closed ideas`
      );
    } else {
      details.push(`Paper autonomy logged ${paperAutonomyThesisLabel(autonomyThesis)} from this replay review`);
    }
  }

  const researchDirection =
    metadata.researchTrendDirection === 'BULLISH' || metadata.researchTrendDirection === 'BEARISH'
      ? metadata.researchTrendDirection
      : metadata.researchDirection === 'BULLISH' || metadata.researchDirection === 'BEARISH'
        ? metadata.researchDirection
        : null;
  const researchOutcome = persisted?.marketResearch?.outcome ?? (outcome === 'WIN' || outcome === 'LOSS' ? outcome : null);
  const researchThesis = persisted?.marketResearch?.thesis ?? inferReplayResearchThesis(review);
  if (review?.reviewStatus === 'COMPLETED' && researchDirection && researchOutcome) {
    items.push({
      label: `Research ${persisted?.marketResearch?.thesisLabel ?? researchThesisLabel(researchThesis)} ${researchOutcome.toLowerCase()}`,
      className: `pill replayLearningPill ${researchOutcome === 'WIN' ? 'is-positive' : 'is-negative'}`
    });
    if (persisted?.marketResearch) {
      details.push(
        `Research evaluated ${persisted.marketResearch.thesisLabel} • ${Math.round((persisted.marketResearch.hitRate ?? 0) * 100)}% hit across ${persisted.marketResearch.evaluatedPredictions ?? 0} episodes`
      );
    } else {
      details.push(
        `Research logged a ${researchDirectionLabel(researchDirection).toLowerCase()} ${researchThesisLabel(researchThesis).toLowerCase()} replay outcome`
      );
    }
  }

  return {
    items,
    engineCount: items.length,
    summary:
      details[0] ??
      'Save a replay review with a directional outcome to feed SMC, Paper Autonomy, and Research.',
    details
  };
};

const setupLabel = (code) => setupLabels[code] ?? code;
const reviewValidityLabel = (code) => reviewValidityLabels[code] ?? code ?? '--';
const reviewOutcomeLabel = (code) => reviewOutcomeLabels[code] ?? code ?? '--';
const researchDirectionLabel = (direction) => {
  switch (direction) {
    case 'BULLISH':
      return 'Bullish';
    case 'BEARISH':
      return 'Bearish';
    case 'BALANCED':
      return 'Balanced';
    case 'STAND_ASIDE':
      return 'Stand Aside';
    default:
      return '--';
  }
};

const readStoredJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeStoredJson = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const getTvChecklistStore = () => readStoredJson(TV_CHECKLISTS_KEY, {});

const getTvChecklistState = (alertId) => {
  const store = getTvChecklistStore();
  return store[alertId] ?? {};
};

const setTvChecklistState = (alertId, item, checked) => {
  const store = getTvChecklistStore();
  const next = {
    ...(store[alertId] ?? {}),
    [item]: checked
  };
  store[alertId] = next;
  writeStoredJson(TV_CHECKLISTS_KEY, store);
  return next;
};

const countTvChecklistChecks = (state) => tvChecklistFields.filter((field) => state[field]).length;

const buildTradingViewUrl = (symbol, interval = '5') => {
  const tvSymbol = tradingViewSymbolMap[symbol] ?? symbol;
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=${encodeURIComponent(interval)}`;
};

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

const researchAgreementMeta = (alertLike) => {
  const metadata = alertLike?.candidate?.metadata ?? {};
  const aligned = metadata.researchTrendAligned;
  const direction = metadata.researchTrendDirection;
  const confidence = Number(metadata.researchTrendConfidence);
  const leadSymbol = metadata.researchTrendLeadSymbol;
  const summary = metadata.researchTrendSummary;
  const confidenceLabel = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : null;

  if (aligned === true) {
    return {
      chips: [
        { label: 'Research aligned', className: 'chip chip-online' },
        {
          label: `Research ${researchDirectionLabel(direction)}${confidenceLabel ? ` ${confidenceLabel}` : ''}`,
          className: 'chip chip-neutral'
        }
      ],
      note: summary || `${leadSymbol ?? 'NQ/ES'} is supporting this setup.`
    };
  }

  if (aligned === false && (direction === 'BULLISH' || direction === 'BEARISH')) {
    return {
      chips: [
        { label: 'Research opposed', className: 'chip chip-offline' },
        {
          label: `Research ${researchDirectionLabel(direction)}${confidenceLabel ? ` ${confidenceLabel}` : ''}`,
          className: 'chip chip-neutral'
        }
      ],
      note: summary || `${leadSymbol ?? 'NQ/ES'} is leaning the other way.`
    };
  }

  if (direction === 'STAND_ASIDE') {
    return {
      chips: [{ label: 'Research says stand aside', className: 'chip chip-offline' }],
      note: summary || 'The autonomous engine does not trust a clean directional read right now.'
    };
  }

  return {
    chips: [{ label: 'Research neutral', className: 'chip chip-neutral' }],
    note: summary || 'The autonomous engine is not giving this setup a directional edge yet.'
  };
};

const renderResearchAgreement = (container, noteEl, alertLike) => {
  if (!container || !noteEl) {
    return;
  }

  const agreement = researchAgreementMeta(alertLike);
  container.innerHTML = '';
  agreement.chips.forEach((chipData) => {
    const chip = document.createElement('span');
    chip.className = chipData.className;
    chip.textContent = chipData.label;
    container.appendChild(chip);
  });
  noteEl.textContent = agreement.note;
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

const parseEconomicValue = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw || raw === '-') {
    return null;
  }

  let multiplier = 1;
  if (/k$/i.test(raw)) {
    multiplier = 1_000;
  } else if (/m$/i.test(raw)) {
    multiplier = 1_000_000;
  } else if (/b$/i.test(raw)) {
    multiplier = 1_000_000_000;
  }

  const numeric = Number.parseFloat(raw.replace(/,/g, '').replace(/[^\d.+-]/g, ''));
  return Number.isFinite(numeric) ? numeric * multiplier : null;
};

const isPolicySensitiveMacroTitle = (title) =>
  /CPI|PCE|PPI|CORE CPI|CORE PCE|CORE PPI|AVERAGE HOURLY|WAGES|EMPLOYMENT COST|FOMC|FED CHAIR|FEDERAL FUNDS|INTEREST RATE|POWELL/i.test(
    title || ''
  );

const isDirectUsdMacroEvent = (event) =>
  event?.currency === 'USD' || /FOMC|FED|POWELL|TREASURY|CPI|PCE|PPI|NFP|NON-FARM|PAYROLL|UNEMPLOYMENT|JOBLESS|GDP|PMI|RETAIL SALES/i.test(event?.title || '');

const isHighImpactEvent = (event) => (event?.importanceScore ?? 0) >= 3 || String(event?.impact ?? '').toLowerCase() === 'high';

const getMinutesUntil = (value) => {
  if (!value) {
    return null;
  }
  const diffMs = Date.parse(value) - Date.now();
  if (!Number.isFinite(diffMs)) {
    return null;
  }
  return Math.round(diffMs / 60000);
};

const formatMinutesUntil = (value) => {
  const minutes = getMinutesUntil(value);
  if (minutes === null) {
    return '--';
  }
  if (minutes <= 0) {
    return minutes >= -4 ? 'now' : `${Math.abs(minutes)} min ago`;
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
};

const interpretMacroEventForIndices = (event) => {
  if (!event) {
    return {
      tone: 'neutral',
      summary: 'No scheduled macro catalyst is near the desk window.',
      detail: 'Forex Factory is loaded, but there is no direct event pressing on NQ/ES right now.'
    };
  }

  const title = event.title ?? event.category ?? 'Economic event';
  const actual = parseEconomicValue(event.actual);
  const forecast = parseEconomicValue(event.forecast);
  const minutesUntil = getMinutesUntil(event.startsAt);
  const directUsd = isDirectUsdMacroEvent(event);
  const highImpact = isHighImpactEvent(event);

  if (minutesUntil !== null && minutesUntil >= -5 && minutesUntil <= 45 && directUsd && highImpact) {
    return {
      tone: 'event-risk',
      summary: `${title} is too close to trust a clean directional call.`,
      detail: `${title} is inside the risk window (${formatMinutesUntil(event.startsAt)}). Let the print or speaker hit first, then trust the board again.`
    };
  }

  if (actual !== null && forecast !== null && isPolicySensitiveMacroTitle(title) && directUsd) {
    if (actual > forecast) {
      return {
        tone: 'bearish',
        summary: `${title} came in hotter than forecast.`,
        detail: `Hotter policy-sensitive USD data usually pressures NQ/ES lower through yields. Actual ${event.actual} vs forecast ${event.forecast}.`
      };
    }
    if (actual < forecast) {
      return {
        tone: 'bullish',
        summary: `${title} came in softer than forecast.`,
        detail: `Softer policy-sensitive USD data usually supports NQ/ES if yields back off. Actual ${event.actual} vs forecast ${event.forecast}.`
      };
    }
  }

  if (directUsd && highImpact && minutesUntil !== null && minutesUntil > 45) {
    if (isPolicySensitiveMacroTitle(title)) {
      return {
        tone: 'neutral',
        summary: `${title} is the next policy-sensitive swing point.`,
        detail: `${title} is due in ${formatMinutesUntil(event.startsAt)}. A hotter print would usually pressure NQ/ES lower; a softer print would usually support upside. Until then, let the 5m board lead.`
      };
    }
    return {
      tone: 'neutral',
      summary: `${title} is the next direct macro swing point.`,
      detail: `${title} is scheduled in ${formatMinutesUntil(event.startsAt)}. It matters for US index futures, but it is not close enough yet to override the board.`
    };
  }

  if (/FOMC|FED CHAIR|POWELL|SPEAKS/i.test(title)) {
    return {
      tone: 'event-risk',
      summary: `${title} can reprice yields quickly, but the direction is headline-dependent.`,
      detail: 'Treat Fed speakers as regime risk, not as a pre-defined directional edge. Let the tape confirm before leaning hard.'
    };
  }

  if (highImpact) {
    return {
      tone: 'neutral',
      summary: `${title} is a high-impact macro event.`,
      detail: directUsd
        ? 'This can move NQ/ES directly, but the desk should still wait for structure instead of guessing the print.'
        : 'This is global macro risk. It can bleed into US index futures, but it is not a direct US release.'
    };
  }

  return {
    tone: 'neutral',
    summary: `${title} is on deck, but it is not a primary directional driver for the desk right now.`,
    detail: directUsd
      ? 'The event is tracked, but it is not strong enough by itself to overrule the board.'
      : 'This stays in the background unless broader risk sentiment picks it up.'
  };
};

const buildBoardPressure = (alerts) => {
  const workingAlerts = [...alerts]
    .sort((left, right) => {
      const scoreDelta = (Number(right?.candidate?.finalScore) || 0) - (Number(left?.candidate?.finalScore) || 0);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime();
    })
    .slice(0, 4);

  let bullish = 0;
  let bearish = 0;
  for (const [index, alert] of workingAlerts.entries()) {
    const weight = (index === 0 ? 2.4 : 1.4) + (alert.riskDecision?.allowed ? 0.8 : 0);
    if (alert.side === 'LONG') {
      bullish += weight;
    } else if (alert.side === 'SHORT') {
      bearish += weight;
    }
  }

  return {
    bullish,
    bearish,
    topAlert: workingAlerts[0] ?? null,
    readyAlerts: workingAlerts.filter((alert) => alert.riskDecision?.allowed)
  };
};

const renderDirectionTags = (tags) => {
  if (!homeDirectionTagsEl) {
    return;
  }

  homeDirectionTagsEl.innerHTML = '';
  tags.filter(Boolean).forEach((tag) => {
    const chip = document.createElement('span');
    chip.className = 'chip chip-neutral';
    chip.textContent = tag;
    homeDirectionTagsEl.appendChild(chip);
  });
};

const renderBriefList = (target, items, fallback) => {
  if (!target) {
    return;
  }

  target.innerHTML = '';
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) {
    const item = document.createElement('li');
    item.className = 'home-brief-item is-muted';
    item.textContent = fallback;
    target.appendChild(item);
    return;
  }

  values.forEach((value) => {
    const item = document.createElement('li');
    item.className = 'home-brief-item';
    item.textContent = value;
    target.appendChild(item);
  });
};

const renderDeskBrief = () => {
  if (!homeDeskBriefCardEl) {
    return;
  }

  const brief = latestDeskBrief?.brief ?? null;
  if (!brief) {
    homeDeskBriefCardEl.dataset.tone = 'neutral';
    homeDeskBriefHeadlineEl.textContent = 'Waiting for the desk brief.';
    homeDeskBriefSummaryEl.textContent = 'The app is loading the compact market summary.';
    if (homeDeskBriefStampEl) {
      homeDeskBriefStampEl.textContent = 'Updating';
    }
    renderBriefList(homeDeskBriefActionsEl, [], 'No action items yet.');
    renderBriefList(homeDeskBriefReasonsEl, [], 'No desk context yet.');
    if (homeDeskBriefWatchEl) {
      homeDeskBriefWatchEl.innerHTML = '';
      const chip = document.createElement('span');
      chip.className = 'chip chip-neutral';
      chip.textContent = 'Waiting for market context';
      homeDeskBriefWatchEl.appendChild(chip);
    }
    return;
  }

  homeDeskBriefCardEl.dataset.tone = brief.tone || 'neutral';
  homeDeskBriefHeadlineEl.textContent = brief.headline || 'Wait for a clean 5m setup.';
  homeDeskBriefSummaryEl.textContent = brief.summary || 'No desk summary available yet.';
  if (homeDeskBriefStampEl) {
    homeDeskBriefStampEl.textContent = brief.generatedAt ? `Updated ${fmtRelativeMinutes(brief.generatedAt)}` : 'Updated';
  }
  renderBriefList(homeDeskBriefActionsEl, brief.actions, 'No action items yet.');
  renderBriefList(homeDeskBriefReasonsEl, brief.reasons, 'No desk context yet.');

  if (homeDeskBriefWatchEl) {
    homeDeskBriefWatchEl.innerHTML = '';
    const watchItems = Array.isArray(brief.watch) ? brief.watch.filter(Boolean) : [];
    if (!watchItems.length) {
      const chip = document.createElement('span');
      chip.className = 'chip chip-neutral';
      chip.textContent = 'No immediate watch item';
      homeDeskBriefWatchEl.appendChild(chip);
    } else {
      watchItems.forEach((value) => {
        const chip = document.createElement('span');
        chip.className = 'chip chip-neutral';
        chip.textContent = value;
        homeDeskBriefWatchEl.appendChild(chip);
      });
    }
  }
};

const renderHomeDeck = () => {
  if (!homeWatchlistListEl) {
    return;
  }

  const deck = latestHomeDeck?.deck ?? null;
  if (homeDeckStampEl) {
    homeDeckStampEl.textContent = deck?.generatedAt ? `Updated ${fmtRelativeMinutes(deck.generatedAt)}` : 'Updating';
  }

  homeWatchlistListEl.innerHTML = '';
  if (!deck?.watchlist?.length) {
    renderEmpty(homeWatchlistListEl, 'Watchlist is loading.');
    return;
  }

  deck.watchlist.forEach((item) => {
    const trendDirection = item.researchDirection ?? 'BALANCED';
    const tone =
      trendDirection === 'BULLISH'
        ? 'bullish'
        : trendDirection === 'BEARISH'
          ? 'bearish'
          : deck.tone === 'risk'
            ? 'risk'
            : 'neutral';
    const confidence = Number.isFinite(Number(item.researchConfidence))
      ? `${Math.round(Number(item.researchConfidence) * 100)}%`
      : '--';
    const latestAlertLabel = item.latestAlert
      ? `${item.latestAlert.side} • ${setupLabel(item.latestAlert.setupType)}`
      : 'No live setup';
    const latestAlertState = item.latestAlert
      ? item.latestAlert.allowed
        ? 'Ready'
        : 'Blocked'
      : 'Watching';
    const latestScore =
      typeof item.latestAlert?.finalScore === 'number' ? `Score ${fmtNum(item.latestAlert.finalScore, 1)}` : 'No score';

    const card = document.createElement('article');
    card.className = 'home-watchlist-card';
    card.dataset.tone = tone;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Open ${item.symbol} detail`);
    card.innerHTML = `
      <div class="home-watchlist-head">
        <div>
          <div class="home-watchlist-symbol-row">
            <p class="home-watchlist-symbol">${escapeHtml(item.symbol)}</p>
            ${item.lead ? '<span class="chip chip-online">Lead</span>' : ''}
          </div>
          <p class="home-watchlist-setup">${escapeHtml(latestAlertLabel)}</p>
        </div>
        <div class="home-watchlist-price-block">
          <p class="home-watchlist-price">${escapeHtml(item.latestPrice !== null && item.latestPrice !== undefined ? fmtNum(item.latestPrice, 2) : '--')}</p>
          <span class="chip ${latestAlertState === 'Ready' ? 'chip-online' : latestAlertState === 'Blocked' ? 'chip-offline' : 'chip-neutral'}">${escapeHtml(latestAlertState)}</span>
        </div>
      </div>
      <div class="home-watchlist-meter">
        <span class="home-watchlist-meter-fill" style="width:${Math.max(8, Math.min(100, Number(item.researchConfidence ?? 0) * 100))}%"></span>
      </div>
      <div class="home-watchlist-meta">
        <span>${escapeHtml(`${researchDirectionLabel(trendDirection)} • ${confidence}`)}</span>
        <span>${escapeHtml(item.latestBarTimestamp ? fmtRelativeMinutes(item.latestBarTimestamp) : 'No bar')}</span>
      </div>
      <div class="home-watchlist-meta home-watchlist-meta-secondary">
        <span>${escapeHtml(latestScore)}</span>
        <span>Tap for detail</span>
      </div>
      <p class="home-watchlist-note">${escapeHtml(item.researchReason ?? 'Waiting for a clearer symbol-specific read.')}</p>
    `;
    const openDetail = () => openSymbolDetailViewer(item, deck);
    card.addEventListener('click', openDetail);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetail();
      }
    });
    homeWatchlistListEl.appendChild(card);
  });
};

const renderResearchHypothesisChips = (container, hypotheses, emptyText) => {
  if (!container) {
    return;
  }

  container.innerHTML = '';
  if (!Array.isArray(hypotheses) || hypotheses.length === 0) {
    const chip = document.createElement('span');
    chip.className = 'chip chip-neutral';
    chip.textContent = emptyText;
    container.appendChild(chip);
    return;
  }

  hypotheses.forEach((item) => {
    const chip = document.createElement('article');
    chip.className = 'research-hypothesis-chip';
    const confidence = Number(item.confidence);
    const confidenceLabel = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : '--';
    const directionTone =
      item.direction === 'BULLISH'
        ? 'chip-online'
        : item.direction === 'BEARISH'
          ? 'chip-offline'
          : 'chip-neutral';
    const evidence = Array.isArray(item.evidence) && item.evidence.length > 0 ? item.evidence.join(' • ') : 'Evidence is still building.';
    chip.innerHTML = `
      <div class="research-hypothesis-head">
        <span class="chip ${directionTone}">${escapeHtml(researchDirectionLabel(item.direction ?? 'BALANCED'))}</span>
        <span class="chip chip-neutral">${escapeHtml(confidenceLabel)}</span>
      </div>
      <p class="research-hypothesis-title">${escapeHtml(item.thesisLabel ?? item.label ?? 'Research hypothesis')}</p>
      <p class="research-hypothesis-meta">${escapeHtml(`${item.leadSymbol ? `${item.leadSymbol} leading • ` : ''}${item.openedAt ? `${fmtRelativeMinutes(item.openedAt)} • ` : ''}${item.horizonMinutes ? `${item.horizonMinutes}m horizon` : 'Monitoring'}`)}</p>
      <p class="research-hypothesis-copy">${escapeHtml(evidence)}</p>
    `;
    container.appendChild(chip);
  });
};

const renderHomeResearchLab = () => {
  const lab = latestHomeDeck?.deck?.researchLab ?? null;
  if (homeResearchLabStampEl) {
    homeResearchLabStampEl.textContent = latestHomeDeck?.deck?.generatedAt
      ? `Updated ${fmtRelativeMinutes(latestHomeDeck.deck.generatedAt)}`
      : 'Updating';
  }
  if (homeResearchLabHeadlineEl) {
    homeResearchLabHeadlineEl.textContent = lab?.bestThesis
      ? `${lab.bestThesis.label} leads the research book right now.`
      : lab?.activeHypothesesCount
        ? `${lab.activeHypothesesCount} live research hypotheses are open.`
        : 'Watching for the next autonomous thesis.';
  }
  if (homeResearchBestThesisEl) {
    homeResearchBestThesisEl.textContent = lab?.bestThesis
      ? `${lab.bestThesis.label} • ${Math.round(Number(lab.bestThesis.hitRate ?? 0) * 100)}% hit rate • ${lab.bestThesis.evaluated ?? 0}/${lab.bestThesis.total ?? 0} evaluated`
      : 'The research engine has not scored a thesis yet.';
  }
  if (homeResearchLatestInsightEl) {
    homeResearchLatestInsightEl.textContent = lab?.latestInsight
      ? `${lab.latestInsight.headline} • ${fmtRelativeMinutes(lab.latestInsight.at)}`
      : 'No recent research note yet.';
  }
  renderResearchHypothesisChips(
    homeResearchHypothesesEl,
    lab?.activeHypotheses ?? [],
    'No active hypotheses'
  );
};

const getPaperAccountStatus = () => latestDiagnostics?.diagnostics?.paperAccount ?? latestHomeDeck?.deck?.paperAccount ?? null;
const getPaperAutonomyStatus = () => latestDiagnostics?.diagnostics?.paperAutonomy ?? latestHomeDeck?.deck?.paperAutonomy ?? null;

const buildPaperRuntimeState = () => {
  const paper = latestDiagnostics?.diagnostics?.paperAccount ?? latestHomeDeck?.deck?.paperAccount ?? null;
  const marketSessionState =
    paper?.marketSessionState
      ?? latestDiagnostics?.diagnostics?.marketSessionState
      ?? latestHomeDeck?.deck?.paperAccount?.marketSessionState
      ?? null;
  const tradableSymbols = Array.isArray(paper?.tradableSymbols) && paper.tradableSymbols.length > 0
    ? paper.tradableSymbols
    : ['NQ', 'ES'];
  const marketOpen = marketSessionState === 'OPEN';

  return {
    marketSessionState,
    tradableSymbols,
    marketOpen,
    chipText: marketOpen ? 'Paper live: market open' : 'Paper paused: market closed',
    chipClass: `chip ${marketOpen ? 'chip-online' : 'chip-offline'}`,
    symbolText: `${tradableSymbols.join(' + ')} only`
  };
};

const formatDeskWindow = (session) => {
  if (!session) {
    return 'Window --';
  }
  const tzLabel = session.timezone === 'America/New_York' ? 'ET' : session.timezone;
  return `${formatTimeValue(session.startHour, session.startMinute)}-${formatTimeValue(session.endHour, session.endMinute)} ${tzLabel}`;
};

const paperAutonomyThesisLabel = (thesis) => {
  switch (thesis) {
    case 'TREND_BREAKOUT_EXPANSION':
      return 'Trend Breakout Expansion';
    case 'TREND_PULLBACK_RECLAIM':
      return 'Trend Pullback Reclaim';
    case 'RANGE_FADE_REVERSION':
      return 'Range Fade Reversion';
    case 'FAILED_BREAKOUT_REVERSAL':
      return 'Failed Breakout Reversal';
    case 'VOLATILITY_COMPRESSION_RELEASE':
      return 'Volatility Compression Release';
    default:
      return thesis ?? 'Autonomy thesis';
  }
};

const renderPaperAutonomyThesisCards = (container, items, emptyText) => {
  if (!container) {
    return;
  }

  container.innerHTML = '';
  if (!Array.isArray(items) || items.length === 0) {
    renderEmpty(container, emptyText);
    return;
  }

  items.forEach((item) => {
    const label = item.label ?? paperAutonomyThesisLabel(item.thesis);
    const openIdeas = Number(item.openIdeas ?? item.open ?? 0);
    const totalIdeas = Number(item.totalIdeas ?? item.total ?? openIdeas);
    const closedIdeas = Number(item.closed ?? Math.max(0, totalIdeas - openIdeas));
    const hitRate = Number(item.hitRate);
    const avgR = Number(item.avgR);
    const realizedPnl = Number(item.realizedPnl);
    const card = document.createElement('article');
    card.className = 'research-hypothesis-chip';
    card.innerHTML = `
      <div class="research-hypothesis-head">
        <span class="chip chip-neutral">${escapeHtml(`${openIdeas} open`)}</span>
        <span class="chip chip-neutral">${escapeHtml(`${totalIdeas} total`)}</span>
      </div>
      <p class="research-hypothesis-title">${escapeHtml(label)}</p>
      <p class="research-hypothesis-meta">${escapeHtml(item.lastOpenedAt ? `Last idea ${fmtRelativeMinutes(item.lastOpenedAt)}` : `${closedIdeas} closed ideas`)}</p>
      <p class="research-hypothesis-copy">${escapeHtml(
        Number.isFinite(hitRate)
          ? `${Math.round(hitRate * 100)}% hit rate${Number.isFinite(avgR) ? ` • ${fmtNum(avgR, 2)}R avg` : ''}${Number.isFinite(realizedPnl) ? ` • ${fmtSignedUsd(realizedPnl)}` : ''}`
          : 'Autonomy is still building evidence on this thesis.'
      )}</p>
    `;
    container.appendChild(card);
  });
};

const renderPaperAutonomySymbolCards = (container, items, emptyText) => {
  if (!container) {
    return;
  }

  container.innerHTML = '';
  if (!Array.isArray(items) || items.length === 0) {
    renderEmpty(container, emptyText);
    return;
  }

  items.forEach((item) => {
    const direction = item.direction ?? 'BALANCED';
    const directionTone =
      direction === 'BULLISH'
        ? 'chip-online'
        : direction === 'BEARISH'
          ? 'chip-offline'
          : 'chip-neutral';
    const confidence = Number(item.confidence);
    const confidenceLabel = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : '--';
    const openIdeas = Number(item.openIdeas ?? 0);
    const closedIdeas = Number(item.closedIdeas ?? 0);
    const realizedPnl = Number(item.realizedPnl);
    const card = document.createElement('article');
    card.className = 'research-hypothesis-chip';
    card.innerHTML = `
      <div class="research-hypothesis-head">
        <span class="chip ${directionTone}">${escapeHtml(researchDirectionLabel(direction))}</span>
        <span class="chip chip-neutral">${escapeHtml(confidenceLabel)}</span>
      </div>
      <p class="research-hypothesis-title">${escapeHtml(`${item.symbol} autonomy bias${item.exploratory ? ' • exploratory' : ''}`)}</p>
      <p class="research-hypothesis-meta">${escapeHtml(`${openIdeas} open • ${closedIdeas} closed${item.latestBarTimestamp ? ` • ${fmtRelativeMinutes(item.latestBarTimestamp)}` : ''}`)}</p>
      <p class="research-hypothesis-copy">${escapeHtml(item.reason ?? (Number.isFinite(realizedPnl) ? fmtSignedUsd(realizedPnl) : 'Autonomy is still reading this symbol.'))}</p>
    `;
    container.appendChild(card);
  });
};

const renderHomePaperAutonomy = () => {
  const autonomy = latestHomeDeck?.deck?.paperAutonomy ?? latestDiagnostics?.diagnostics?.paperAutonomy ?? null;
  const latestIdea = autonomy?.latestIdea ?? autonomy?.recentIdeas?.[0] ?? null;
  const bestThesis = autonomy?.bestThesis ?? null;
  const performance = autonomy?.performance ?? null;
  const symbolStatus = autonomy?.symbolStatus ?? [];

  if (homePaperAutonomyStampEl) {
    homePaperAutonomyStampEl.textContent = latestHomeDeck?.deck?.generatedAt
      ? `Updated ${fmtRelativeMinutes(latestHomeDeck.deck.generatedAt)}`
      : 'Updating';
  }
  if (homePaperAutonomyHeadlineEl) {
    homePaperAutonomyHeadlineEl.textContent = latestIdea
      ? `${latestIdea.symbol} ${latestIdea.side} • ${latestIdea.thesisLabel ?? paperAutonomyThesisLabel(latestIdea.thesis)}`
      : bestThesis
        ? `${bestThesis.label} is leading the autonomy book.`
        : 'Independent futures engine is scanning the desk window.';
  }
  if (homePaperAutonomyBestThesisEl) {
    homePaperAutonomyBestThesisEl.textContent = bestThesis
      ? `${bestThesis.label} • ${Math.round(Number(bestThesis.hitRate ?? 0) * 100)}% hit rate • ${fmtNum(bestThesis.avgR ?? 0, 2)}R avg`
      : 'No autonomy thesis has enough closed trades to score yet.';
  }
  if (homePaperAutonomyPerformanceEl) {
    homePaperAutonomyPerformanceEl.textContent = autonomy
      ? `${autonomy.openIdeas ?? 0} open • ${autonomy.closedIdeas ?? 0} closed • ${fmtSignedUsd(performance?.realizedPnl ?? 0)} • ${Math.round(Number(autonomy.winRate ?? 0) * 100)}% win`
      : 'Autonomy performance is loading.';
  }
  if (homePaperAutonomyStateEl) {
    homePaperAutonomyStateEl.textContent = autonomy
      ? `${autonomy.openIdeas ?? 0} live • ${fmtSignedUsd(performance?.realizedPnl ?? 0)}`
      : 'Loading';
  }
  if (homePaperAutonomyStateNoteEl) {
    homePaperAutonomyStateNoteEl.textContent = latestIdea?.reason
      ?? symbolStatus.find((item) => item.direction === 'BULLISH' || item.direction === 'BEARISH')?.reason
      ?? `Autonomy trades only inside ${formatDeskWindow(autonomy?.session)}.`;
  }

  renderPaperAutonomyThesisCards(
    homePaperAutonomyThesesEl,
    autonomy?.activeTheses ?? [],
    'No active autonomy thesis'
  );
  renderPaperAutonomySymbolCards(
    homePaperAutonomySymbolsEl,
    autonomy?.symbolStatus ?? [],
    'No autonomy symbol bias yet'
  );
};

const formatPaperTradeCap = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }
  return value <= 0 ? 'unlimited' : String(value);
};

const getReviewForAlert = (alertId) => latestReviews.find((review) => review.alertId === alertId) ?? null;

const getPaperLatestPrice = (symbol) => {
  const deckMatch = latestHomeDeck?.deck?.watchlist?.find((item) => item.symbol === symbol);
  if (typeof deckMatch?.latestPrice === 'number') {
    return deckMatch.latestPrice;
  }
  const researchMatch = latestDiagnostics?.diagnostics?.research?.symbols?.find((item) => item.symbol === symbol);
  return typeof researchMatch?.latestPrice === 'number' ? researchMatch.latestPrice : null;
};

const buildPaperEquitySeries = (paper) => {
  if (!paper || typeof paper.initialBalance !== 'number') {
    return [];
  }

  if (Array.isArray(paper.equityHistory) && paper.equityHistory.length > 1) {
    return paper.equityHistory
      .slice(-32)
      .map((point) => Number(point?.equity))
      .filter((value) => Number.isFinite(value));
  }

  let running = Number(paper.initialBalance) || 100000;
  const points = [running];
  const ordered = Array.isArray(paper.recentClosedTrades)
    ? [...paper.recentClosedTrades].sort(
        (a, b) => new Date(a.closedAt ?? a.submittedAt ?? 0).getTime() - new Date(b.closedAt ?? b.submittedAt ?? 0).getTime()
      )
    : [];

  ordered.forEach((trade) => {
    if (typeof trade.realizedPnl === 'number') {
      running += trade.realizedPnl;
      points.push(Number(running.toFixed(2)));
    }
  });

  if (typeof paper.equity === 'number') {
    points.push(Number(paper.equity.toFixed(2)));
  }

  return points.slice(-24);
};

const renderPaperSparkline = (container, points) => {
  if (!container) {
    return;
  }

  container.innerHTML = '';
  if (!Array.isArray(points) || points.length < 2) {
    const empty = document.createElement('div');
    empty.className = 'paper-sparkline-empty';
    empty.textContent = 'The equity curve will appear as the paper account logs more trades.';
    container.appendChild(empty);
    return;
  }

  const width = 320;
  const height = 96;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);
  const polyline = points
    .map((value, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(' ');
  const positive = points.at(-1) >= points[0];

  container.innerHTML = `
    <svg class="paper-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Paper account equity trend">
      <defs>
        <linearGradient id="paperSparklineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${positive ? '#00c087' : '#ff7f7f'}" stop-opacity="0.32"></stop>
          <stop offset="100%" stop-color="${positive ? '#00c087' : '#ff7f7f'}" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <polyline class="paper-sparkline-fill" points="${polyline} ${width},${height} 0,${height}"></polyline>
      <polyline class="paper-sparkline-line ${positive ? 'is-positive' : 'is-negative'}" points="${polyline}"></polyline>
    </svg>
  `;
};

const renderPaperTradeCards = (container, trades, emptyText, mode = 'open') => {
  if (!container) {
    return;
  }

  container.innerHTML = '';
  if (!Array.isArray(trades) || trades.length === 0) {
    renderEmpty(container, emptyText);
    return;
  }

  trades.forEach((trade) => {
    const review = getReviewForAlert(trade.alertId);
    const paperBadge = paperOutcomeBadgeLabel(review);
    const autonomyLabel = trade.autonomyThesis ? paperAutonomyThesisLabel(trade.autonomyThesis) : null;
    const autonomyReason = typeof trade.autonomyReason === 'string' ? trade.autonomyReason : null;
    const researchDirection =
      typeof trade.researchDirection === 'string' && trade.researchDirection.length > 0
        ? trade.researchDirection.replaceAll('_', ' ')
        : null;
    const markPrice = getPaperLatestPrice(trade.symbol);
    const hasMark = typeof markPrice === 'number';
    const hasFill = typeof trade.filledPrice === 'number';
    const openPnl =
      mode === 'open' && hasMark && hasFill
        ? ((markPrice - trade.filledPrice) * (trade.side === 'LONG' ? 1 : -1)) * (trade.quantity ?? 1)
        : null;
    const realizedPnl = typeof trade.realizedPnl === 'number' ? trade.realizedPnl : null;
    const pnlValue = mode === 'open' ? openPnl : realizedPnl;
    const pnlClass =
      typeof pnlValue === 'number' ? (pnlValue > 0 ? 'is-positive' : pnlValue < 0 ? 'is-negative' : 'is-flat') : 'is-flat';
    const node = document.createElement('article');
    node.className = 'paper-position-card';
    node.innerHTML = `
      <div class="paper-position-head">
        <div>
          <p class="paper-position-symbol">${trade.symbol} ${trade.side}</p>
          <p class="paper-position-setup">${setupLabel(trade.setupType)} • ${trade.status.replaceAll('_', ' ')}</p>
        </div>
        <div class="paper-position-pnl ${pnlClass}">
          <p>${typeof pnlValue === 'number' ? fmtSignedUsd(pnlValue) : '--'}</p>
          <span>${mode === 'open' ? 'live' : trade.exitReason?.replaceAll('_', ' ') ?? 'closed'}</span>
        </div>
      </div>
      ${paperBadge ? `<div class="paper-learning-row"><span class="pill paperLearningPill">${paperBadge}</span></div>` : ''}
      ${autonomyLabel || researchDirection ? `
        <div class="paper-learning-row">
          ${autonomyLabel ? `<span class="pill paperAutonomyPill">${escapeHtml(autonomyLabel)}</span>` : ''}
          ${researchDirection ? `<span class="pill paperAutonomyDirectionPill">${escapeHtml(researchDirection)}</span>` : ''}
        </div>
      ` : ''}
      ${autonomyReason ? `<p class="paper-position-reason">${escapeHtml(autonomyReason)}</p>` : ''}
      <div class="paper-position-grid">
        <div>
          <span class="paper-position-label">Entry</span>
          <p>${fmtNum(hasFill ? trade.filledPrice : trade.entry, 2)}</p>
        </div>
        <div>
          <span class="paper-position-label">${mode === 'open' ? 'Mark' : 'Exit'}</span>
          <p>${fmtNum(mode === 'open' ? markPrice : trade.exitPrice, 2)}</p>
        </div>
        <div>
          <span class="paper-position-label">Stop</span>
          <p>${fmtNum(trade.stopLoss, 2)}</p>
        </div>
        <div>
          <span class="paper-position-label">TP1</span>
          <p>${fmtNum(trade.takeProfit, 2)}</p>
        </div>
      </div>
      <div class="paper-position-meta">
        <span>Qty ${fmtNum(trade.quantity, 2)}</span>
        <span>Risk ${fmtNum(trade.riskPct, 2)}%</span>
        <span>${mode === 'open' ? `Seen ${fmtRelativeMinutes(trade.submittedAt)}` : `Closed ${fmtRelativeMinutes(trade.closedAt ?? trade.submittedAt)}`}</span>
      </div>
    `;
    container.appendChild(node);
  });
};

const renderPaperAccount = () => {
  const paper = latestDiagnostics?.diagnostics?.paperAccount ?? null;
  const homePaper = latestHomeDeck?.deck?.paperAccount ?? null;
  const paperEnabled = Boolean(paper?.enabled || homePaper);
  const runtime = buildPaperRuntimeState();

  const summary = {
    initialBalance:
      typeof paper?.initialBalance === 'number'
        ? paper.initialBalance
        : typeof homePaper?.initialBalance === 'number'
          ? homePaper.initialBalance
          : 100000,
    balance: typeof paper?.balance === 'number' ? paper.balance : homePaper?.balance,
    equity: typeof paper?.equity === 'number' ? paper.equity : homePaper?.equity,
    realizedPnl: typeof paper?.realizedPnl === 'number' ? paper.realizedPnl : homePaper?.realizedPnl,
    unrealizedPnl: typeof paper?.unrealizedPnl === 'number' ? paper.unrealizedPnl : homePaper?.unrealizedPnl,
    openTrades: typeof paper?.openTrades === 'number' ? paper.openTrades : homePaper?.openTrades,
    pendingEntries: typeof paper?.pendingEntries === 'number' ? paper.pendingEntries : homePaper?.pendingEntries,
    closedTrades: typeof paper?.closedTrades === 'number' ? paper.closedTrades : homePaper?.closedTrades,
    hitRate: typeof paper?.hitRate === 'number' ? paper.hitRate : homePaper?.hitRate,
    totalReturnPct:
      typeof homePaper?.totalReturnPct === 'number'
        ? homePaper.totalReturnPct
        : typeof paper?.equity === 'number' && typeof paper?.initialBalance === 'number'
          ? ((paper.equity - paper.initialBalance) / Math.max(paper.initialBalance, 1)) * 100
          : null,
    lastUpdatedAt: paper?.lastUpdatedAt ?? homePaper?.lastUpdatedAt ?? null
  };

  if (homePaperAccountCardEl) {
    homePaperAccountCardEl.dataset.tone =
      typeof summary.totalReturnPct === 'number'
        ? summary.totalReturnPct > 0
          ? 'bullish'
          : summary.totalReturnPct < 0
            ? 'bearish'
            : 'neutral'
        : 'neutral';
  }

  if (homePaperBalanceEl) {
    homePaperBalanceEl.textContent = paperEnabled && typeof summary.equity === 'number' ? fmtUsd(summary.equity) : '--';
  }
  if (homePaperPnlEl) {
    const totalDollar =
      typeof summary.equity === 'number' && typeof summary.initialBalance === 'number'
        ? summary.equity - summary.initialBalance
        : null;
    homePaperPnlEl.textContent =
      paperEnabled && typeof totalDollar === 'number' && typeof summary.totalReturnPct === 'number'
        ? `${fmtSignedUsd(totalDollar)} • ${fmtSignedPct(summary.totalReturnPct)}`
        : 'Paper account standing by';
  }

  // Robinhood-style header portfolio value
  if (rhPortfolioValueEl) {
    rhPortfolioValueEl.textContent =
      paperEnabled && typeof summary.equity === 'number' ? fmtUsd(summary.equity) : '--';
  }
  if (rhPortfolioPnlEl) {
    const totalDollar =
      typeof summary.equity === 'number' && typeof summary.initialBalance === 'number'
        ? summary.equity - summary.initialBalance
        : null;
    const isPositive = typeof totalDollar === 'number' && totalDollar > 0;
    const isNegative = typeof totalDollar === 'number' && totalDollar < 0;
    rhPortfolioPnlEl.textContent =
      paperEnabled && typeof totalDollar === 'number' && typeof summary.totalReturnPct === 'number'
        ? `${fmtSignedUsd(totalDollar)} (${fmtSignedPct(summary.totalReturnPct)}) all-time`
        : 'Today: --';
    rhPortfolioPnlEl.classList.toggle('is-positive', isPositive);
    rhPortfolioPnlEl.classList.toggle('is-negative', isNegative);
  }
  if (homePaperMetaEl) {
    homePaperMetaEl.textContent = paperEnabled
      ? `${runtime.marketOpen ? 'Market open for paper execution' : 'Paper engine is paused until the futures session reopens'} • ${summary.openTrades ?? 0} open • ${summary.closedTrades ?? 0} closed • cap ${formatPaperTradeCap(paper?.maxConcurrentTrades ?? homePaper?.maxConcurrentTrades)}`
      : 'The paper account is not enabled on this desk yet.';
  }
  if (homePaperChipEl) {
    homePaperChipEl.textContent = paperEnabled ? (paper?.started ? 'Paper live' : 'Paper loading') : 'Paper off';
    homePaperChipEl.className = `chip ${paperEnabled ? 'chip-online' : 'chip-neutral'}`;
  }
  if (homePaperMarketChipEl) {
    homePaperMarketChipEl.textContent = paperEnabled ? runtime.chipText : 'Paper off';
    homePaperMarketChipEl.className = paperEnabled ? runtime.chipClass : 'chip chip-neutral';
  }
  if (homePaperSymbolsChipEl) {
    homePaperSymbolsChipEl.textContent = paperEnabled ? runtime.symbolText : 'Symbols --';
    homePaperSymbolsChipEl.className = `chip ${paperEnabled ? 'chip-neutral' : 'chip-neutral'}`;
  }

  if (paperAccountChipEl) {
    paperAccountChipEl.textContent = paperEnabled ? (paper?.started ? 'Live paper' : 'Paper loading') : 'Paper off';
    paperAccountChipEl.className = `chip ${paperEnabled ? 'chip-online' : 'chip-neutral'}`;
  }
  if (paperHeroEquityEl) {
    paperHeroEquityEl.textContent = paperEnabled && typeof summary.equity === 'number' ? fmtUsd(summary.equity) : '--';
  }
  if (paperHeroPnlEl) {
    const totalDollar =
      typeof summary.equity === 'number' && typeof summary.initialBalance === 'number'
        ? summary.equity - summary.initialBalance
        : null;
    paperHeroPnlEl.textContent =
      paperEnabled && typeof totalDollar === 'number' && typeof summary.totalReturnPct === 'number'
        ? `${fmtSignedUsd(totalDollar)} (${fmtSignedPct(summary.totalReturnPct)}) all-time`
        : 'Waiting for paper account activity';
  }
  if (paperHeroUpdatedEl) {
    paperHeroUpdatedEl.textContent = summary.lastUpdatedAt ? `Updated ${fmtRelativeMinutes(summary.lastUpdatedAt)}` : 'Updated --';
  }
  if (paperHeroWindowEl) {
    paperHeroWindowEl.textContent = paperEnabled ? runtime.chipText : 'Paper off';
    paperHeroWindowEl.className = paperEnabled ? runtime.chipClass : 'chip chip-neutral';
  }
  if (paperMarketStateChipEl) {
    paperMarketStateChipEl.textContent = paperEnabled ? `${summary.openTrades ?? 0} open • ${summary.pendingEntries ?? 0} pending` : 'Positions --';
    paperMarketStateChipEl.className = 'chip chip-neutral';
  }
  if (paperSymbolsChipEl) {
    paperSymbolsChipEl.textContent = paperEnabled ? runtime.symbolText : 'Symbols --';
    paperSymbolsChipEl.className = 'chip chip-neutral';
  }
  if (paperBalanceEl) {
    paperBalanceEl.textContent = paperEnabled && typeof summary.balance === 'number' ? fmtUsd(summary.balance) : '--';
  }
  if (paperUnrealizedEl) {
    paperUnrealizedEl.textContent = paperEnabled && typeof summary.unrealizedPnl === 'number' ? fmtSignedUsd(summary.unrealizedPnl) : '--';
  }
  if (paperRealizedEl) {
    paperRealizedEl.textContent = paperEnabled && typeof summary.realizedPnl === 'number' ? fmtSignedUsd(summary.realizedPnl) : '--';
  }
  if (paperHitRateEl) {
    paperHitRateEl.textContent = paperEnabled && typeof summary.hitRate === 'number' ? `${Math.round(summary.hitRate * 100)}%` : '--';
  }
  if (paperOpenCountEl) {
    paperOpenCountEl.textContent = paperEnabled ? String(summary.openTrades ?? 0) : '--';
  }
  if (paperClosedCountEl) {
    paperClosedCountEl.textContent = paperEnabled ? String(summary.closedTrades ?? 0) : '--';
  }
  if (paperHeroMetaEl) {
    paperHeroMetaEl.textContent = paperEnabled
      ? `Started with ${fmtUsd(summary.initialBalance)} • ${runtime.marketOpen ? 'Paper engine can place live NQ/ES ideas right now' : 'No new paper trades while the futures market is closed'} • ${summary.closedTrades ?? 0} resolved paper trades`
      : 'Paper account diagnostics are not available.';
  }
  if (paperOpenChipEl) {
    paperOpenChipEl.textContent = `${summary.openTrades ?? 0} open`;
  }
  if (paperClosedChipEl) {
    paperClosedChipEl.textContent = `${summary.closedTrades ?? 0} closed`;
  }

  renderPaperSparkline(paperHeroSparklineEl, buildPaperEquitySeries(paper));
  renderPaperTradeCards(
    paperOpenPositionsListEl,
    paper?.recentOpenTrades ?? [],
    'No open paper positions right now.',
    'open'
  );
  renderPaperTradeCards(
    paperClosedTradesListEl,
    paper?.recentClosedTrades?.slice(0, 8) ?? [],
    'No closed paper trades yet.',
    'closed'
  );
  renderPaperConfig();
};

const renderPaperConfig = () => {
  const paper = latestDiagnostics?.diagnostics?.paperAccount ?? latestHomeDeck?.deck?.paperAccount ?? null;
  const maxConcurrentTrades = paper?.maxConcurrentTrades ?? 0;
  const autonomyMode = paper?.autonomyMode ?? 'UNRESTRICTED';
  const autonomyRiskPct = paper?.autonomyRiskPct ?? 0.35;

  if (paperMaxConcurrentTradesEl && document.activeElement !== paperMaxConcurrentTradesEl) {
    paperMaxConcurrentTradesEl.value = String(maxConcurrentTrades);
  }
  if (paperAutonomyModeEl && document.activeElement !== paperAutonomyModeEl) {
    paperAutonomyModeEl.value = autonomyMode;
  }
  if (paperAutonomyRiskPctEl && document.activeElement !== paperAutonomyRiskPctEl) {
    paperAutonomyRiskPctEl.value = Number(autonomyRiskPct).toFixed(2);
  }

  if (paperConfigMetaEl) {
    paperConfigMetaEl.textContent = paper?.enabled
      ? autonomyMode === 'UNRESTRICTED'
        ? `Paper engine is in unrestricted autonomy mode with ${formatPaperTradeCap(maxConcurrentTrades)} concurrent trades. It self-sizes at ${Number(autonomyRiskPct).toFixed(2)}% risk from paper equity, and closed paper results feed the learning loop automatically.`
        : `Paper engine is following only risk-cleared alerts with ${formatPaperTradeCap(maxConcurrentTrades)} concurrent trades. Closed paper results still feed the learning loop automatically.`
      : 'Paper trading is disabled on this desk.';
  }
};

const buildSymbolDetailStats = (item, deck) => {
  const researchPct = Number.isFinite(Number(item.researchConfidence))
    ? `${Math.round(Number(item.researchConfidence) * 100)}%`
    : '--';
  const latestAlert = item.latestAlert ?? null;
  return [
    {
      label: 'Research',
      value: researchDirectionLabel(item.researchDirection ?? 'BALANCED'),
      note: `Confidence ${researchPct}`
    },
    {
      label: 'Latest Setup',
      value: latestAlert ? `${latestAlert.side} • ${setupLabel(latestAlert.setupType)}` : 'Watching only',
      note: latestAlert?.detectedAt ? `Seen ${fmtRelativeMinutes(latestAlert.detectedAt)}` : 'No live board idea'
    },
    {
      label: 'Desk Queue',
      value: `${deck.readyCount ?? 0} ready`,
      note: `${deck.blockedCount ?? 0} blocked • ${deck.signalCount ?? 0} total`
    },
    {
      label: 'Model',
      value: deck.modelId ? deck.modelId.slice(-8) : '--',
      note: deck.lastRetrainedAt ? `Retrained ${fmtRelativeMinutes(deck.lastRetrainedAt)}` : 'No retrain yet'
    }
  ];
};

const renderSymbolDetailStats = (item, deck) => {
  if (!symbolDetailViewerStatsEl) {
    return;
  }

  symbolDetailViewerStatsEl.innerHTML = '';
  buildSymbolDetailStats(item, deck).forEach((stat) => {
    const card = document.createElement('article');
    card.className = 'symbol-viewer-stat-card';
    card.innerHTML = `
      <p class="symbol-viewer-stat-label">${escapeHtml(stat.label)}</p>
      <p class="symbol-viewer-stat-value">${escapeHtml(stat.value)}</p>
      <p class="symbol-viewer-stat-note">${escapeHtml(stat.note)}</p>
    `;
    symbolDetailViewerStatsEl.appendChild(card);
  });
};

const renderSymbolDetailSetup = (item) => {
  if (!symbolDetailViewerSetupEl) {
    return;
  }

  const latestAlert = item.latestAlert ?? null;
  if (!latestAlert) {
    symbolDetailViewerSetupEl.innerHTML = `
      <div class="symbol-viewer-empty">
        <p class="symbol-viewer-empty-title">No live setup on the board</p>
        <p class="symbol-viewer-empty-note">This symbol is still being watched, but there is no current 5m setup worth surfacing yet.</p>
      </div>
    `;
    return;
  }

  symbolDetailViewerSetupEl.innerHTML = `
    <div class="symbol-viewer-setup-head">
      <div>
        <p class="symbol-viewer-setup-title">${escapeHtml(`${latestAlert.side} • ${setupLabel(latestAlert.setupType)}`)}</p>
        <p class="symbol-viewer-setup-subtitle">${escapeHtml(latestAlert.detectedAt ? `Seen ${fmtDateTimeCompact(latestAlert.detectedAt)}` : 'Seen time unavailable')}</p>
      </div>
      <span class="chip ${latestAlert.allowed ? 'chip-online' : 'chip-offline'}">${escapeHtml(latestAlert.allowed ? 'Ready' : 'Blocked')}</span>
    </div>
    <div class="symbol-viewer-level-row">
      <span class="level-chip level-chip-entry">Entry <b>${escapeHtml(fmtNum(latestAlert.entry, 2))}</b></span>
      <span class="level-chip level-chip-stop">SL <b>${escapeHtml(fmtNum(latestAlert.stopLoss, 2))}</b></span>
      <span class="level-chip level-chip-target">TP1 <b>${escapeHtml(fmtNum(latestAlert.takeProfitOne, 2))}</b></span>
    </div>
    <div class="symbol-viewer-setup-grid">
      <article class="symbol-viewer-setup-card">
        <p class="symbol-viewer-stat-label">Score</p>
        <p class="symbol-viewer-stat-value">${escapeHtml(fmtNum(latestAlert.finalScore, 1))}</p>
      </article>
      <article class="symbol-viewer-setup-card">
        <p class="symbol-viewer-stat-label">1m Confidence</p>
        <p class="symbol-viewer-stat-value">${escapeHtml(fmtNum(latestAlert.oneMinuteConfidence, 2))}</p>
      </article>
      <article class="symbol-viewer-setup-card">
        <p class="symbol-viewer-stat-label">Risk / Reward</p>
        <p class="symbol-viewer-stat-value">${escapeHtml(calcRr(latestAlert.entry, latestAlert.stopLoss, latestAlert.takeProfitOne))}</p>
      </article>
    </div>
    <div class="symbol-viewer-chip-group">
      ${(latestAlert.reasons ?? []).map((reason) => `<span class="chip chip-neutral">${escapeHtml(reason)}</span>`).join('')}
      ${(latestAlert.guardrails ?? []).map((reason) => `<span class="chip chip-offline">${escapeHtml(humanizeRiskReason(reason))}</span>`).join('')}
    </div>
  `;
};

const renderSymbolDetailReasons = (item, deck) => {
  if (!symbolDetailViewerReasonListEl) {
    return;
  }

  const reasons = [
    item.researchReason,
    deck.headline,
    deck.summary,
    item.latestAlert?.reasons?.[0],
    item.latestAlert?.guardrails?.[0] ? humanizeRiskReason(item.latestAlert.guardrails[0]) : null
  ].filter(Boolean);

  symbolDetailViewerReasonListEl.innerHTML = '';
  reasons.slice(0, 4).forEach((reason) => {
    const row = document.createElement('article');
    row.className = 'symbol-viewer-reason-item';
    row.innerHTML = `<p class="symbol-viewer-reason-copy">${escapeHtml(reason)}</p>`;
    symbolDetailViewerReasonListEl.appendChild(row);
  });

  if (!symbolDetailViewerReasonListEl.childElementCount) {
    symbolDetailViewerReasonListEl.innerHTML = `
      <div class="symbol-viewer-empty">
        <p class="symbol-viewer-empty-title">No symbol note yet</p>
        <p class="symbol-viewer-empty-note">The desk will populate this once the research engine or the board has a cleaner read.</p>
      </div>
    `;
  }
};

const closeSymbolDetailViewer = () => {
  if (!symbolDetailViewerEl || symbolDetailViewerEl.hidden) {
    return;
  }

  symbolDetailViewerEl.hidden = true;
  symbolDetailViewerEl.setAttribute('aria-hidden', 'true');
  symbolDetailViewerContext = null;
  symbolDetailViewerFrameEl.innerHTML = '';
  document.body.classList.remove('symbol-viewer-open');
};

const openSymbolDetailViewer = (item, deck) => {
  if (!symbolDetailViewerEl || !symbolDetailViewerFrameEl) {
    openTradingViewViewer({
      symbol: item.symbol,
      interval: '5',
      title: `${item.symbol} TradingView`,
      meta: 'Confirm the current 5m structure in TradingView.'
    });
    return;
  }

  symbolDetailViewerContext = { item, deck };
  const trendDirection = item.researchDirection ?? 'BALANCED';
  const confidencePct = Math.max(8, Math.min(100, Number(item.researchConfidence ?? 0) * 100));
  const latestAlert = item.latestAlert ?? null;
  const freshness = item.latestBarTimestamp ? fmtRelativeMinutes(item.latestBarTimestamp) : 'No bar yet';

  symbolDetailViewerTitleEl.textContent = `${item.symbol} Detail`;
  symbolDetailViewerMetaEl.textContent = latestAlert
    ? `${setupLabel(latestAlert.setupType)} • ${deck.headline ?? 'Desk read unavailable'}`
    : deck.headline ?? 'Desk read unavailable';
  symbolDetailViewerPriceEl.textContent =
    item.latestPrice !== null && item.latestPrice !== undefined ? fmtNum(item.latestPrice, 2) : '--';
  symbolDetailViewerDirectionEl.textContent = `${researchDirectionLabel(trendDirection)} • ${item.researchReason ?? 'Waiting for a clearer symbol-specific read.'}`;
  symbolDetailViewerToneEl.textContent =
    latestAlert ? (latestAlert.allowed ? 'Ready on board' : 'Board blocked') : 'Watching';
  symbolDetailViewerToneEl.className = `chip ${
    latestAlert ? (latestAlert.allowed ? 'chip-online' : 'chip-offline') : 'chip-neutral'
  }`;
  symbolDetailViewerFreshnessEl.textContent = item.latestBarTimestamp
    ? `Latest bar ${freshness}`
    : 'No fresh bar yet';
  if (symbolDetailViewerMeterFillEl) {
    symbolDetailViewerMeterFillEl.style.width = `${confidencePct}%`;
  }

  renderSymbolDetailStats(item, deck);
  renderSymbolDetailSetup(item);
  renderSymbolDetailReasons(item, deck);

  symbolDetailViewerFrameEl.innerHTML = `
    <div class="tradingview-widget-container">
      <div class="tradingview-widget-container__widget"></div>
    </div>
  `;
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.async = true;
  script.src = tradingViewWidgetScriptUrl;
  script.text = JSON.stringify({
    autosize: true,
    symbol: tradingViewSymbolMap[item.symbol] ?? item.symbol,
    interval: '5',
    timezone: 'America/Chicago',
    theme: 'light',
    style: '1',
    locale: 'en',
    enable_publishing: false,
    allow_symbol_change: false,
    hide_top_toolbar: false,
    hide_legend: false,
    save_image: false,
    calendar: false,
    details: false,
    support_host: 'https://www.tradingview.com'
  });
  script.onerror = () => {
    symbolDetailViewerFrameEl.innerHTML = `
      <div class="symbol-viewer-empty">
        <p class="symbol-viewer-empty-title">TradingView chart did not load</p>
        <p class="symbol-viewer-empty-note">Use the TradingView button above to open the full chart directly.</p>
      </div>
    `;
  };
  symbolDetailViewerFrameEl.querySelector('.tradingview-widget-container')?.appendChild(script);

  symbolDetailViewerEl.hidden = false;
  symbolDetailViewerEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('symbol-viewer-open');
};

const bindSymbolDetailViewer = () => {
  if (symbolDetailViewerBound || !symbolDetailViewerEl) {
    return;
  }

  symbolDetailViewerBound = true;
  symbolDetailViewerBackdropEl?.addEventListener('click', closeSymbolDetailViewer);
  symbolDetailViewerCloseEl?.addEventListener('click', closeSymbolDetailViewer);
  symbolDetailViewerTradingViewEl?.addEventListener('click', () => {
    if (!symbolDetailViewerContext?.item?.symbol) {
      return;
    }
    window.open(buildTradingViewUrl(symbolDetailViewerContext.item.symbol, '5'), '_blank', 'noopener,noreferrer');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && symbolDetailViewerEl && !symbolDetailViewerEl.hidden) {
      closeSymbolDetailViewer();
    }
  });
};

const renderHomeMacroList = (events) => {
  if (!homeMacroListEl) {
    return;
  }

  homeMacroListEl.innerHTML = '';
  const relevantEvents = (events ?? [])
    .filter((event) => isDirectUsdMacroEvent(event) || isHighImpactEvent(event))
    .slice(0, 3);

  if (!relevantEvents.length) {
    renderEmpty(homeMacroListEl, 'No high-value macro events are close enough to matter right now.');
    return;
  }

  relevantEvents.forEach((event) => {
    const read = interpretMacroEventForIndices(event);
    const card = document.createElement('article');
    card.className = 'home-macro-card';
    card.dataset.tone = read.tone;

    card.innerHTML = `
      <div class="home-macro-head">
        <div>
          <p class="stat-label">${escapeHtml(`${String(event.impact ?? 'low').toUpperCase()} • ${event.currency ?? 'Macro'}`)}</p>
          <p class="home-macro-title">${escapeHtml(event.title ?? event.category ?? 'Economic event')}</p>
        </div>
        <span class="chip chip-neutral">${escapeHtml(formatMinutesUntil(event.startsAt))}</span>
      </div>
      <p class="home-macro-copy">${escapeHtml(read.summary)}</p>
      <p class="home-macro-note">${escapeHtml(read.detail)}</p>
      <p class="home-macro-meta">${escapeHtml(`${fmtDateTimeCompact(event.startsAt)}${event.forecast ? ` • Forecast ${event.forecast}` : ''}${event.previous ? ` • Prev ${event.previous}` : ''}`)}</p>
    `;

    homeMacroListEl.appendChild(card);
  });
};

const renderHomeDashboard = () => {
  if (!homeDirectionCardEl) {
    return;
  }

  const diagnostics = latestDiagnostics?.diagnostics ?? null;
  const feedState = getFeedStateMeta(diagnostics);
  const board = buildBoardPressure(latestAlerts);
  const topAlert = board.readyAlerts[0] ?? board.topAlert;
  const effectiveCalendar = diagnostics?.calendar?.sourceName ? diagnostics.calendar : latestCalendar?.calendar ?? null;
  const research = diagnostics?.research ?? null;
  const researchTrend = research?.overallTrend ?? null;
  const upcomingEvents = effectiveCalendar?.upcomingEvents ?? effectiveCalendar?.events ?? [];
  const nextMacroEvent =
    upcomingEvents.find((event) => isDirectUsdMacroEvent(event) || isHighImpactEvent(event)) ?? upcomingEvents[0] ?? null;
  const macroRead = interpretMacroEventForIndices(nextMacroEvent);
  const quietWindow = resolveQuietWindow();
  const windowKnown = Boolean(quietWindow);
  const insideWindow = quietWindow ? isWithinClockWindow(new Date().toISOString(), quietWindow) : false;
  const openRisk = latestPending.reduce((sum, intent) => sum + (Number(intent.riskPct) || 0), 0);
  const lastRetrainAt = diagnostics?.training?.lastRun?.trainedAt ?? diagnostics?.training?.lastTrainedAt;

  let directionTone = 'neutral';
  let directionLabel = 'Balanced';
  let directionDetail = 'The desk does not have a strong directional edge yet.';
  let directionConfidence = 'Confidence Low';
  let directionReason = 'No 5m setup is dominating the board strongly enough to lean hard.';

  if (!diagnostics) {
    directionLabel = 'Checking';
    directionDetail = 'Waiting for live diagnostics.';
    directionReason = 'The home screen is waiting for the latest desk state.';
  } else if (feedState.segment === 'Reauth' || feedState.segment === 'Frozen' || feedState.segment === 'Stalled') {
    directionTone = 'risk';
    directionLabel = 'Do Not Trust';
    directionDetail = feedState.summary;
    directionConfidence = 'Confidence Off';
    directionReason = feedState.detail;
  } else if (macroRead.tone === 'event-risk') {
    directionTone = 'risk';
    directionLabel = 'Stand Aside';
    directionDetail = macroRead.summary;
    directionConfidence = 'Confidence Hold';
    directionReason = topAlert
      ? `${topAlert.symbol} has a ${topAlert.side} 5m idea, but ${macroRead.detail}`
      : macroRead.detail;
  } else if (
    researchTrend
    && (researchTrend.direction === 'BULLISH' || researchTrend.direction === 'BEARISH')
    && Number(researchTrend.confidence) >= 0.55
  ) {
    const bullish = researchTrend.direction === 'BULLISH';
    directionTone = bullish ? 'bullish' : 'bearish';
    directionLabel = bullish ? 'Bullish' : 'Bearish';
    directionDetail = `${researchTrend.leadSymbol ?? 'NQ/ES'} is leading the autonomous research bias.`;
    directionConfidence = `Confidence ${Math.round(Number(researchTrend.confidence) * 100)}%`;
    directionReason = topAlert
      ? `${researchTrend.reason} Board lead: ${topAlert.symbol} ${topAlert.side} ${setupLabel(topAlert.setupType)}.`
      : researchTrend.reason;
  } else if (board.bullish > 0 && board.bearish > 0 && Math.abs(board.bullish - board.bearish) < 1.2) {
    directionTone = 'neutral';
    directionLabel = 'Mixed';
    directionDetail = 'The board has both long and short pressure.';
    directionConfidence = 'Confidence Low';
    directionReason = 'NQ/ES do not have a clean 5m directional consensus right now.';
  } else if (topAlert) {
    const isBullish = topAlert.side === 'LONG';
    const score = Number(topAlert?.candidate?.finalScore);
    const confidence = topAlert.riskDecision?.allowed && Number.isFinite(score) && score >= 82 ? 'High' : topAlert.riskDecision?.allowed ? 'Moderate' : 'Developing';
    directionTone = isBullish ? 'bullish' : 'bearish';
    directionLabel = isBullish ? 'Bullish' : 'Bearish';
    directionDetail = `${topAlert.symbol} is leading with a ${setupLabel(topAlert.setupType)} on the 5m board.`;
    directionConfidence = `Confidence ${confidence}`;
    directionReason = topAlert.riskDecision?.allowed
      ? `${topAlert.symbol} ${topAlert.side} is the strongest ready setup at score ${fmtNum(score, 1)}. ${macroRead.detail}`
      : `${topAlert.symbol} ${topAlert.side} is the lead developing setup, but it is still blocked. ${macroRead.detail}`;
  }

  homeDirectionCardEl.dataset.tone = directionTone;
  homeBiasLabelEl.textContent = directionLabel;
  homeBiasDetailEl.textContent = directionDetail;
  homeBiasConfidenceEl.textContent = directionConfidence;
  homeBiasWindowEl.textContent = windowKnown ? (insideWindow ? 'Desk Open' : 'Quiet Window') : 'Window --';
  homeBiasReasonEl.textContent = directionReason;
  homeMacroReasonEl.textContent = macroRead.summary;
  homeSessionChipEl.textContent = windowKnown ? (insideWindow ? 'Window open' : 'Quiet mode') : 'Desk loading';
  renderDirectionTags([
    topAlert ? `${topAlert.symbol} ${topAlert.side}` : 'No lead setup',
    topAlert ? setupLabel(topAlert.setupType) : 'Watchlist only',
    researchTrend ? `Research ${researchDirectionLabel(researchTrend.direction)}` : 'Research loading',
    effectiveCalendar?.sourceName ? `Macro ${effectiveCalendar.sourceName}` : 'Macro offline',
    diagnostics?.latestBarTimestamp ? `Last bar ${fmtRelativeMinutes(diagnostics.latestBarTimestamp)}` : 'No bar'
  ]);

  homeDeskStateEl.textContent = `${feedState.segment} • ${windowKnown ? (insideWindow ? 'window open' : 'quiet window') : 'window loading'}`;
  homeTopIdeaEl.textContent = topAlert
    ? `${topAlert.symbol} ${topAlert.side} • ${setupLabel(topAlert.setupType)}`
    : 'No live lead idea';
  const learningProfile = getSelfLearningProfile();
  homeReplayStateEl.textContent = learningProfile
    ? `${learningProfile.resolvedRecords} learned • ${reviewSummary.pending} pending`
    : `${reviewSummary.pending} pending • ${reviewSummary.completed} done`;
  homeModelStateEl.textContent = diagnostics?.rankingModel?.modelId
    ? `${diagnostics.rankingModel.modelId} • ${lastRetrainAt ? fmtRelativeMinutes(lastRetrainAt) : 'fresh run unknown'}`
    : 'Model not loaded';
  homeResearchStateEl.textContent = researchTrend
    ? `${researchDirectionLabel(researchTrend.direction)} • ${Math.round(Number(researchTrend.confidence ?? 0) * 100)}%`
    : 'Research loading';
  homeAlertStateEl.textContent =
    getNotificationPrefs().enabled
      ? diagnostics?.notifications?.telegramReady
        ? 'Phone + Telegram armed'
        : 'Phone armed'
      : 'Phone alerts off';
  homeMacroSummaryEl.textContent = nextMacroEvent
    ? `${nextMacroEvent.title} • ${fmtDateTimeCompact(nextMacroEvent.startsAt)} • ${macroRead.summary}`
    : 'No near-term macro catalyst in the current Forex Factory window.';
  renderDeskBrief();
  renderHomeDeck();
  renderHomeResearchLab();
  renderHomePaperAutonomy();
  renderHomeMacroList(upcomingEvents);
  renderPaperAccount();
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

const normalizeTabName = (tab) => {
  if (tab === 'reviews') {
    return 'learning';
  }
  if (tab === 'pending') {
    return 'home';
  }
  return tab;
};

const parseRouteState = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    tab: normalizeTabName(params.get('tab') || null),
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
  const normalizedTab = normalizeTabName(tab);
  activeRouteAlertId = alertId || null;
  focusedAlertId = alertId || null;
  if (normalizedTab === 'signals') {
    signalFilters.status = 'ALL';
    signalFilters.symbol = 'ALL';
    updateSegmentedControls();
  }
  updateRouteState({
    tab: normalizedTab,
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
  const calendarState = diagnostics?.calendar?.sourceName ? diagnostics.calendar : latestCalendar?.calendar ?? null;
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
  const calendar = calendarState?.sourceName
    ? `Macro calendar source: ${calendarState.sourceName}.`
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

const isWithinClockWindow = (nowIso, window) => {
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

const isWithinRiskWindow = (nowIso, riskConfig) => isWithinClockWindow(nowIso, riskConfig?.tradingWindow);

const resolveQuietWindow = () => {
  if (signalSettings) {
    return {
      enabled: true,
      timezone: signalSettings.timezone,
      startHour: signalSettings.sessionStartHour,
      startMinute: signalSettings.sessionStartMinute,
      endHour: signalSettings.sessionEndHour,
      endMinute: signalSettings.sessionEndMinute
    };
  }

  return latestRiskConfig?.config?.tradingWindow ?? null;
};

const renderQuietModeState = () => {
  if (!diagQuietModeEl) {
    return;
  }

  const window = resolveQuietWindow();
  if (!window) {
    diagQuietModeEl.dataset.tone = 'warn';
    diagQuietModeEl.textContent = 'Quiet mode --';
    if (diagQuietModeHintEl) {
      diagQuietModeHintEl.textContent = 'Quiet mode follows the desk rules once settings load.';
    }
    return;
  }

  const insideWindow = isWithinClockWindow(new Date().toISOString(), window);
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
  renderQuietModeState();
  renderHomeDashboard();
};

const selectedSetups = () =>
  Object.entries(setupToggleMap)
    .filter(([, toggle]) => toggle.checked)
    .map(([setup]) => setup);

const currentSignalSettingsPayload = () => {
  const sessionStart = parseTimeValue(signalSessionStartEl.value || '08:30');
  const sessionEnd = parseTimeValue(signalSessionEndEl.value || '10:30');

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

const fmtUsd = (value, decimals = 2) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

const fmtSignedUsd = (value, decimals = 2) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${fmtUsd(Math.abs(value), decimals)}`;
};

const fmtSignedPct = (value, decimals = 2) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(decimals)}%`;
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
      chip: 'Waiting on outcomes',
      headline: 'No session summary yet',
      context: 'The learning loop will summarize the latest trading session once signals resolve or the engine labels them automatically.',
      strongest: 'Need more resolved cases',
      weakest: 'Need more resolved cases',
      tomorrow: 'Keep the engine running so the app can learn what to tighten next.',
      feedback: '0 learned • 0 awaiting'
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
    : 'Need more resolved cases';
  const weakest = rankedBuckets[rankedBuckets.length - 1]
    ? `${setupLabel(rankedBuckets[rankedBuckets.length - 1].key)} ${Math.round(rankedBuckets[rankedBuckets.length - 1].winRate * 100)}% (${rankedBuckets[rankedBuckets.length - 1].wins}/${rankedBuckets[rankedBuckets.length - 1].total})`
    : invalid > 0
      ? `${invalid} invalid setup${invalid === 1 ? '' : 's'} marked`
      : 'Need more resolved cases';

  let tomorrow = 'Keep the engine learning from resolved outcomes so the ranking model can keep tightening edge.';
  if (pending > 0) {
    tomorrow = `Let the engine finish ${pending} case${pending === 1 ? '' : 's'} that are still awaiting outcome before the next session.`;
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
      ? `${sessionLabel} • ${pending} awaiting`
      : `${sessionLabel} • ${completed} learned`;
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
    context: `${completed} learned • ${pending} awaiting • Ready ${readyCount} • Blocked ${blockedCount}`,
    strongest,
    weakest,
    tomorrow,
    feedback: `${completed} learned • ${pending} awaiting`
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

const buildAlertLikeContext = (input) => {
  if (!input) {
    return null;
  }

  if (input.candidate && input.riskDecision) {
    return input;
  }

  if (input.alertSnapshot) {
    return {
      symbol: input.symbol,
      side: input.side,
      setupType: input.setupType,
      candidate: input.alertSnapshot?.candidate ?? null,
      riskDecision: input.alertSnapshot?.riskDecision ?? { allowed: false, reasonCodes: [] }
    };
  }

  return null;
};

const summarizeGuardrails = (alertLike) => {
  if (!alertLike?.riskDecision) {
    return 'Risk state unavailable';
  }

  if (alertLike.riskDecision.allowed) {
    return 'Desk rules allowed this setup at the time it fired.';
  }

  const reasons = alertLike.riskDecision.reasonCodes ?? [];
  return reasons.length ? reasons.map(humanizeRiskReason).join(' • ') : 'Blocked by guardrails';
};

const replayResolutionTone = (outcome) => {
  if (outcome === 'TARGET_FIRST') {
    return 'is-positive';
  }
  if (outcome === 'STOP_FIRST') {
    return 'is-negative';
  }
  if (outcome === 'AMBIGUOUS') {
    return 'is-warning';
  }
  return 'is-neutral';
};

const resolveReplayTradeStartIndex = (snapshot, bars) => {
  const focusBarAt = snapshot?.focusBarAt ?? bars[bars.length - 1]?.timestamp ?? snapshot?.detectedAt;
  const focusIndexRaw = bars.findIndex((bar) => bar.timestamp === focusBarAt);
  return Math.max(1, Math.min(focusIndexRaw >= 0 ? focusIndexRaw : bars.length - 4, bars.length - 2));
};

const analyzeReplayResolution = (snapshot, candidate) => {
  const bars = snapshot?.bars ?? [];
  const side = candidate?.side ?? snapshot?.side;
  const entry = candidate?.entry ?? snapshot?.levels?.entry;
  const stopLoss = candidate?.stopLoss ?? snapshot?.levels?.stopLoss;
  const takeProfit = candidate?.takeProfit?.[0] ?? snapshot?.levels?.takeProfit;

  if (
    bars.length === 0
    || ![entry, stopLoss, takeProfit].every((value) => typeof value === 'number' && Number.isFinite(value))
  ) {
    return {
      outcome: 'NONE',
      label: '',
      detail: '',
      hitIndex: -1,
      hitTimestamp: null,
      hitPrice: null
    };
  }

  const tradeStartIndex = resolveReplayTradeStartIndex(snapshot, bars);
  for (let index = tradeStartIndex; index < bars.length; index += 1) {
    const bar = bars[index];
    const targetHit = side === 'LONG' ? bar.high >= takeProfit : bar.low <= takeProfit;
    const stopHit = side === 'LONG' ? bar.low <= stopLoss : bar.high >= stopLoss;

    if (targetHit && stopHit) {
      return {
        outcome: 'AMBIGUOUS',
        label: 'HIT BOTH SAME BAR',
        detail: 'Saved bar touched both target and stop in the same candle.',
        hitIndex: index,
        hitTimestamp: bar.timestamp,
        hitPrice: entry
      };
    }
    if (targetHit) {
      return {
        outcome: 'TARGET_FIRST',
        label: 'HIT TARGET FIRST',
        detail: 'Saved bars show price reached the target before the stop.',
        hitIndex: index,
        hitTimestamp: bar.timestamp,
        hitPrice: takeProfit
      };
    }
    if (stopHit) {
      return {
        outcome: 'STOP_FIRST',
        label: 'HIT STOP FIRST',
        detail: 'Saved bars show price touched the stop before the target.',
        hitIndex: index,
        hitTimestamp: bar.timestamp,
        hitPrice: stopLoss
      };
    }
  }

  return {
    outcome: 'NONE',
    label: 'NO TARGET/STOP HIT YET',
    detail: 'Saved bars do not clearly show either level being hit first.',
    hitIndex: -1,
    hitTimestamp: null,
    hitPrice: null
  };
};

const buildReplayMoveMetrics = (snapshot, candidate) => {
  const bars = snapshot?.bars ?? [];
  const side = candidate?.side ?? snapshot?.side;
  const entry = candidate?.entry ?? snapshot?.levels?.entry;
  if (!bars.length || typeof entry !== 'number' || !Number.isFinite(entry)) {
    return null;
  }

  const tradeStartIndex = resolveReplayTradeStartIndex(snapshot, bars);
  const postEntryBars = bars.slice(tradeStartIndex);
  if (!postEntryBars.length) {
    return null;
  }

  const lastClose = postEntryBars[postEntryBars.length - 1]?.close ?? entry;
  const maxAfterEntry = Math.max(...postEntryBars.map((bar) => bar.high));
  const minAfterEntry = Math.min(...postEntryBars.map((bar) => bar.low));
  const favorableMove = side === 'LONG' ? maxAfterEntry - entry : entry - minAfterEntry;
  const adverseMove = side === 'LONG' ? entry - minAfterEntry : maxAfterEntry - entry;
  const netMove = side === 'LONG' ? lastClose - entry : entry - lastClose;
  const resolution = analyzeReplayResolution(snapshot, candidate);
  const lastDirection =
    netMove >= 0
      ? side === 'LONG'
        ? 'above entry'
        : 'below entry'
      : side === 'LONG'
        ? 'below entry'
        : 'above entry';
  const favorableLabel = side === 'LONG' ? 'Best push' : 'Best drop';
  const adverseLabel = side === 'LONG' ? 'Worst pullback' : 'Worst squeeze';
  const lastLabel = `Last ${fmtNum(Math.abs(netMove), 2)} pts ${lastDirection}`;
  return {
    tradeStartIndex,
    favorableMove,
    adverseMove,
    netMove,
    resolution,
    favorableLabel,
    adverseLabel,
    lastLabel,
    favorableStat: `${favorableLabel} ${fmtNum(favorableMove, 2)}`,
    adverseStat: `${adverseLabel} ${fmtNum(adverseMove, 2)}`,
    lastStat: lastLabel
  };
};

const renderReplayTradeBoxChartMarkup = (snapshot, candidate, options = {}) => {
  if (!snapshot?.bars?.length) {
    return '<div class="signalChartPlaceholder">Chart pending</div>';
  }

  const expanded = options.expanded === true;
  const width = expanded ? 440 : 320;
  const height = expanded ? 304 : 236;
  const padding = expanded
    ? { top: 16, right: 18, bottom: 18, left: 12 }
    : { top: 14, right: 16, bottom: 16, left: 10 };
  const bars = snapshot.bars;
  const side = candidate?.side ?? snapshot.side;
  const entry = candidate?.entry ?? snapshot.levels?.entry;
  const stopLoss = candidate?.stopLoss ?? snapshot.levels?.stopLoss;
  const takeProfit = candidate?.takeProfit?.[0] ?? snapshot.levels?.takeProfit;
  if (![entry, stopLoss, takeProfit].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return renderSignalChartMarkup(snapshot, options);
  }

  const allPrices = [...bars.flatMap((bar) => [bar.high, bar.low]), entry, stopLoss, takeProfit];
  const maxPrice = Math.max(...allPrices);
  const minPrice = Math.min(...allPrices);
  const range = Math.max(maxPrice - minPrice, 1e-6);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const plotBottom = padding.top + plotHeight;
  const slotWidth = plotWidth / bars.length;
  const bodyWidth = Math.max(5, slotWidth * 0.72);
  const wickColor = '#d7d55b';
  const upFill = '#25c3b0';
  const downFill = '#ff5c5c';
  const priceToY = (price) => padding.top + ((maxPrice - price) / range) * plotHeight;
  const candleX = (index) => padding.left + index * slotWidth + slotWidth / 2;
  const moveMetrics = buildReplayMoveMetrics(snapshot, candidate);
  const tradeStartIndex = moveMetrics?.tradeStartIndex ?? resolveReplayTradeStartIndex(snapshot, bars);
  const tradeStartX = candleX(tradeStartIndex) - slotWidth / 2;
  const plotRight = width - padding.right;
  const entryY = priceToY(entry);
  const stopY = priceToY(stopLoss);
  const targetY = priceToY(takeProfit);
  const resolution = moveMetrics?.resolution ?? analyzeReplayResolution(snapshot, candidate);
  const tradeDirectionGood =
    side === 'LONG'
      ? (bars[bars.length - 1]?.close ?? entry) >= entry
      : (bars[bars.length - 1]?.close ?? entry) <= entry;
  const trailTone = tradeDirectionGood ? '#52de9d' : '#ff6f78';
  const favorableMove = moveMetrics?.favorableMove ?? 0;
  const adverseMove = moveMetrics?.adverseMove ?? 0;
  const netMove = moveMetrics?.netMove ?? 0;
  const moveHeadline =
    favorableMove >= adverseMove * 1.35
      ? 'AFTER ENTRY PUSHED FAVORABLY'
      : adverseMove >= favorableMove * 1.35
        ? 'AFTER ENTRY REJECTED HARD'
        : Math.abs(netMove) <= Math.max(Math.abs(favorableMove), Math.abs(adverseMove)) * 0.2
          ? 'AFTER ENTRY CHOPPED SIDEWAYS'
          : netMove >= 0
            ? 'AFTER ENTRY HELD ABOVE ENTRY'
            : 'AFTER ENTRY FELL BACK THROUGH ENTRY';
  const moveDetail =
    netMove >= 0
      ? `${moveMetrics?.lastLabel ?? `Last ${fmtNum(Math.abs(netMove), 2)} pts favorable`} • Best ${fmtNum(favorableMove, 2)}`
      : `${moveMetrics?.lastLabel ?? `Last ${fmtNum(Math.abs(netMove), 2)} pts adverse`} • Worst ${fmtNum(adverseMove, 2)}`;
  const resolutionTone =
    resolution.outcome === 'TARGET_FIRST'
      ? '#52de9d'
      : resolution.outcome === 'STOP_FIRST'
        ? '#ff7c86'
        : 'rgba(244, 248, 251, 0.78)';
  const resolutionX =
    resolution.hitIndex >= tradeStartIndex ? candleX(resolution.hitIndex) : null;
  const resolutionY =
    resolution.outcome === 'TARGET_FIRST'
      ? targetY
      : resolution.outcome === 'STOP_FIRST'
        ? stopY
        : entryY;
  const profitTop = Math.min(entryY, targetY);
  const profitBottom = Math.max(entryY, targetY);
  const riskTop = Math.min(entryY, stopY);
  const riskBottom = Math.max(entryY, stopY);
  const previewShade = `
    <rect
      x="${padding.left}"
      y="${padding.top}"
      width="${Math.max(0, tradeStartX - padding.left)}"
      height="${plotHeight}"
      fill="rgba(13, 18, 28, 0.82)"
    />
  `;
  const tradeBoundary = `
    <line
      x1="${tradeStartX}"
      y1="${padding.top}"
      x2="${tradeStartX}"
      y2="${plotBottom}"
      stroke="rgba(93, 160, 255, 0.76)"
      stroke-width="1.15"
      stroke-dasharray="4 6"
    />
  `;
  const profitRect = `
    <rect
      x="${tradeStartX}"
      y="${profitTop}"
      width="${Math.max(0, plotRight - tradeStartX)}"
      height="${Math.max(2, profitBottom - profitTop)}"
      fill="rgba(38, 131, 123, 0.32)"
      stroke="rgba(62, 181, 168, 0.18)"
      stroke-width="1"
    />
  `;
  const riskRect = `
    <rect
      x="${tradeStartX}"
      y="${riskTop}"
      width="${Math.max(0, plotRight - tradeStartX)}"
      height="${Math.max(2, riskBottom - riskTop)}"
      fill="rgba(118, 53, 61, 0.44)"
      stroke="rgba(255, 107, 120, 0.14)"
      stroke-width="1"
    />
  `;

  const grid = [takeProfit, entry, stopLoss]
    .map(
      (price, index) => `
        <line
          x1="${padding.left}"
          y1="${priceToY(price)}"
          x2="${plotRight}"
          y2="${priceToY(price)}"
          stroke="${index === 1 ? 'rgba(230, 236, 244, 0.36)' : 'rgba(190, 204, 219, 0.22)'}"
          stroke-dasharray="${index === 1 ? '0' : '3 4'}"
          stroke-width="${index === 1 ? '1.1' : '1'}"
        />
      `
    )
    .join('');

  const candles = bars
    .map((bar, index) => {
      const x = candleX(index);
      const openY = priceToY(bar.open);
      const closeY = priceToY(bar.close);
      const highY = priceToY(bar.high);
      const lowY = priceToY(bar.low);
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(Math.abs(closeY - openY), 2);
      const fill = bar.close >= bar.open ? upFill : downFill;
      const opacity = index < tradeStartIndex ? 0.62 : 0.98;
      return `
        <line x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" stroke="${wickColor}" stroke-width="1.25" opacity="${Math.max(0.5, opacity - 0.06)}" />
        <rect x="${x - bodyWidth / 2}" y="${bodyTop}" width="${bodyWidth}" height="${bodyHeight}" rx="1.4" fill="${fill}" opacity="${opacity}" />
      `;
    })
    .join('');

  const tradeTrailPoints = bars
    .slice(tradeStartIndex)
    .map((bar, relativeIndex) => `${candleX(tradeStartIndex + relativeIndex)},${priceToY(bar.close)}`)
    .join(' ');
  const trailStartX = candleX(tradeStartIndex);
  const trailStartY = priceToY(bars[tradeStartIndex]?.close ?? entry);
  const trailEndX = candleX(bars.length - 1);
  const trailEndY = priceToY(bars[bars.length - 1]?.close ?? entry);
  const tradeTrail = `
    <polyline
      points="${tradeTrailPoints}"
      fill="none"
      stroke="rgba(8, 10, 14, 0.46)"
      stroke-width="${expanded ? '5.5' : '4.75'}"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity="0.9"
    />
    <polyline
      points="${tradeTrailPoints}"
      fill="none"
      stroke="${trailTone}"
      stroke-width="${expanded ? '2.8' : '2.35'}"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity="0.98"
    />
    <circle cx="${trailStartX}" cy="${trailStartY}" r="${expanded ? '4.8' : '4.1'}" fill="${trailTone}" stroke="rgba(8, 10, 14, 0.6)" stroke-width="2.4" />
    <circle cx="${trailEndX}" cy="${trailEndY}" r="${expanded ? '4.1' : '3.7'}" fill="${trailTone}" stroke="rgba(8, 10, 14, 0.54)" stroke-width="2" />
  `;

  const entryArrowX = candleX(tradeStartIndex);
  const entryArrowY = entryY;
  const entryDirectionUp = side === 'LONG';
  const entryArrow = entryDirectionUp
    ? `<path d="M ${entryArrowX} ${entryArrowY + 13} L ${entryArrowX - 7} ${entryArrowY + 25} L ${entryArrowX + 7} ${entryArrowY + 25} Z" fill="#3378ff" />`
    : `<path d="M ${entryArrowX} ${entryArrowY - 13} L ${entryArrowX - 7} ${entryArrowY - 25} L ${entryArrowX + 7} ${entryArrowY - 25} Z" fill="#3378ff" />`;
  const entryDot = `<circle cx="${tradeStartX}" cy="${entryY}" r="4.8" fill="#3ad16a" stroke="rgba(58, 209, 106, 0.22)" stroke-width="5" />`;
  const entryGuide = `
    <path
      d="M ${Math.max(padding.left + 4, tradeStartX - 36)} ${entryDirectionUp ? plotBottom - 10 : padding.top + 10}
         L ${Math.max(padding.left + 16, tradeStartX - 12)} ${entryDirectionUp ? entryY + 18 : entryY - 18}
         L ${tradeStartX} ${entryY}"
      fill="none"
      stroke="${entryDirectionUp ? '#3ad16a' : '#ff6f6f'}"
      stroke-width="2.1"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity="0.82"
    />
  `;
  const entryLabel = `
    <g>
      <rect
        x="${Math.max(padding.left + 12, tradeStartX - 46)}"
        y="${entryDirectionUp ? entryY - 30 : entryY + 14}"
        width="${expanded ? 86 : 78}"
        height="${expanded ? 18 : 16}"
        rx="8"
        fill="rgba(8, 12, 20, 0.84)"
        stroke="rgba(122, 170, 255, 0.38)"
        stroke-width="0.9"
      />
      <text
        x="${Math.max(padding.left + 12, tradeStartX - 46) + (expanded ? 43 : 39)}"
        y="${entryDirectionUp ? entryY - 18 : entryY + 25}"
        fill="rgba(244, 248, 251, 0.86)"
        font-size="${expanded ? '9.2' : '8.2'}"
        font-weight="700"
        text-anchor="middle"
      >${escapeHtml(`ENTER ${side === 'LONG' ? 'LONG' : 'SHORT'}`)}</text>
    </g>
  `;

  const priceTag = (label, price, y, tone) => {
    const formattedPrice = fmtNum(price, 2);
    const labelText = `${label} ${formattedPrice}`;
    const widthPx = expanded ? 74 : 64;
    const heightPx = expanded ? 19 : 17;
    const x = plotRight - widthPx;
    const fill =
      tone === 'target'
        ? 'rgba(38, 131, 123, 0.94)'
        : tone === 'stop'
          ? 'rgba(118, 53, 61, 0.96)'
          : 'rgba(62, 70, 82, 0.96)';
    const stroke =
      tone === 'target'
        ? '#46d9ba'
        : tone === 'stop'
          ? '#ff7c86'
          : 'rgba(230, 236, 244, 0.42)';
    return `
      <g>
        <path
          d="M ${x + 8} ${y - heightPx / 2}
             L ${x + widthPx} ${y - heightPx / 2}
             L ${x + widthPx} ${y + heightPx / 2}
             L ${x + 8} ${y + heightPx / 2}
             L ${x} ${y}
             Z"
          fill="${fill}"
          stroke="${stroke}"
          stroke-width="0.95"
        />
        <text
          x="${x + widthPx / 2 + 4}"
          y="${y + 3}"
          fill="#f8fbff"
          font-size="${expanded ? '8.1' : '7.4'}"
          font-weight="700"
          text-anchor="middle"
        >${escapeHtml(labelText)}</text>
      </g>
    `;
  };

  const trailHeadline = `
    <g>
      <rect
        x="${Math.max(padding.left + 14, tradeStartX + 10)}"
        y="${padding.top + 22}"
        width="${expanded ? 170 : 152}"
        height="${expanded ? 42 : 36}"
        rx="8"
        fill="rgba(8, 12, 20, 0.78)"
        stroke="rgba(255, 255, 255, 0.08)"
        stroke-width="0.8"
      />
      <text
        x="${Math.max(padding.left + 14, tradeStartX + 10) + (expanded ? 77 : 71)}"
        y="${padding.top + (expanded ? 32 : 31)}"
        fill="${trailTone}"
        font-size="${expanded ? '8' : '7.2'}"
        font-weight="700"
        text-anchor="middle"
        letter-spacing="0.03em"
      >${escapeHtml(moveHeadline)}</text>
      <text
        x="${Math.max(padding.left + 14, tradeStartX + 10) + (expanded ? 85 : 76)}"
        y="${padding.top + (expanded ? 44 : 41)}"
        fill="rgba(244, 248, 251, 0.7)"
        font-size="${expanded ? '7.2' : '6.6'}"
        font-weight="600"
        text-anchor="middle"
      >${escapeHtml(moveDetail)}</text>
      <text
        x="${Math.max(padding.left + 14, tradeStartX + 10) + (expanded ? 85 : 76)}"
        y="${padding.top + (expanded ? 55 : 50)}"
        fill="${resolutionTone}"
        font-size="${expanded ? '7.2' : '6.4'}"
        font-weight="700"
        text-anchor="middle"
      >${escapeHtml(resolution.label)}</text>
    </g>
  `;

  const resolutionMarker =
    resolutionX !== null
      ? `
        <g>
          <circle
            cx="${resolutionX}"
            cy="${resolutionY}"
            r="${expanded ? '4.8' : '4.2'}"
            fill="${resolutionTone}"
            stroke="rgba(8, 12, 20, 0.84)"
            stroke-width="2"
          />
          <path
            d="M ${resolutionX} ${resolutionY}
               L ${Math.min(plotRight - 110, resolutionX + 18)} ${Math.max(padding.top + 18, resolutionY - 18)}
               L ${plotRight - 92} ${Math.max(padding.top + 18, resolutionY - 18)}"
            fill="none"
            stroke="${resolutionTone}"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            opacity="0.92"
          />
          <rect
            x="${plotRight - 92}"
            y="${Math.max(padding.top + 10, resolutionY - 26)}"
            width="${expanded ? 88 : 82}"
            height="${expanded ? 18 : 16}"
            rx="8"
            fill="rgba(8, 12, 20, 0.88)"
            stroke="${resolutionTone}"
            stroke-width="0.9"
          />
          <text
            x="${plotRight - 48}"
            y="${Math.max(padding.top + 10, resolutionY - 26) + (expanded ? 12 : 11)}"
            fill="${resolutionTone}"
            font-size="${expanded ? '7.5' : '6.8'}"
            font-weight="800"
            text-anchor="middle"
          >${escapeHtml(resolution.outcome === 'TARGET_FIRST' ? 'TARGET FIRST' : resolution.outcome === 'STOP_FIRST' ? 'STOP FIRST' : resolution.outcome === 'AMBIGUOUS' ? 'BOTH SAME BAR' : 'UNRESOLVED')}</text>
        </g>
      `
      : '';

  const headlineBadge = `
    <g>
      <rect x="${padding.left}" y="${padding.top}" width="${expanded ? 112 : 92}" height="${expanded ? 18 : 16}" rx="8" fill="rgba(8, 12, 20, 0.82)" />
      <text x="${padding.left + (expanded ? 56 : 46)}" y="${padding.top + (expanded ? 12 : 11)}" fill="rgba(236, 242, 248, 0.82)" font-size="${expanded ? '9' : '8'}" font-weight="700" text-anchor="middle">
        ${escapeHtml(`${snapshot.symbol} ${snapshot.timeframe ?? '5m'} replay`)}
      </text>
    </g>
  `;

  return `
    <div class="signalChartStack signalChartStack-replay${expanded ? ' is-expanded' : ''}">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="${expanded ? 'xMidYMid meet' : 'none'}" aria-hidden="true">
        <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#232935" />
        ${previewShade}
        ${tradeBoundary}
        ${profitRect}
        ${riskRect}
        ${grid}
        ${candles}
        ${tradeTrail}
        ${entryGuide}
        ${entryDot}
        ${entryArrow}
        ${entryLabel}
        ${headlineBadge}
        ${trailHeadline}
        ${resolutionMarker}
        ${priceTag('TP', takeProfit, targetY, 'target')}
        ${priceTag('IN', entry, entryY, 'entry')}
        ${priceTag('SL', stopLoss, stopY, 'stop')}
      </svg>
    </div>
  `;
};

const summarizeReplayMove = (snapshot, candidate) => {
  const moveMetrics = buildReplayMoveMetrics(snapshot, candidate);
  if (!moveMetrics) {
    return {
      headline: 'Replay path unavailable',
      detail: 'No chart bars or entry price were stored with this setup.',
      stats: [],
      resolution: {
        label: 'PATH UNKNOWN',
        tone: 'is-neutral'
      }
    };
  }

  const { favorableMove, adverseMove, netMove, resolution, favorableStat, adverseStat, lastStat } = moveMetrics;

  const headline =
    favorableMove >= adverseMove * 1.35
      ? 'Price expanded in the trade direction after entry.'
      : adverseMove >= favorableMove * 1.35
        ? 'Price moved against the trade quickly after entry.'
        : Math.abs(netMove) <= Math.max(Math.abs(favorableMove), Math.abs(adverseMove), 1e-6) * 0.2
          ? 'Price mostly chopped around entry after the fill.'
          : netMove >= 0
            ? 'Price finished on the favorable side of entry.'
            : 'Price finished back through entry.';

  const detail = `${favorableStat} • ${adverseStat} • ${lastStat}`;
  const decoratedHeadline =
    resolution.outcome === 'TARGET_FIRST'
      ? 'Saved bars show target was hit first.'
      : resolution.outcome === 'STOP_FIRST'
        ? 'Saved bars show stop was hit first.'
        : headline;
  const decoratedDetail =
    resolution.outcome === 'TARGET_FIRST' || resolution.outcome === 'STOP_FIRST'
      ? `${resolution.detail} • ${detail}`
      : detail;

  return {
    headline: decoratedHeadline,
    detail: decoratedDetail,
    stats: [favorableStat, adverseStat, lastStat],
    resolution: {
      label: resolution.label || 'NO TARGET/STOP HIT YET',
      tone: replayResolutionTone(resolution.outcome)
    }
  };
};

const renderSignalChartMarkup = (snapshot, options = {}) => {
  if (!snapshot?.bars?.length) {
    return '<div class="signalChartPlaceholder">Chart pending</div>';
  }

  const expanded = options.expanded === true;
  const width = expanded ? 440 : 320;
  const height = expanded ? 292 : 182;
  const padding = expanded
    ? { top: 26, right: 132, bottom: 30, left: 16 }
    : { top: 22, right: 104, bottom: 28, left: 14 };
  const bars = snapshot.bars;
  const baseReferenceLevels =
    snapshot.referenceLevels?.filter((level) => typeof level.price === 'number') ??
    [
      {
        key: 'entry',
        label: 'Entry',
        price: snapshot.levels.entry,
        role: 'trade',
        onChart: true
      },
      {
        key: 'stopLoss',
        label: 'Stop',
        price: snapshot.levels.stopLoss,
        role: 'trade',
        onChart: true
      },
      {
        key: 'takeProfit',
        label: 'TP1',
        price: snapshot.levels.takeProfit,
        role: 'trade',
        onChart: true
      }
    ];
  const colorForLevel = (level) => {
    if (level.key === 'entry') {
      return { stroke: '#d5fff0', fill: 'rgba(28, 87, 74, 0.96)' };
    }
    if (level.key === 'stopLoss') {
      return { stroke: '#ff9898', fill: 'rgba(117, 40, 40, 0.96)' };
    }
    if (level.key === 'takeProfit') {
      return { stroke: '#88f2ba', fill: 'rgba(25, 92, 59, 0.96)' };
    }
    return level.role === 'structure'
      ? { stroke: '#ffc27b', fill: 'rgba(126, 80, 24, 0.96)' }
      : { stroke: '#8ab6ff', fill: 'rgba(37, 78, 132, 0.96)' };
  };
  const tradeLevels = baseReferenceLevels
    .filter((level) => level.role === 'trade')
    .map((level) => ({
      ...level,
      ...colorForLevel(level),
      dash: undefined,
      emphasized: true
    }));
  const structureLevels = baseReferenceLevels
    .filter((level) => level.role === 'structure' && level.onChart !== false)
    .slice(0, 2)
    .map((level) => ({
      ...level,
      ...colorForLevel(level),
      dash: '4 4',
      emphasized: false
    }));
  const contextLevels = baseReferenceLevels.filter((level) => level.role === 'context' || level.onChart === false);
  const levelDefinitions = [...tradeLevels, ...structureLevels].map((level) => ({
    ...level,
    valueLabel: expanded || level.role === 'trade' ? fmtNum(level.price, 2) : ''
  }));
  const zones = (snapshot.zones ?? [])
    .filter((zone) => zone.onChart !== false)
    .slice(0, 1)
    .map((zone) => ({
      ...zone,
      stroke: zone.role === 'structure' ? '#f3ba6c' : '#8ab6ff',
      fill: zone.role === 'structure' ? 'rgba(153, 96, 22, 0.18)' : 'rgba(37, 78, 132, 0.16)'
    }));

  const allPrices = [
    ...bars.flatMap((bar) => [bar.high, bar.low]),
    ...levelDefinitions.map((level) => level.price),
    ...zones.flatMap((zone) => [zone.low, zone.high])
  ];

  const maxPrice = Math.max(...allPrices);
  const minPrice = Math.min(...allPrices);
  const range = Math.max(maxPrice - minPrice, 1e-6);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const plotBottom = padding.top + plotHeight;
  const barGap = Math.max(2, plotWidth / (bars.length * 6));
  const slotWidth = plotWidth / bars.length;
  const bodyWidth = Math.max(4, slotWidth - barGap * 2);
  const priceToY = (price) => padding.top + ((maxPrice - price) / range) * plotHeight;
  const candleX = (index) => padding.left + index * slotWidth + slotWidth / 2;
  const labelGap = expanded ? 8 : 9;
  const labelX = width - padding.right + 8;
  const focusBarAt = snapshot.focusBarAt ?? bars[bars.length - 1]?.timestamp ?? snapshot.detectedAt;
  const focusIndex = Math.max(
    0,
    bars.findIndex((bar) => bar.timestamp === focusBarAt) >= 0
      ? bars.findIndex((bar) => bar.timestamp === focusBarAt)
      : bars.length - 1
  );

  const levelLine = (level) =>
    `<line x1="${padding.left}" y1="${priceToY(level.price)}" x2="${width - padding.right}" y2="${priceToY(level.price)}" stroke="${level.stroke}" stroke-width="${level.emphasized ? (expanded ? 1.9 : 1.5) : 1.15}" ${level.dash ? `stroke-dasharray="${level.dash}"` : ''} opacity="${level.emphasized ? '0.94' : '0.75'}" />`;

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

  const zonesMarkup = zones
    .map(
      (zone) => `
        <g>
          <rect
            x="${padding.left}"
            y="${priceToY(zone.high)}"
            width="${plotWidth}"
            height="${Math.max(2, priceToY(zone.low) - priceToY(zone.high))}"
            fill="${zone.fill}"
            stroke="${zone.stroke}"
            stroke-width="0.9"
            stroke-dasharray="3 4"
            rx="6"
          />
          <text
            x="${padding.left + 8}"
            y="${priceToY(zone.high) + 11}"
            fill="${zone.stroke}"
            font-size="${expanded ? '8' : '7.4'}"
            font-weight="700"
            letter-spacing="0.03em"
          >${escapeHtml(zone.label)}</text>
        </g>
      `
    )
    .join('');

  const focusX = candleX(focusIndex);
  const focusLine = `
    <g>
      <line
        x1="${focusX}"
        y1="${padding.top}"
        x2="${focusX}"
        y2="${plotBottom}"
        stroke="rgba(255, 246, 196, 0.72)"
        stroke-width="1.1"
        stroke-dasharray="3 5"
      />
      <rect
        x="${Math.max(padding.left, Math.min(focusX - 38, width - padding.right - 76))}"
        y="${padding.top - 16}"
        width="76"
        height="14"
        rx="7"
        fill="rgba(255, 209, 120, 0.16)"
        stroke="rgba(255, 214, 149, 0.42)"
        stroke-width="0.8"
      />
      <text
        x="${Math.max(padding.left + 38, Math.min(focusX, width - padding.right - 38))}"
        y="${padding.top - 6}"
        fill="#ffdba3"
        font-size="7.2"
        font-weight="700"
        text-anchor="middle"
        letter-spacing="0.04em"
      >Seen ${fmtTime(snapshot.detectedAt)}</text>
    </g>
  `;

  const gridLines = Array.from({ length: 4 }, (_, index) => minPrice + (range * (index + 1)) / 5)
    .map(
      (price) => `
        <line
          x1="${padding.left}"
          y1="${priceToY(price)}"
          x2="${width - padding.right}"
          y2="${priceToY(price)}"
          stroke="rgba(215, 235, 255, 0.08)"
          stroke-width="1"
        />
      `
    )
    .join('');

  const placedLabels = levelDefinitions
    .map((level) => ({
      ...level,
      targetY: priceToY(level.price),
      boxWidth: expanded && level.emphasized ? 96 : expanded ? 82 : 64,
      boxHeight: expanded && level.valueLabel ? 26 : expanded ? 18 : 16
    }))
    .sort((a, b) => a.targetY - b.targetY)
    .map((level, index, sorted) => {
      const previous = sorted[index - 1];
      const labelMinCenterY = padding.top + level.boxHeight / 2;
      const minCenterY = previous
        ? previous.labelCenterY + previous.boxHeight / 2 + level.boxHeight / 2 + labelGap
        : labelMinCenterY;
      const labelCenterY = Math.max(level.targetY, minCenterY, labelMinCenterY);
      return { ...level, labelCenterY };
    });

  for (let index = placedLabels.length - 1; index >= 0; index -= 1) {
    const next = placedLabels[index + 1];
    const level = placedLabels[index];
    const labelMaxCenterY = height - padding.bottom - level.boxHeight / 2;
    const labelMinCenterY = padding.top + level.boxHeight / 2;
    const maxCenterY = next
      ? next.labelCenterY - next.boxHeight / 2 - level.boxHeight / 2 - labelGap
      : labelMaxCenterY;
    placedLabels[index].labelCenterY = Math.min(level.labelCenterY, maxCenterY, labelMaxCenterY);
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
            stroke="${level.stroke}"
            stroke-width="1"
            opacity="0.55"
          />
          <rect
            x="${labelX}"
            y="${level.labelCenterY - level.boxHeight / 2}"
            width="${level.boxWidth}"
            height="${level.boxHeight}"
            rx="7"
            fill="${level.fill}"
            stroke="${level.stroke}"
            stroke-width="0.9"
          />
          <text
            x="${labelX + level.boxWidth / 2}"
            y="${expanded && level.valueLabel ? level.labelCenterY - 2.5 : level.labelCenterY + 3}"
            fill="#f6fbff"
            font-size="${expanded ? (level.valueLabel ? '7.2' : '8.1') : '8.2'}"
            font-weight="700"
            text-anchor="middle"
            letter-spacing="0.02em"
          >
            <tspan x="${labelX + level.boxWidth / 2}" dy="0">${escapeHtml(level.label)}</tspan>
            ${expanded && level.valueLabel ? `<tspan x="${labelX + level.boxWidth / 2}" dy="9.2" font-size="7.8">${escapeHtml(level.valueLabel)}</tspan>` : ''}
          </text>
        </g>
      `
    )
    .join('');

  const chartBadge = `
    <g>
      <rect x="${padding.left}" y="${padding.top}" width="${expanded ? 138 : 96}" height="${expanded ? 20 : 16}" rx="8" fill="rgba(6, 15, 25, 0.86)" stroke="rgba(213, 234, 255, 0.18)" />
      <text x="${padding.left + (expanded ? 69 : 48)}" y="${padding.top + (expanded ? 13 : 11)}" fill="#d8ecff" font-size="${expanded ? '9.2' : '8.2'}" font-weight="700" text-anchor="middle" letter-spacing="0.04em">
        ${escapeHtml(`${snapshot.symbol} ${snapshot.timeframe ?? '5m'} exact case`)}
      </text>
    </g>
  `;

  const setupBadge = `
    <g>
      <rect
        x="${width - padding.right - 96}"
        y="${padding.top}"
        width="96"
        height="${expanded ? 20 : 16}"
        rx="8"
        fill="rgba(11, 18, 30, 0.82)"
        stroke="rgba(213, 234, 255, 0.14)"
      />
      <text
        x="${width - padding.right - 48}"
        y="${padding.top + (expanded ? 13 : 11)}"
        fill="#f5f8ff"
        font-size="${expanded ? '8.6' : '7.7'}"
        font-weight="700"
        text-anchor="middle"
        letter-spacing="0.04em"
      >${escapeHtml(snapshot.side)}</text>
    </g>
  `;

  const timeLabelIndices = Array.from(new Set([0, focusIndex, bars.length - 1])).sort((a, b) => a - b);
  const timeAxis = `
    <g>
      <line
        x1="${padding.left}"
        y1="${plotBottom + 7}"
        x2="${width - padding.right}"
        y2="${plotBottom + 7}"
        stroke="rgba(213, 234, 255, 0.12)"
        stroke-width="1"
      />
      ${timeLabelIndices
        .map(
          (index) => `
            <g>
              <line
                x1="${candleX(index)}"
                y1="${plotBottom + 4}"
                x2="${candleX(index)}"
                y2="${plotBottom + 10}"
                stroke="rgba(213, 234, 255, 0.32)"
                stroke-width="1"
              />
              <text
                x="${candleX(index)}"
                y="${plotBottom + 21}"
                fill="rgba(221, 233, 245, 0.78)"
                font-size="${expanded ? '7.8' : '7.1'}"
                font-weight="${index === focusIndex ? '700' : '600'}"
                text-anchor="middle"
              >${fmtTime(index === focusIndex ? snapshot.detectedAt : bars[index]?.timestamp)}</text>
            </g>
          `
        )
        .join('')}
    </g>
  `;

  const legendItems = [...tradeLevels, ...structureLevels, ...zones];
  const legend = legendItems.length
    ? `
        <div class="signalChartLegend${expanded ? ' is-expanded' : ''}">
          ${legendItems
            .map((item) => {
              const price =
                typeof item.price === 'number'
                  ? fmtNum(item.price, 2)
                  : `${fmtNum(item.low, 2)} - ${fmtNum(item.high, 2)}`;
              const color = item.stroke;
              return `
                <span class="signalChartLegendChip">
                  <span class="signalChartLegendSwatch" style="--swatch:${color}"></span>
                  <span class="signalChartLegendText">${escapeHtml(item.label)}</span>
                  <span class="signalChartLegendPrice">${escapeHtml(price)}</span>
                </span>
              `;
            })
            .join('')}
        </div>
      `
    : '';
  const contextLegend = contextLevels.length
    ? `
        <div class="signalChartLegend signalChartLegend-secondary${expanded ? ' is-expanded' : ''}">
          ${contextLevels
            .map(
              (level) => `
                <span class="signalChartLegendChip is-muted">
                  <span class="signalChartLegendText">${escapeHtml(level.label)}</span>
                  <span class="signalChartLegendPrice">${escapeHtml(fmtNum(level.price, 2))}</span>
                </span>
              `
            )
            .join('')}
        </div>
      `
    : '';

  return `
    <div class="signalChartStack${expanded ? ' is-expanded' : ''}">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="${expanded ? 'xMidYMid meet' : 'none'}" aria-hidden="true">
        <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="rgba(5, 12, 21, 0.74)" />
        ${gridLines}
        ${zonesMarkup}
        ${focusLine}
        ${levelDefinitions.map(levelLine).join('')}
        ${candles}
        ${chartBadge}
        ${setupBadge}
        ${levelLabels}
        ${timeAxis}
      </svg>
      ${legend}
      ${contextLegend}
    </div>
  `;
};

const renderChartLightboxDetails = (context) => {
  const candidate = context?.candidate;
  const snapshot = context?.snapshot;
  if (!candidate && !snapshot) {
    return '';
  }

  const review = context?.review ?? null;
  const alert = context?.alert ?? null;
  const alertLike = buildAlertLikeContext(review ?? alert ?? null);

  const entry = candidate?.entry ?? snapshot?.levels?.entry;
  const stopLoss = candidate?.stopLoss ?? snapshot?.levels?.stopLoss;
  const takeProfit = candidate?.takeProfit?.[0] ?? snapshot?.levels?.takeProfit;
  const riskPoints =
    typeof entry === 'number' && typeof stopLoss === 'number' ? Math.abs(entry - stopLoss) : undefined;
  const rewardPoints =
    typeof entry === 'number' && typeof takeProfit === 'number' ? Math.abs(takeProfit - entry) : undefined;
  const seenAt = review?.detectedAt ?? alert?.detectedAt ?? snapshot?.detectedAt ?? snapshot?.generatedAt;
  const snapshotAt = snapshot?.generatedAt ?? snapshot?.detectedAt;
  const reviewedAt = review?.reviewedAt ?? review?.autoLabeledAt ?? alert?.reviewState?.reviewedAt;
  const signalSummary = alertLike ? formatSignalWhy(alertLike) : 'Setup context unavailable';
  const guardrailSummary = alertLike ? summarizeGuardrails(alertLike) : 'Guardrail context unavailable';
  const researchAgreement = alertLike ? researchAgreementMeta(alertLike) : null;
  const evidence = alertLike ? signalEvidenceTags(alertLike) : [];
  const learningImpact = review ? buildReplayLearningImpact(review) : { items: [], summary: '', details: [] };
  const hiddenContextLevels = (snapshot?.referenceLevels ?? []).filter(
    (level) => level.role === 'context' || level.onChart === false
  );
  const visibleStructureLevels = (snapshot?.referenceLevels ?? []).filter(
    (level) => level.role === 'structure' && level.onChart !== false
  );
  const visibleZones = (snapshot?.zones ?? []).filter((zone) => zone.onChart !== false);
  const reviewNote = review?.notes?.trim();
  const reviewStateSummary = review
    ? review.reviewStatus === 'COMPLETED'
      ? review.validity
        ? `${reviewValidityLabel(review.validity)} • ${reviewOutcomeLabel(review.outcome)}`
        : reviewOutcomeLabel(review.outcome)
      : review.autoOutcome
        ? `Auto-labeled ${reviewOutcomeLabel(review.autoOutcome)}`
        : 'Pending review'
    : alert?.reviewState?.acknowledgedAt
      ? 'Seen on desk'
      : alertLike?.riskDecision?.allowed
        ? 'Ready on desk'
        : 'Blocked on desk';
  const replayMove = context?.chartVariant === 'replay-trade-box' ? summarizeReplayMove(snapshot, candidate) : null;

  if (context?.chartVariant === 'replay-trade-box') {
    return `
      <div class="chart-lightbox-detail-stack chart-lightbox-detail-stack-compact">
        <div class="chart-lightbox-detail-grid chart-lightbox-detail-grid-compact">
          <article class="chart-lightbox-detail-card">
            <p class="chart-lightbox-detail-label">Entry</p>
            <p class="chart-lightbox-detail-value">${escapeHtml(fmtNum(entry, 2))}</p>
          </article>
          <article class="chart-lightbox-detail-card chart-lightbox-detail-card-stop">
            <p class="chart-lightbox-detail-label">Stop</p>
            <p class="chart-lightbox-detail-value">${escapeHtml(fmtNum(stopLoss, 2))}</p>
          </article>
          <article class="chart-lightbox-detail-card chart-lightbox-detail-card-target">
            <p class="chart-lightbox-detail-label">Target</p>
            <p class="chart-lightbox-detail-value">${escapeHtml(fmtNum(takeProfit, 2))}</p>
          </article>
          <article class="chart-lightbox-detail-card">
            <p class="chart-lightbox-detail-label">R / R</p>
            <p class="chart-lightbox-detail-value">${escapeHtml(calcRr(entry, stopLoss, takeProfit))}</p>
          </article>
        </div>
        <article class="chart-lightbox-story-card chart-lightbox-story-card-compact">
          <p class="chart-lightbox-detail-label">After Entry</p>
          <p class="chart-lightbox-story-copy">${escapeHtml(replayMove?.headline ?? 'Replay move unavailable')}</p>
          <p class="chart-lightbox-detail-note">${escapeHtml(replayMove?.detail ?? '')}</p>
        </article>
        <div class="chart-lightbox-context-grid chart-lightbox-context-grid-compact">
          <article class="chart-lightbox-context-card">
            <p class="chart-lightbox-detail-label">Seen</p>
            <p class="chart-lightbox-context-value">${escapeHtml(fmtDateTimeCompact(seenAt))}</p>
          </article>
          <article class="chart-lightbox-context-card">
            <p class="chart-lightbox-detail-label">Review State</p>
            <p class="chart-lightbox-context-value">${escapeHtml(reviewStateSummary)}</p>
          </article>
        </div>
        ${reviewNote ? `<article class="chart-lightbox-story-card chart-lightbox-story-card-compact"><p class="chart-lightbox-detail-label">Review Note</p><p class="chart-lightbox-story-copy">${escapeHtml(reviewNote)}</p></article>` : ''}
      </div>
    `;
  }

  return `
    <div class="chart-lightbox-detail-stack">
      <div class="chart-lightbox-detail-grid">
        <article class="chart-lightbox-detail-card">
          <p class="chart-lightbox-detail-label">Entry</p>
          <p class="chart-lightbox-detail-value">${escapeHtml(fmtNum(entry, 2))}</p>
        </article>
        <article class="chart-lightbox-detail-card chart-lightbox-detail-card-stop">
          <p class="chart-lightbox-detail-label">Stop Loss</p>
          <p class="chart-lightbox-detail-value">${escapeHtml(fmtNum(stopLoss, 2))}</p>
        </article>
        <article class="chart-lightbox-detail-card chart-lightbox-detail-card-target">
          <p class="chart-lightbox-detail-label">Take Profit</p>
          <p class="chart-lightbox-detail-value">${escapeHtml(fmtNum(takeProfit, 2))}</p>
        </article>
        <article class="chart-lightbox-detail-card">
          <p class="chart-lightbox-detail-label">Risk / Reward</p>
          <p class="chart-lightbox-detail-value">${escapeHtml(calcRr(entry, stopLoss, takeProfit))}</p>
          <p class="chart-lightbox-detail-note">
            ${escapeHtml(typeof riskPoints === 'number' ? `Risk ${fmtNum(riskPoints, 2)}` : '--')}
            ${escapeHtml(typeof rewardPoints === 'number' ? ` • Reward ${fmtNum(rewardPoints, 2)}` : '')}
          </p>
        </article>
      </div>
      <div class="chart-lightbox-context-grid">
        <article class="chart-lightbox-context-card">
          <p class="chart-lightbox-detail-label">Seen</p>
          <p class="chart-lightbox-context-value">${escapeHtml(fmtDateTimeCompact(seenAt))}</p>
          <p class="chart-lightbox-detail-note">${escapeHtml(fmtRelativeMinutes(seenAt))}</p>
        </article>
        <article class="chart-lightbox-context-card">
          <p class="chart-lightbox-detail-label">Snapshot Saved</p>
          <p class="chart-lightbox-context-value">${escapeHtml(fmtDateTimeCompact(snapshotAt))}</p>
          <p class="chart-lightbox-detail-note">${escapeHtml(fmtRelativeMinutes(snapshotAt))}</p>
        </article>
        <article class="chart-lightbox-context-card">
          <p class="chart-lightbox-detail-label">Review State</p>
          <p class="chart-lightbox-context-value">${escapeHtml(reviewStateSummary)}</p>
          <p class="chart-lightbox-detail-note">${escapeHtml(reviewedAt ? `Updated ${fmtDateTimeCompact(reviewedAt)}` : 'No manual review saved yet')}</p>
        </article>
        <article class="chart-lightbox-context-card">
          <p class="chart-lightbox-detail-label">Execution Read</p>
          <p class="chart-lightbox-context-value">${escapeHtml(alertLike?.riskDecision?.allowed ? 'Desk-ready' : 'Guardrail blocked')}</p>
          <p class="chart-lightbox-detail-note">${escapeHtml(typeof candidate?.oneMinuteConfidence === 'number' ? `1m confidence ${fmtNum(candidate.oneMinuteConfidence, 2)}` : '1m confidence unavailable')}</p>
        </article>
      </div>
      <article class="chart-lightbox-story-card">
        <p class="chart-lightbox-detail-label">Desk Read</p>
        <p class="chart-lightbox-story-copy">${escapeHtml(signalSummary)}</p>
      </article>
      <article class="chart-lightbox-story-card">
        <p class="chart-lightbox-detail-label">Guardrails</p>
        <p class="chart-lightbox-story-copy">${escapeHtml(guardrailSummary)}</p>
      </article>
      ${
        researchAgreement
          ? `<article class="chart-lightbox-story-card">
              <p class="chart-lightbox-detail-label">Engine Agreement</p>
              <div class="chart-lightbox-chip-row">
                ${researchAgreement.chips.map((chip) => `<span class="${chip.className}">${chip.label}</span>`).join('')}
              </div>
              <p class="chart-lightbox-story-copy">${escapeHtml(researchAgreement.note)}</p>
            </article>`
          : ''
      }
      ${
        learningImpact.items.length
          ? `<article class="chart-lightbox-story-card">
              <p class="chart-lightbox-detail-label">Learning Impact</p>
              <div class="chart-lightbox-chip-row">
                ${learningImpact.items.map((item) => `<span class="${item.className}">${escapeHtml(item.label)}</span>`).join('')}
              </div>
              <p class="chart-lightbox-story-copy">${escapeHtml(learningImpact.summary)}</p>
            </article>`
          : ''
      }
      ${evidence.length ? `<div class="chart-lightbox-chip-row">${evidence.map((tag) => `<span class="evidence-chip">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      ${
        visibleStructureLevels.length || visibleZones.length || hiddenContextLevels.length
          ? `
              <article class="chart-lightbox-story-card">
                <p class="chart-lightbox-detail-label">Reference Map</p>
                <div class="chart-lightbox-chip-row">
                  ${visibleStructureLevels
                    .map(
                      (level) =>
                        `<span class="evidence-chip">${escapeHtml(`${level.label} ${fmtNum(level.price, 2)}`)}</span>`
                    )
                    .join('')}
                  ${visibleZones
                    .map(
                      (zone) =>
                        `<span class="evidence-chip">${escapeHtml(`${zone.label} ${fmtNum(zone.low, 2)}-${fmtNum(zone.high, 2)}`)}</span>`
                    )
                    .join('')}
                  ${hiddenContextLevels
                    .map(
                      (level) =>
                        `<span class="evidence-chip evidence-chip-muted">${escapeHtml(`${level.label} ${fmtNum(level.price, 2)}`)}</span>`
                    )
                    .join('')}
                </div>
              </article>
            `
          : ''
      }
      ${reviewNote ? `<article class="chart-lightbox-story-card"><p class="chart-lightbox-detail-label">Review Note</p><p class="chart-lightbox-story-copy">${escapeHtml(reviewNote)}</p></article>` : ''}
    </div>
  `;
};

const configureExpandableChart = (chartEl, context = {}) => {
  if (!chartEl) {
    return;
  }

  if (chartEl.querySelector('svg')) {
    chartEl.classList.add('is-expandable');
    chartEl.tabIndex = 0;
    chartEl.setAttribute('role', 'button');
    chartEl.setAttribute('aria-label', `Expand ${context.title || 'chart'}`);
    chartEl.dataset.chartLightboxTitle = context.title || 'Trigger Snapshot';
    chartEl.dataset.chartLightboxMeta = context.meta || 'Swipe down to return to the desk.';
    chartLightboxContext.set(chartEl, context);
    return;
  }

  chartEl.classList.remove('is-expandable');
  chartEl.removeAttribute('role');
  chartEl.removeAttribute('aria-label');
  chartEl.removeAttribute('tabindex');
  delete chartEl.dataset.chartLightboxTitle;
  delete chartEl.dataset.chartLightboxMeta;
  chartLightboxContext.delete(chartEl);
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
  chartLightboxGesture.scrollTop = 0;
  chartLightboxSheetEl?.classList.remove('is-dragging');
  setChartLightboxOffset(0);
  chartLightboxEl.hidden = true;
  chartLightboxEl.setAttribute('aria-hidden', 'true');
  if (chartLightboxFrameEl) {
    chartLightboxFrameEl.innerHTML = '';
    chartLightboxFrameEl.classList.remove('is-replay-compact');
  }
  document.body.classList.remove('chart-lightbox-open');
};

const openChartLightbox = (chartEl) => {
  if (
    !chartLightboxEl
    || !chartLightboxFrameEl
    || !chartLightboxTitleEl
    || !chartLightboxMetaEl
    || !chartEl?.querySelector('svg')
  ) {
    return;
  }

  try {
    const context = chartLightboxContext.get(chartEl) ?? {};
    chartLightboxTitleEl.textContent = context.title || chartEl.dataset.chartLightboxTitle || 'Trigger Snapshot';
    chartLightboxMetaEl.textContent = context.meta || chartEl.dataset.chartLightboxMeta || 'Swipe down to return to the desk.';
    const expandedChartMarkup =
      context.chartVariant === 'replay-trade-box'
        ? renderReplayTradeBoxChartMarkup(context.snapshot, context.candidate, { expanded: true })
        : renderSignalChartMarkup(context.snapshot, { expanded: true });
    chartLightboxFrameEl.innerHTML = context.snapshot
      ? `
          <div class="chart-lightbox-chart">${expandedChartMarkup}</div>
          ${renderChartLightboxDetails(context)}
        `
      : chartEl.innerHTML;
    chartLightboxFrameEl.classList.toggle('is-replay-compact', context.chartVariant === 'replay-trade-box');
    chartLightboxEl.hidden = false;
    chartLightboxEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('chart-lightbox-open');
    chartLightboxGesture.active = false;
    chartLightboxGesture.startY = 0;
    chartLightboxGesture.offsetY = 0;
    chartLightboxGesture.scrollTop = 0;
    chartLightboxSheetEl?.classList.remove('is-dragging');
    setChartLightboxOffset(0);
    if (chartLightboxSheetEl) {
      chartLightboxSheetEl.scrollTop = 0;
    }
  } catch (error) {
    console.error('Failed to open chart lightbox', error);
    setStatus('Status: replay preview failed to open', true);
  }
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

    const dragHandle = event.target.closest('.chart-lightbox-grabber, .chart-lightbox-head');
    chartLightboxGesture.scrollTop = chartLightboxSheetEl.scrollTop;
    chartLightboxGesture.active = Boolean(dragHandle) && chartLightboxSheetEl.scrollTop <= 0;
    chartLightboxGesture.startY = event.touches[0].clientY;
    chartLightboxGesture.offsetY = 0;
    if (chartLightboxGesture.active) {
      chartLightboxSheetEl.classList.add('is-dragging');
    }
  });

  chartLightboxSheetEl.addEventListener(
    'touchmove',
    (event) => {
      if (!chartLightboxGesture.active) {
        return;
      }

      if (chartLightboxSheetEl.scrollTop > 0) {
        chartLightboxGesture.active = false;
        chartLightboxSheetEl.classList.remove('is-dragging');
        setChartLightboxOffset(0);
        return;
      }

      const deltaY = event.touches[0].clientY - chartLightboxGesture.startY;
      if (deltaY <= 0) {
        chartLightboxGesture.active = false;
        chartLightboxSheetEl.classList.remove('is-dragging');
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
    chartLightboxGesture.scrollTop = 0;
    setChartLightboxOffset(0);
  });

  chartLightboxSheetEl.addEventListener('touchcancel', () => {
    chartLightboxGesture.active = false;
    chartLightboxGesture.startY = 0;
    chartLightboxGesture.offsetY = 0;
    chartLightboxGesture.scrollTop = 0;
    chartLightboxSheetEl.classList.remove('is-dragging');
    setChartLightboxOffset(0);
  });
};

const renderTradingViewPlanMarkup = (context) => {
  const candidate = context?.candidate;
  if (!candidate) {
    return '';
  }

  return `
    <div class="chart-lightbox-detail-grid">
      <article class="chart-lightbox-detail-card">
        <p class="chart-lightbox-detail-label">Entry</p>
        <p class="chart-lightbox-detail-value">${fmtNum(candidate.entry, 2)}</p>
      </article>
      <article class="chart-lightbox-detail-card chart-lightbox-detail-card-stop">
        <p class="chart-lightbox-detail-label">Stop Loss</p>
        <p class="chart-lightbox-detail-value">${fmtNum(candidate.stopLoss, 2)}</p>
      </article>
      <article class="chart-lightbox-detail-card chart-lightbox-detail-card-target">
        <p class="chart-lightbox-detail-label">Take Profit</p>
        <p class="chart-lightbox-detail-value">${fmtNum(candidate.takeProfit?.[0], 2)}</p>
      </article>
      <article class="chart-lightbox-detail-card">
        <p class="chart-lightbox-detail-label">Risk / Reward</p>
        <p class="chart-lightbox-detail-value">${calcRr(candidate.entry, candidate.stopLoss, candidate.takeProfit?.[0])}</p>
        <p class="chart-lightbox-detail-note">${setupLabel(context?.setupType)} • ${context?.side ?? '--'}</p>
      </article>
    </div>
  `;
};

const closeTradingViewViewer = () => {
  if (!tradingViewViewerEl || tradingViewViewerEl.hidden) {
    return;
  }

  tradingViewViewerEl.hidden = true;
  tradingViewViewerEl.setAttribute('aria-hidden', 'true');
  tradingViewViewerContext = null;
  if (tradingViewViewerFrameEl) {
    tradingViewViewerFrameEl.innerHTML = '';
  }
  if (tradingViewViewerPlanEl) {
    tradingViewViewerPlanEl.innerHTML = '';
  }
  document.body.classList.remove('tv-viewer-open');
};

const openTradingViewViewer = (context) => {
  if (!tradingViewViewerEl || !tradingViewViewerFrameEl) {
    window.open(buildTradingViewUrl(context.symbol, context.interval ?? '5'), '_blank', 'noopener,noreferrer');
    return;
  }

  tradingViewViewerContext = context;
  tradingViewViewerTitleEl.textContent = context.title || `${context.symbol} TradingView`;
  tradingViewViewerMetaEl.textContent = context.meta || 'Confirm structure here before executing in Tradovate / E8.';
  tradingViewViewerPlanEl.innerHTML = renderTradingViewPlanMarkup(context);
  tradingViewViewerFrameEl.innerHTML = `
    <div class="tradingview-widget-container">
      <div class="tradingview-widget-container__widget"></div>
    </div>
  `;
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.async = true;
  script.src = tradingViewWidgetScriptUrl;
  script.text = JSON.stringify({
    autosize: true,
    symbol: tradingViewSymbolMap[context.symbol] ?? context.symbol,
    interval: context.interval ?? '5',
    timezone: 'America/Chicago',
    theme: 'dark',
    style: '1',
    locale: 'en',
    enable_publishing: false,
    allow_symbol_change: false,
    hide_top_toolbar: false,
    hide_legend: false,
    save_image: false,
    calendar: false,
    details: false,
    support_host: 'https://www.tradingview.com'
  });
  script.onerror = () => {
    tradingViewViewerFrameEl.innerHTML = `
      <div class="tv-viewer-fallback">
        <p class="tv-viewer-fallback-title">TradingView embed did not load.</p>
        <p class="tv-viewer-fallback-note">Open the full chart directly to confirm structure.</p>
      </div>
    `;
  };
  tradingViewViewerFrameEl.querySelector('.tradingview-widget-container')?.appendChild(script);
  tradingViewViewerEl.hidden = false;
  tradingViewViewerEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('tv-viewer-open');
};

const bindTradingViewViewer = () => {
  if (tradingViewViewerBound || !tradingViewViewerEl) {
    return;
  }

  tradingViewViewerBound = true;

  tradingViewViewerBackdropEl?.addEventListener('click', closeTradingViewViewer);
  tradingViewViewerCloseEl?.addEventListener('click', closeTradingViewViewer);
  tradingViewViewerExternalEl?.addEventListener('click', () => {
    if (!tradingViewViewerContext) {
      return;
    }
    window.open(
      buildTradingViewUrl(tradingViewViewerContext.symbol, tradingViewViewerContext.interval ?? '5'),
      '_blank',
      'noopener,noreferrer'
    );
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && tradingViewViewerEl && !tradingViewViewerEl.hidden) {
      closeTradingViewViewer();
    }
  });
};

const hydrateTradingViewChecklist = (node, context) => {
  const { alertId, symbol, interval = '5' } = context;
  const openTvBtn = node.querySelector('.openTradingViewBtn');
  const checklistSummaryEl = node.querySelector('.tvChecklistSummary');
  const checklistToggles = [...node.querySelectorAll('.tvChecklistToggle')];

  if (openTvBtn) {
    openTvBtn.addEventListener('click', () => {
      openTradingViewViewer(context);
    });
  }

  if (!checklistSummaryEl || !checklistToggles.length || !alertId) {
    return;
  }

  const applySummary = (state) => {
    checklistSummaryEl.textContent = `TV checklist ${countTvChecklistChecks(state)}/${tvChecklistFields.length}`;
  };

  const initialState = getTvChecklistState(alertId);
  checklistToggles.forEach((toggle) => {
    toggle.checked = Boolean(initialState[toggle.value]);
    toggle.addEventListener('change', () => {
      const nextState = setTvChecklistState(alertId, toggle.value, toggle.checked);
      applySummary(nextState);
    });
  });
  applySummary(initialState);
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
const hasNativePush = () => Boolean(getNativePushPlugin()?.requestPermissions && getNativePushPlugin()?.register);

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
  const isNativeApp = Boolean(window.Capacitor?.isNativePlatform?.());
  if (isNativeApp && nativePush?.requestPermissions && nativePush?.register) {
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
  const normalizedTab = normalizeTabName(tabName);
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === normalizedTab;
    button.classList.toggle('is-active', isActive);
    if (isActive) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });

  quickActionButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.targetTab === normalizedTab);
  });

  Object.entries(views).forEach(([name, view]) => {
    const isActive = name === normalizedTab;
    view.classList.toggle('is-active', isActive);
    // Force display via inline style with !important so no stale CSS can override
    view.style.setProperty('display', isActive ? 'block' : 'none', 'important');
    if (isActive) {
      view.scrollTop = 0;
    }
  });

  updateRouteState({
    tab: normalizedTab,
    alertId: normalizedTab === 'signals' ? activeRouteAlertId : null
  });
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
    'X-TradeAssist-Client': 'mobile-web',
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

const bindServiceWorkerMessages = () => {
  if (!('serviceWorker' in navigator) || serviceWorkerMessageListenerBound) {
    return;
  }

  serviceWorkerMessageListenerBound = true;
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event?.data?.type !== 'PUSH_RECEIVED') {
      return;
    }

    const payload = event.data.payload || {};
    const title = payload.title || 'TradeAssist update';
    const body = payload.body || 'A new update is ready.';
    setStatus(`Status: ${title} • ${body}`);
    void refreshAll();
  });
};

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .register('sw.js')
      .then((registration) => {
        bindServiceWorkerMessages();
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

const renderResearchDiagnostics = (research) => {
  if (diagResearchHypothesesEl) {
    renderResearchHypothesisChips(
      diagResearchHypothesesEl,
      research?.knowledgeBase?.activeHypotheses ?? [],
      'No active hypotheses'
    );
  }

  if (diagResearchBestThesisEl) {
    const bestThesis = research?.knowledgeBase?.bestThesis ?? null;
    diagResearchBestThesisEl.textContent = bestThesis
      ? `${bestThesis.label} • ${fmtNum((Number(bestThesis.hitRate) || 0) * 100, 0)}% hit rate • ${bestThesis.evaluated ?? 0}/${bestThesis.total ?? 0} evaluated`
      : 'The research engine has not scored a thesis yet.';
  }

  if (diagResearchInsightEl) {
    const latestInsight = research?.knowledgeBase?.recentInsights?.[0] ?? null;
    diagResearchInsightEl.textContent = latestInsight
      ? `${latestInsight.headline} • ${fmtRelativeMinutes(latestInsight.at)}`
      : 'No recent research insight yet.';
  }
};

const renderPaperAutonomyDiagnostics = (autonomy) => {
  if (!diagPaperAutonomyStatusEl) {
    return;
  }

  if (!autonomy?.enabled) {
    diagPaperAutonomyStatusEl.textContent = '--';
    diagPaperAutonomyIdeasEl.textContent = '--';
    diagPaperAutonomyWinRateEl.textContent = '--';
    diagPaperAutonomyPnlEl.textContent = '--';
    diagPaperAutonomyBestThesisEl.textContent = '--';
    diagPaperAutonomyLastIdeaEl.textContent = '--';
    if (diagPaperAutonomySymbolsEl) {
      renderEmpty(diagPaperAutonomySymbolsEl, 'Paper autonomy diagnostics unavailable.');
    }
    if (diagPaperAutonomyThesesEl) {
      renderEmpty(diagPaperAutonomyThesesEl, 'No autonomy thesis activity yet.');
    }
    return;
  }

  const latestIdea = autonomy.latestIdea ?? autonomy.recentIdeas?.[0] ?? null;
  diagPaperAutonomyStatusEl.textContent = `${autonomy.started ? 'Live' : 'Loading'} • ${formatDeskWindow(autonomy.session)}`;
  diagPaperAutonomyIdeasEl.textContent = `${autonomy.openIdeas ?? 0} open • ${autonomy.closedIdeas ?? 0} closed • ${autonomy.totalIdeas ?? 0} total`;
  diagPaperAutonomyWinRateEl.textContent = `${Math.round(Number(autonomy.winRate ?? 0) * 100)}% • ${autonomy.performance?.wins ?? 0}/${autonomy.performance?.learningSamples ?? 0}`;
  diagPaperAutonomyPnlEl.textContent = `${fmtSignedUsd(autonomy.performance?.realizedPnl ?? 0)} • ${fmtNum(autonomy.performance?.realizedR ?? 0, 2)}R`;
  diagPaperAutonomyBestThesisEl.textContent = autonomy.bestThesis
    ? `${autonomy.bestThesis.label} • ${Math.round(Number(autonomy.bestThesis.hitRate ?? 0) * 100)}% • ${fmtNum(autonomy.bestThesis.avgR ?? 0, 2)}R avg`
    : 'No autonomy thesis has enough closed trades to score yet.';
  diagPaperAutonomyLastIdeaEl.textContent = latestIdea
    ? `${latestIdea.symbol} ${latestIdea.side} • ${latestIdea.thesisLabel ?? paperAutonomyThesisLabel(latestIdea.thesis)} • ${fmtRelativeMinutes(latestIdea.openedAt)} • ${latestIdea.reason}`
    : 'No autonomy idea opened yet.';

  renderPaperAutonomySymbolCards(
    diagPaperAutonomySymbolsEl,
    autonomy.symbolStatus ?? [],
    'No autonomy symbol bias yet.'
  );
  renderPaperAutonomyThesisCards(
    diagPaperAutonomyThesesEl,
    (autonomy.thesisStats ?? []).filter((entry) => (entry.openIdeas ?? entry.open ?? 0) > 0 || (entry.open ?? 0) > 0),
    'No active autonomy thesis'
  );
};

const getSelfLearningStatus = () => latestSelfLearningStatus ?? latestDiagnostics?.diagnostics?.selfLearning ?? null;

const getSelfLearningProfile = () => getSelfLearningStatus()?.profile ?? null;

const describeLearningBucketLabel = (category, bucket) => {
  if (!bucket) {
    return '--';
  }

  if (category === 'setupSymbol') {
    const [setupType, symbol] = String(bucket.key).split('|');
    return setupType && symbol ? `${symbol} • ${setupLabel(setupType)}` : bucket.label;
  }

  if (category === 'setup') {
    return setupLabel(bucket.key);
  }

  if (category === 'research') {
    return `Research ${researchDirectionLabel(bucket.key)}`;
  }

  if (category === 'autonomy') {
    return paperAutonomyThesisLabel(bucket.key);
  }

  if (category === 'symbol') {
    return `${bucket.key} futures`;
  }

  return bucket.label;
};

const learningBucketMeta = (bucket) =>
  `${bucket.scoreAdjustment > 0 ? '+' : ''}${fmtNum(bucket.scoreAdjustment, 1)} score • ${fmtNum(bucket.winRate * 100, 0)}% win • ${bucket.resolved} resolved`;

const learningBucketNote = (bucket) =>
  `${fmtNum(bucket.avgR, 2)}R avg • confidence ${fmtNum(bucket.confidence * 100, 0)}% • risk x${fmtNum(bucket.riskMultiplier, 2)}`;

const buildLearningBucketPool = (profile) => [
  ...(profile?.bySetupSymbol ?? []).map((bucket) => ({ category: 'setupSymbol', bucket })),
  ...(profile?.bySetup ?? []).map((bucket) => ({ category: 'setup', bucket })),
  ...(profile?.bySymbol ?? []).map((bucket) => ({ category: 'symbol', bucket })),
  ...(profile?.byResearchDirection ?? []).map((bucket) => ({ category: 'research', bucket })),
  ...(profile?.byAutonomyThesis ?? []).map((bucket) => ({ category: 'autonomy', bucket }))
];

const pickLearningEdge = (pool, direction) => {
  const filtered = pool.filter(({ bucket }) =>
    direction === 'positive' ? Number(bucket.scoreAdjustment) > 0 : Number(bucket.scoreAdjustment) < 0
  );

  return filtered.sort((left, right) => {
    const leftScore = Math.abs(Number(left.bucket.scoreAdjustment) || 0);
    const rightScore = Math.abs(Number(right.bucket.scoreAdjustment) || 0);
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    return (Number(right.bucket.resolved) || 0) - (Number(left.bucket.resolved) || 0);
  })[0] ?? null;
};

const renderLearningBucketList = (container, entries, emptyMessage) => {
  if (!container) {
    return;
  }

  container.innerHTML = '';
  if (!entries.length) {
    renderEmpty(container, emptyMessage);
    return;
  }

  entries.forEach(({ category, bucket }) => {
    const card = document.createElement('article');
    card.className = 'learning-pattern-card';
    card.innerHTML = `
      <div class="learning-pattern-head">
        <p class="learning-pattern-title">${escapeHtml(describeLearningBucketLabel(category, bucket))}</p>
        <span class="pill ${Number(bucket.scoreAdjustment) >= 0 ? 'chip-online' : 'chip-offline'}">${escapeHtml(learningBucketMeta(bucket))}</span>
      </div>
      <p class="learning-pattern-note">${escapeHtml(learningBucketNote(bucket))}</p>
    `;
    container.appendChild(card);
  });
};

const renderReviewInsights = () => {
  const status = getSelfLearningStatus();
  const profile = getSelfLearningProfile();
  const pendingCount = reviewSummary.pending ?? latestReviews.filter((review) => review.reviewStatus === 'PENDING').length;
  const completedCount = reviewSummary.completed ?? latestReviews.filter((review) => review.reviewStatus === 'COMPLETED').length;
  const pool = buildLearningBucketPool(profile);
  const bestEdge = pickLearningEdge(pool, 'positive');
  const biggestDrag = pickLearningEdge(pool, 'negative');
  const researchEdge = pickLearningEdge(
    (profile?.byResearchDirection ?? []).map((bucket) => ({ category: 'research', bucket })),
    'positive'
  ) ?? ((profile?.byResearchDirection?.[0] ?? null) ? { category: 'research', bucket: profile.byResearchDirection[0] } : null);
  const autonomyEdge = pickLearningEdge(
    (profile?.byAutonomyThesis ?? []).map((bucket) => ({ category: 'autonomy', bucket })),
    'positive'
  ) ?? ((profile?.byAutonomyThesis?.[0] ?? null) ? { category: 'autonomy', bucket: profile.byAutonomyThesis[0] } : null);

  if (!status?.enabled || !profile) {
    if (reviewSummaryChipEl) {
      reviewSummaryChipEl.textContent = `${pendingCount} awaiting outcome`;
    }
    if (learningProfileChipEl) {
      learningProfileChipEl.textContent = 'Learning profile unavailable';
    }
    if (learningHeadlineEl) {
      learningHeadlineEl.textContent = 'The learning engine has not loaded a profile yet.';
    }
    if (learningContextEl) {
      learningContextEl.textContent = 'Once resolved trades accumulate, this tab will show what the model is learning from wins, losses, research direction, and autonomy thesis results.';
    }
    if (learningResolvedRecordsEl) {
      learningResolvedRecordsEl.textContent = '--';
    }
    if (learningRefreshStateEl) {
      learningRefreshStateEl.textContent = '--';
    }
    if (learningTopWinReasonEl) {
      learningTopWinReasonEl.textContent = '--';
    }
    if (learningTopLossReasonEl) {
      learningTopLossReasonEl.textContent = '--';
    }
    if (learningBestEdgeEl) {
      learningBestEdgeEl.textContent = '--';
    }
    if (learningBiggestDragEl) {
      learningBiggestDragEl.textContent = '--';
    }
    if (learningResearchEdgeEl) {
      learningResearchEdgeEl.textContent = '--';
    }
    if (learningAutonomyEdgeEl) {
      learningAutonomyEdgeEl.textContent = '--';
    }
    renderLearningBucketList(learningFavoringListEl, [], 'No learned edge is strong enough yet.');
    renderLearningBucketList(learningAvoidingListEl, [], 'No learned drag is strong enough yet.');
    return;
  }

  const favoring = pool
    .filter(({ bucket }) => Number(bucket.scoreAdjustment) > 0)
    .sort((left, right) => Number(right.bucket.scoreAdjustment) - Number(left.bucket.scoreAdjustment))
    .slice(0, 4);
  const avoiding = pool
    .filter(({ bucket }) => Number(bucket.scoreAdjustment) < 0)
    .sort((left, right) => Number(left.bucket.scoreAdjustment) - Number(right.bucket.scoreAdjustment))
    .slice(0, 4);
  const topWinReason = profile.topWinReasons?.[0] ?? null;
  const topLossReason = profile.topLossReasons?.[0] ?? null;

  if (reviewSummaryChipEl) {
    reviewSummaryChipEl.textContent = `${profile.resolvedRecords} learned • ${pendingCount} awaiting outcome`;
  }
  if (learningProfileChipEl) {
    learningProfileChipEl.textContent = `${profile.resolvedRecords} resolved • ${status.refreshIntervalMinutes}m refresh`;
  }
  if (learningHeadlineEl) {
    learningHeadlineEl.textContent = bestEdge
      ? `Lean into ${describeLearningBucketLabel(bestEdge.category, bestEdge.bucket)}`
      : 'The learning engine is still collecting a clear edge.';
  }
  if (learningContextEl) {
    learningContextEl.textContent = bestEdge && biggestDrag
      ? `The model is currently favoring ${describeLearningBucketLabel(bestEdge.category, bestEdge.bucket)} and pulling back from ${describeLearningBucketLabel(biggestDrag.category, biggestDrag.bucket)}. ${pendingCount} case${pendingCount === 1 ? '' : 's'} are still awaiting outcome confirmation from the engine.`
      : `${profile.recentResolvedRecords} resolved trades from the last ${status.recentWindowDays}d are shaping the current edge profile. ${completedCount} completed case${completedCount === 1 ? '' : 's'} are already in the learning loop.`;
  }
  if (learningResolvedRecordsEl) {
    learningResolvedRecordsEl.textContent = `${profile.resolvedRecords} resolved • ${profile.totalRecords} total records`;
  }
  if (learningRefreshStateEl) {
    learningRefreshStateEl.textContent = status.lastRefreshedAt
      ? `${fmtRelativeMinutes(status.lastRefreshedAt)} • ${status.recentWindowDays}d window`
      : `${status.refreshIntervalMinutes}m refresh cadence`;
  }
  if (learningTopWinReasonEl) {
    learningTopWinReasonEl.textContent = topWinReason ? `${topWinReason.key} • ${topWinReason.count}` : 'No consistent win reason yet.';
  }
  if (learningTopLossReasonEl) {
    learningTopLossReasonEl.textContent = topLossReason ? `${topLossReason.key} • ${topLossReason.count}` : 'No consistent loss reason yet.';
  }
  if (learningBestEdgeEl) {
    learningBestEdgeEl.textContent = bestEdge
      ? `${describeLearningBucketLabel(bestEdge.category, bestEdge.bucket)} • ${learningBucketMeta(bestEdge.bucket)}`
      : 'No positive edge has enough evidence yet.';
  }
  if (learningBiggestDragEl) {
    learningBiggestDragEl.textContent = biggestDrag
      ? `${describeLearningBucketLabel(biggestDrag.category, biggestDrag.bucket)} • ${learningBucketMeta(biggestDrag.bucket)}`
      : 'No negative drag stands out yet.';
  }
  if (learningResearchEdgeEl) {
    learningResearchEdgeEl.textContent = researchEdge
      ? `${describeLearningBucketLabel(researchEdge.category, researchEdge.bucket)} • ${learningBucketMeta(researchEdge.bucket)}`
      : 'Research direction has not separated itself yet.';
  }
  if (learningAutonomyEdgeEl) {
    learningAutonomyEdgeEl.textContent = autonomyEdge
      ? `${describeLearningBucketLabel(autonomyEdge.category, autonomyEdge.bucket)} • ${learningBucketMeta(autonomyEdge.bucket)}`
      : 'Autonomy thesis edge is still forming.';
  }

  renderLearningBucketList(learningFavoringListEl, favoring, 'No learned edge is strong enough yet.');
  renderLearningBucketList(learningAvoidingListEl, avoiding, 'Nothing is being penalized hard yet.');
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
    diagResearchOverallEl.textContent = '--';
    diagResearchLeadEl.textContent = '--';
    diagResearchConfidenceEl.textContent = '--';
    diagResearchComputedEl.textContent = '--';
    diagResearchHitRateEl.textContent = '--';
    diagResearchPredictionsEl.textContent = '--';
    diagResearchWhyEl.textContent = '--';
    if (diagResearchBestThesisEl) {
      diagResearchBestThesisEl.textContent = '--';
    }
    if (diagResearchInsightEl) {
      diagResearchInsightEl.textContent = '--';
    }
    if (diagResearchHypothesesEl) {
      renderEmpty(diagResearchHypothesesEl, 'Research diagnostics unavailable.');
    }
    renderPaperAutonomyDiagnostics(null);
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
  const calendar = diagnostics.calendar?.sourceName ? diagnostics.calendar : latestCalendar?.calendar ?? diagnostics.calendar ?? null;
  const research = diagnostics.research ?? null;
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
  diagSubscribersEl.textContent = `Web ${diagnostics.notifications?.webPushSubscribers ?? 0} • Native ${diagnostics.notifications?.nativePushDevices ?? 0}${diagnostics.notifications?.nativePushReady ? ' ready' : diagnostics.notifications?.nativePushReadyReason ? ` (${diagnostics.notifications.nativePushReadyReason})` : ' off'} • TG ${diagnostics.notifications?.telegramReady ? 'on' : 'off'} • Sun ${diagnostics.notifications?.ibkrLoginReminderEnabled ? 'on' : 'off'}`;
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
  diagResearchOverallEl.textContent = research?.overallTrend
    ? `${researchDirectionLabel(research.overallTrend.direction)} • ${fmtNum((Number(research.overallTrend.confidence) || 0) * 100, 0)}%`
    : 'Research loading';
  diagResearchLeadEl.textContent = research?.overallTrend?.leadSymbol
    ? `${research.overallTrend.leadSymbol} • ${researchDirectionLabel(research.overallTrend.direction)}`
    : 'No lead market';
  diagResearchConfidenceEl.textContent = research?.overallTrend
    ? `${fmtNum(Number(research.overallTrend.score) || 0, 2)} score`
    : '--';
  diagResearchComputedEl.textContent = research?.lastComputedAt
    ? `${fmtDateTimeCompact(research.lastComputedAt)} • ${fmtRelativeMinutes(research.lastComputedAt)}`
    : 'No research pass yet';
  diagResearchHitRateEl.textContent = research?.performance
    ? `${fmtNum((Number(research.performance.hitRate) || 0) * 100, 0)}% • ${research.performance.winningPredictions ?? 0}/${research.performance.evaluatedPredictions ?? 0}`
    : '--';
  diagResearchPredictionsEl.textContent = research?.performance
    ? `${research.performance.totalPredictions ?? 0} total • ${research.performance.openPredictions ?? 0} open`
    : '--';
  diagResearchWhyEl.textContent = research?.overallTrend?.reason ?? 'The research model has not formed a bias yet.';
  renderResearchDiagnostics(research);
  renderPaperAutonomyDiagnostics(diagnostics.paperAutonomy ?? null);
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
  renderHomeDashboard();
};

const renderHero = () => {
  const diagnostics = latestDiagnostics?.diagnostics;
  const filteredAlerts = getFilteredAlerts(latestAlerts);
  const topAlert = filteredAlerts[0] ?? latestAlerts[0] ?? null;
  const readyCount = latestAlerts.filter((alert) => alert.riskDecision.allowed).length;
  const blockedCount = latestAlerts.length - readyCount;

  heroWindowEl.textContent = '08:30-10:30 ET';
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
  const learningProfile = getSelfLearningProfile();
  signalCountEl.textContent = String(latestAlerts.length);
  pendingCountEl.textContent = String(latestPending.length);
  reviewPendingStatEl.textContent = String(reviewSummary.pending);
  reviewSummaryChipEl.textContent = learningProfile
    ? `${learningProfile.resolvedRecords} learned • ${reviewSummary.pending} awaiting`
    : `${reviewSummary.pending} awaiting outcome`;
  reviewPendingQueueChipEl.textContent = `${reviewSummary.pending} waiting`;
  reviewCompletedQueueChipEl.textContent = learningProfile
    ? `${reviewSummary.completed} learned`
    : `${reviewSummary.completed} completed`;

  const approvedToday = latestTrades.filter(
    (trade) => trade.status === 'APPROVED' && isSameLocalDay(trade.approvedAt ?? trade.createdAt)
  ).length;
  sentCountEl.textContent = String(approvedToday);

  const openRisk = latestPending.reduce((sum, intent) => sum + (Number(intent.riskPct) || 0), 0);
  openRiskCountEl.textContent = `${fmtNum(openRisk, 2)}%`;

  topSetupStatEl.textContent = computeTopSetup(latestTrades);
  lastSyncChipEl.textContent = `Sync: ${fmtTime(lastSyncAt)}`;
  renderHero();
  renderHomeDashboard();
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
    renderHomeDashboard();
    renderPaperAccount();
  } catch {
    latestDiagnostics = null;
    nativePushServerReady = false;
    renderDiagnostics();
    renderStatusRail();
    renderHomeDashboard();
    renderPaperAccount();
  }
};

const loadDeskBrief = async () => {
  try {
    latestDeskBrief = await apiFetch('/ai/desk-brief');
  } catch {
    latestDeskBrief = null;
  }
  renderDeskBrief();
  renderHomeDashboard();
};

const loadTradeLearningProfile = async () => {
  try {
    const payload = await apiFetch('/trade-learning/profile');
    latestSelfLearningStatus = payload?.selfLearning ?? null;
  } catch {
    latestSelfLearningStatus = null;
  }
  renderReviewInsights();
  renderHomeDashboard();
};

const loadHomeDeck = async () => {
  try {
    latestHomeDeck = await apiFetch('/home/deck');
  } catch {
    latestHomeDeck = null;
  }
  renderHomeDeck();
  renderHomeDashboard();
  renderPaperAccount();
};

const loadRiskConfig = async () => {
  try {
    latestRiskConfig = await apiFetch('/risk/config');
  } catch {
    latestRiskConfig = null;
  }
  renderQuietModeState();
  renderHomeDashboard();
};

const loadCalendar = async () => {
  try {
    latestCalendar = await apiFetch('/calendar/events?limit=12');
  } catch {
    latestCalendar = null;
  }
  renderDiagnostics();
  renderHomeDashboard();
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
      renderResearchAgreement(
        node.querySelector('.engineAgreementRow'),
        node.querySelector('.signalResearchNote'),
        alert
      );
      node.querySelector('.signalSummary').textContent = summarizeSignalSetup(alert);
      node.querySelector('.signalNextStep').textContent = summarizeSignalNextStep(alert);
      const signalChartEl = node.querySelector('.signalChart');
      signalChartEl.innerHTML = renderSignalChartMarkup(alert.chartSnapshot);
      configureExpandableChart(
        signalChartEl,
        {
          title: `${alert.symbol} ${alert.side} • ${setupLabel(alert.setupType)}`,
          meta: `${alert.chartSnapshot?.timeframe ?? '5m'} case at ${fmtTime(alert.detectedAt)} • swipe down to return`,
          snapshot: alert.chartSnapshot,
          candidate: alert.candidate,
          alert
        }
      );
      hydrateTradingViewChecklist(node, {
        alertId: alert.alertId,
        symbol: alert.symbol,
        interval: alert.chartSnapshot?.timeframe === '5m' ? '5' : alert.chartSnapshot?.timeframe ?? '5',
        title: `${alert.symbol} ${alert.side} • ${setupLabel(alert.setupType)}`,
        meta: 'Confirm structure, stop placement, and timing before manual execution.',
        candidate: alert.candidate,
        setupType: alert.setupType,
        side: alert.side
      });
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
        routeToSignalAlert(alert.alertId, 'learning');
        setActiveTab('learning');
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
    const response = await apiFetch('/signals/reviews', {
      method: 'POST',
      body: JSON.stringify({
        alertId: review.alertId,
        ...(validity ? { validity } : {}),
        ...(outcome ? { outcome } : {}),
        ...(notes ? { notes } : {}),
        ...(reviewedBy ? { reviewedBy } : {})
      })
    });

    latestReplayLearningByAlertId.set(review.alertId, response?.learning ?? null);
    const learningImpact = buildReplayLearningImpact({
      ...review,
      ...response?.review
    });
    const impactLabels = learningImpact.items.map((item) => item.label).slice(0, 3).join(' • ');

    vibrateLight();
    await Promise.all([loadReviews(), loadTrades(), loadDiagnostics()]);
    setStatus(impactLabels ? `Status: review saved • ${impactLabels}` : 'Status: review saved');
  } catch (error) {
    setStatus(`Status: review save failed (${error.message})`, true);
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = 'Save Review';
  }
};

const syncReviewQuickPickState = (card) => {
  if (!card) {
    return;
  }

  const validity = card.querySelector('.reviewValidity')?.value ?? '';
  const outcome = card.querySelector('.reviewOutcome')?.value ?? '';
  card.querySelectorAll('.reviewQuickPickBtn').forEach((button) => {
    const isActive =
      button.dataset.validity === validity
      && button.dataset.outcome === outcome;
    button.classList.toggle('is-active', isActive);
  });
};

const renderReviewCard = (review) => {
  const node = reviewTemplate.content.firstElementChild.cloneNode(true);
  const chartSnapshot = review.alertSnapshot?.chartSnapshot;
  const isPendingReview = review.reviewStatus !== 'COMPLETED';
  const alertLike = buildAlertLikeContext(review);
  const signalSummary = alertLike ? formatSignalWhy(alertLike) : 'Rule-qualified signal';
  const guardrailSummary = alertLike ? summarizeGuardrails(alertLike) : 'Risk state unavailable';
  const evidence = alertLike ? signalEvidenceTags(alertLike) : [];
  const learningImpact = buildReplayLearningImpact(review);
  const riskPoints =
    typeof review.alertSnapshot?.candidate?.entry === 'number' && typeof review.alertSnapshot?.candidate?.stopLoss === 'number'
      ? Math.abs(review.alertSnapshot.candidate.entry - review.alertSnapshot.candidate.stopLoss)
      : undefined;
  const rewardPoints =
    typeof review.alertSnapshot?.candidate?.entry === 'number' &&
    typeof review.alertSnapshot?.candidate?.takeProfit?.[0] === 'number'
      ? Math.abs(review.alertSnapshot.candidate.takeProfit[0] - review.alertSnapshot.candidate.entry)
      : undefined;
  node.querySelector('.symbol').textContent = `${review.symbol} ${review.side}`;
  node.querySelector('.setupType').textContent = setupLabel(review.setupType);
  renderResearchAgreement(
    node.querySelector('.engineAgreementRow'),
    node.querySelector('.reviewResearchNote'),
    review.alertSnapshot ?? review
  );
  const outcomeSourceRowEl = node.querySelector('.reviewOutcomeSourceRow');
  const paperBadge = paperOutcomeBadgeLabel(review);
  if (paperBadge) {
    const chip = document.createElement('span');
    chip.className = 'pill paperLearningPill';
    chip.textContent = paperBadge;
    outcomeSourceRowEl.appendChild(chip);
  } else {
    outcomeSourceRowEl.remove();
  }
  if (isPendingReview) {
    node.classList.add('review-card-pending');
  } else {
    node.classList.add('review-card-completed');
  }
  const reviewLearningImpactRowEl = node.querySelector('.reviewLearningImpactRow');
  const reviewLearningSummaryEl = node.querySelector('.reviewLearningSummary');
  const reviewLearningBadgeEl = node.querySelector('.reviewLearningBadge');
  reviewLearningImpactRowEl.innerHTML = '';
  reviewLearningBadgeEl.hidden = true;
  if (learningImpact.items.length) {
    reviewLearningBadgeEl.hidden = false;
    reviewLearningBadgeEl.textContent = `Learning fed: ${learningImpact.engineCount} ${learningImpact.engineCount === 1 ? 'engine' : 'engines'}`;
    reviewLearningBadgeEl.className = `pill reviewLearningBadge ${learningImpact.engineCount >= 3 ? 'is-strong' : ''}`;
    learningImpact.items.forEach((item) => {
      const chip = document.createElement('span');
      chip.className = item.className;
      chip.textContent = item.label;
      reviewLearningImpactRowEl.appendChild(chip);
    });
    reviewLearningSummaryEl.textContent = learningImpact.summary;
  } else {
    reviewLearningImpactRowEl.remove();
    reviewLearningSummaryEl.textContent = 'Save a directional replay review to feed the live ranking and autonomous engines.';
  }
  const reviewChartEl = node.querySelector('.reviewSnapshotChart');
  const replayMove = isPendingReview ? summarizeReplayMove(chartSnapshot, review.alertSnapshot?.candidate) : null;
  reviewChartEl.innerHTML = isPendingReview
    ? renderReplayTradeBoxChartMarkup(chartSnapshot, review.alertSnapshot?.candidate)
    : renderSignalChartMarkup(chartSnapshot);
  configureExpandableChart(
    reviewChartEl,
    {
      title: `${review.symbol} ${review.side} • ${setupLabel(review.setupType)}`,
      meta: `${chartSnapshot?.timeframe ?? '5m'} replay case at ${fmtTime(review.detectedAt)} • swipe down to return`,
      snapshot: chartSnapshot,
      candidate: review.alertSnapshot?.candidate,
      review,
      chartVariant: isPendingReview ? 'replay-trade-box' : 'signal'
    }
  );
  hydrateTradingViewChecklist(node, {
    alertId: review.alertId,
    symbol: review.symbol,
    interval: chartSnapshot?.timeframe === '5m' ? '5' : chartSnapshot?.timeframe ?? '5',
    title: `${review.symbol} ${review.side} • ${setupLabel(review.setupType)}`,
    meta: 'Reopen this setup in TradingView to compare the saved replay with live structure.',
    candidate: review.alertSnapshot?.candidate,
    setupType: review.setupType,
    side: review.side
  });
  const reviewAfterEntryStateEl = node.querySelector('.reviewAfterEntryState');
  const reviewAfterEntryHeadlineEl = node.querySelector('.reviewAfterEntryHeadline');
  const reviewAfterEntryDetailEl = node.querySelector('.reviewAfterEntryDetail');
  const reviewAfterEntryStatsEl = node.querySelector('.reviewAfterEntryStats');
  const reviewSeenMetaEl = node.querySelector('.reviewSeenMeta');
  const reviewRrMetaEl = node.querySelector('.reviewRrMeta');
  const reviewPriceMetaEl = node.querySelector('.reviewPriceMeta');
  if (reviewSeenMetaEl) {
    reviewSeenMetaEl.textContent = `Seen ${fmtRelativeMinutes(review.detectedAt)}`;
  }
  if (reviewRrMetaEl) {
    reviewRrMetaEl.textContent = `R:R ${calcRr(
      review.alertSnapshot?.candidate?.entry,
      review.alertSnapshot?.candidate?.stopLoss,
      review.alertSnapshot?.candidate?.takeProfit?.[0]
    )}`;
  }
  if (reviewPriceMetaEl) {
    reviewPriceMetaEl.textContent = `Entry ${fmtNum(review.alertSnapshot?.candidate?.entry, 2)}`;
  }
  if (replayMove && reviewAfterEntryStateEl && reviewAfterEntryHeadlineEl && reviewAfterEntryDetailEl && reviewAfterEntryStatsEl) {
    reviewAfterEntryStateEl.textContent = replayMove.resolution.label;
    reviewAfterEntryStateEl.className = `pill reviewAfterEntryState ${replayMove.resolution.tone}`;
    reviewAfterEntryHeadlineEl.textContent = replayMove.headline;
    reviewAfterEntryDetailEl.textContent = replayMove.detail;
    reviewAfterEntryStatsEl.innerHTML = '';
    replayMove.stats.forEach((stat) => {
      const chip = document.createElement('span');
      chip.className = 'level-chip reviewAfterEntryStat';
      chip.textContent = stat;
      reviewAfterEntryStatsEl.appendChild(chip);
    });
  } else {
    node.querySelector('.review-after-entry-card')?.remove();
  }
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
  node.querySelector('.reviewSeenAt').textContent = fmtDateTimeCompact(review.detectedAt);
  node.querySelector('.reviewSeenAgo').textContent = fmtRelativeMinutes(review.detectedAt);
  node.querySelector('.reviewSnapshotSavedAt').textContent = fmtDateTimeCompact(chartSnapshot?.generatedAt);
  node.querySelector('.reviewSnapshotSavedAgo').textContent = fmtRelativeMinutes(chartSnapshot?.generatedAt);
  node.querySelector('.reviewStateSummary').textContent =
    review.reviewStatus === 'COMPLETED'
      ? review.validity
        ? `${reviewValidityLabel(review.validity)} • ${reviewOutcomeLabel(review.outcome)}`
        : reviewOutcomeLabel(review.outcome)
      : review.autoOutcome
        ? `Auto ${reviewOutcomeLabel(review.autoOutcome)}`
        : 'Pending';
  node.querySelector('.reviewStateHint').textContent = review.reviewedAt
    ? `Updated ${fmtRelativeMinutes(review.reviewedAt)}`
    : review.autoLabeledAt
      ? `${isPaperLabeledReview(review) ? 'Paper-labeled' : 'Auto-labeled'} ${fmtRelativeMinutes(review.autoLabeledAt)}`
      : 'Waiting on your read';
  node.querySelector('.reviewRrValue').textContent = calcRr(
    review.alertSnapshot?.candidate?.entry,
    review.alertSnapshot?.candidate?.stopLoss,
    review.alertSnapshot?.candidate?.takeProfit?.[0]
  );
  node.querySelector('.reviewRiskRewardRange').textContent =
    typeof riskPoints === 'number' && typeof rewardPoints === 'number'
      ? `Risk ${fmtNum(riskPoints, 2)} • Reward ${fmtNum(rewardPoints, 2)}`
      : 'Plan range unavailable';
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
  node.querySelector('.reviewSignalSummary').textContent = signalSummary;
  node.querySelector('.reviewGuardrails').textContent = guardrailSummary;
  const evidenceEl = node.querySelector('.reviewEvidence');
  evidence.forEach((tag) => {
    const chip = document.createElement('span');
    chip.className = 'evidence-chip';
    chip.textContent = tag;
    evidenceEl.appendChild(chip);
  });
  node.querySelector('.detectedAt').textContent = fmtDateTime(review.detectedAt);
  node.querySelector('.reviewTimelineSnapshotAt').textContent = fmtDateTime(chartSnapshot?.generatedAt);
  node.querySelector('.reviewTimelineUpdatedAt').textContent = review.reviewedAt
    ? fmtDateTime(review.reviewedAt)
    : review.autoLabeledAt
      ? fmtDateTime(review.autoLabeledAt)
      : '--';
  node.querySelector('.reviewValidity').value = review.validity ?? '';
  node.querySelector('.reviewOutcome').value = review.outcome ?? '';
  node.querySelector('.reviewNotes').value = review.notes ?? '';
  const reviewValidityEl = node.querySelector('.reviewValidity');
  const reviewOutcomeEl = node.querySelector('.reviewOutcome');
  const reviewQuickPickButtons = node.querySelectorAll('.reviewQuickPickBtn');
  reviewQuickPickButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (reviewValidityEl) {
        reviewValidityEl.value = button.dataset.validity ?? '';
      }
      if (reviewOutcomeEl) {
        reviewOutcomeEl.value = button.dataset.outcome ?? '';
      }
      syncReviewQuickPickState(node);
      setStatus(`Status: engine note prepared ${button.textContent?.trim().toLowerCase()} • save to confirm`);
    });
  });
  reviewValidityEl?.addEventListener('change', () => syncReviewQuickPickState(node));
  reviewOutcomeEl?.addEventListener('change', () => syncReviewQuickPickState(node));
  syncReviewQuickPickState(node);
  node.querySelector('.reviewUpdatedAt').textContent = review.reviewedAt
    ? `Resolved ${fmtDateTime(review.reviewedAt)}`
    : review.autoLabeledAt
      ? `${isPaperLabeledReview(review) ? 'Paper result tracked' : 'Engine read tracked'} ${fmtDateTime(review.autoLabeledAt)}`
      : 'Awaiting engine outcome';
  node.querySelector('.reviewedByHint').textContent =
    review.reviewedBy && review.reviewedBy !== 'system-auto-reviewer' ? `by ${review.reviewedBy}` : '';

  const statusPill = node.querySelector('.reviewStatus');
  const statusLabel =
    review.validity === 'INVALID'
      ? 'INVALID'
      : review.outcome === 'MISSED'
        ? 'MISSED'
        : review.autoOutcome && review.reviewStatus !== 'COMPLETED'
          ? 'AUTO'
        : review.reviewStatus === 'COMPLETED'
          ? 'LEARNED'
          : 'NEW';
  const statusToneClass = statusLabel === 'LEARNED' ? 'REVIEWED' : statusLabel;
  statusPill.textContent = statusLabel;
  statusPill.classList.add(statusToneClass);

  const manualControlsEl = node.querySelector('.reviewManualControls');
  if (manualControlsEl) {
    manualControlsEl.hidden = true;
  }
  const saveBtn = node.querySelector('.saveReviewBtn');
  saveBtn.textContent = review.reviewStatus === 'COMPLETED' ? 'Update Outcome Note' : 'Save Outcome Note';
  saveBtn.addEventListener('click', () => saveReview(review, saveBtn));

  return node;
};

const loadReviews = async () => {
  try {
    const { reviews, summary } = await apiFetch('/signals/reviews?status=ALL&limit=80');
    latestReviews = reviews ?? [];
    reviewSummary = summary ?? { pending: 0, completed: 0, total: 0 };
    const activeIds = new Set(latestReviews.map((review) => review.alertId));
    [...latestReplayLearningByAlertId.keys()].forEach((alertId) => {
      if (!activeIds.has(alertId)) {
        latestReplayLearningByAlertId.delete(alertId);
      }
    });

    reviewsPendingListEl.innerHTML = '';
    reviewsCompletedListEl.innerHTML = '';

    const pending = latestReviews.filter((review) => review.reviewStatus === 'PENDING');
    const completed = latestReviews.filter((review) => review.reviewStatus === 'COMPLETED');

    if (!pending.length) {
      renderEmpty(reviewsPendingListEl, 'No cases are waiting on an outcome right now. The engine will keep tracking new signals automatically.');
    } else {
      pending.forEach((review) => {
        reviewsPendingListEl.appendChild(renderReviewCard(review));
      });
    }

    if (!completed.length) {
      renderEmpty(reviewsCompletedListEl, 'No learned cases yet.');
    } else {
      completed.slice(0, 6).forEach((review) => {
        reviewsCompletedListEl.appendChild(renderReviewCard(review));
      });
    }

    renderReviewInsights();
    updateStats();
    renderPaperAccount();
  } catch (error) {
    latestReviews = [];
    reviewSummary = { pending: 0, completed: 0, total: 0 };
    renderReviewInsights();
    updateStats();
    renderPaperAccount();
    renderEmpty(reviewsPendingListEl, `Failed to load reviews: ${error.message}`);
    renderEmpty(reviewsCompletedListEl, 'Learned cases unavailable.');
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
    loadDeskBrief(),
    loadTradeLearningProfile(),
    loadHomeDeck(),
    loadCalendar(),
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
      pullRefreshMetaEl.textContent = 'Updating signals, learning, and health';
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
            ? 'Status: native push permissions enabled. Server APNs are not ready yet.'
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

const updateWebAppInstallUi = () => {
  if (!webAppInstallStatusEl || !webAppInstallHintEl || !installWebAppEl) {
    return;
  }

  if (isStandaloneWebApp()) {
    webAppInstallStatusEl.textContent = 'Installed and running in standalone mode.';
    webAppInstallHintEl.textContent = 'This desk is already opening like an app on this device.';
    installWebAppEl.hidden = true;
    installWebAppEl.disabled = true;
    return;
  }

  if (deferredInstallPrompt) {
    webAppInstallStatusEl.textContent = 'Ready to install from this browser.';
    webAppInstallHintEl.textContent = 'Tap Install App to save Evan TradeAssist to your device like a standalone app.';
    installWebAppEl.hidden = false;
    installWebAppEl.disabled = false;
    installWebAppEl.textContent = 'Install App';
    return;
  }

  if (isIosBrowser()) {
    webAppInstallStatusEl.textContent = 'Install using Safari Add to Home Screen.';
    webAppInstallHintEl.textContent =
      'In Safari, tap Share and then Add to Home Screen. After that, it will launch like a dedicated app.';
    installWebAppEl.hidden = true;
    installWebAppEl.disabled = true;
    return;
  }

  webAppInstallStatusEl.textContent = 'Web app is available in the browser.';
  webAppInstallHintEl.textContent =
    'If your browser has not offered install yet, keep using the app a bit longer and the prompt should appear.';
  installWebAppEl.hidden = true;
  installWebAppEl.disabled = true;
};

const bindWebAppInstallControls = () => {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateWebAppInstallUi();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateWebAppInstallUi();
    setStatus('Status: web app installed');
  });

  installWebAppEl?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      updateWebAppInstallUi();
      return;
    }

    installWebAppEl.disabled = true;
    try {
      await deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice.catch(() => null);
    } finally {
      deferredInstallPrompt = null;
      installWebAppEl.disabled = false;
      updateWebAppInstallUi();
    }
  });

  updateWebAppInstallUi();
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
      await Promise.all([loadDiagnostics(), loadAlerts(), loadRiskConfig()]);
      setStatus('Status: signal rules updated');
    } catch (error) {
      setStatus(`Status: failed to save signal rules (${error.message})`, true);
    } finally {
      saveSignalSettingsEl.disabled = false;
      saveSignalSettingsEl.textContent = 'Save Signal Rules';
    }
  });
};

const bindPaperSettingsControls = () => {
  savePaperSettingsEl?.addEventListener('click', async () => {
    const requestedCap = Number(paperMaxConcurrentTradesEl?.value);
    const requestedRiskPct = Number(paperAutonomyRiskPctEl?.value);
    const requestedAutonomyMode =
      paperAutonomyModeEl?.value === 'FOLLOW_ALLOWED_ALERTS' ? 'FOLLOW_ALLOWED_ALERTS' : 'UNRESTRICTED';
    if (!Number.isFinite(requestedCap) || requestedCap < 0 || requestedCap > 50) {
      setStatus('Status: paper trade cap must be between 0 and 50', true);
      return;
    }
    if (!Number.isFinite(requestedRiskPct) || requestedRiskPct < 0.01 || requestedRiskPct > 5) {
      setStatus('Status: autonomy risk must be between 0.01 and 5', true);
      return;
    }

    if (savePaperSettingsEl) {
      savePaperSettingsEl.disabled = true;
      savePaperSettingsEl.textContent = 'Saving...';
    }

    try {
      const { paperAccount } = await apiFetch('/paper-account/config', {
        method: 'PATCH',
        body: JSON.stringify({
          maxConcurrentTrades: requestedCap,
          autonomyMode: requestedAutonomyMode,
          autonomyRiskPct: requestedRiskPct
        })
      });

      if (latestDiagnostics?.diagnostics) {
        latestDiagnostics.diagnostics.paperAccount = paperAccount;
      }
      if (latestHomeDeck?.deck?.paperAccount) {
        latestHomeDeck.deck.paperAccount.maxConcurrentTrades = paperAccount.maxConcurrentTrades;
        latestHomeDeck.deck.paperAccount.autonomyMode = paperAccount.autonomyMode;
        latestHomeDeck.deck.paperAccount.autonomyRiskPct = paperAccount.autonomyRiskPct;
      }
      renderPaperAccount();
      setStatus(
        `Status: paper autonomy updated (${paperAccount.autonomyMode === 'UNRESTRICTED' ? 'unrestricted' : 'follow-allowed'} • cap ${formatPaperTradeCap(paperAccount.maxConcurrentTrades)} • ${Number(paperAccount.autonomyRiskPct).toFixed(2)}% risk)`
      );
    } catch (error) {
      setStatus(`Status: failed to update paper autonomy (${error.message})`, true);
    } finally {
      if (savePaperSettingsEl) {
        savePaperSettingsEl.disabled = false;
        savePaperSettingsEl.textContent = 'Save Paper Autonomy';
      }
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
  const initialTab = normalizeTabName(routeState.tab);
  activeRouteAlertId = routeState.alertId;
  focusedAlertId = routeState.alertId;
  applyUiPrefs(prefs);
  bindUiPreferenceControls();
  bindNotificationControls();
  bindWebAppInstallControls();
  bindSignalSettingsControls();
  bindPaperSettingsControls();
  bindStatusRecoveryControls();
  bindChartLightbox();
  bindSymbolDetailViewer();
  bindTradingViewViewer();
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
  homePaperAccountCardEl?.addEventListener('click', () => setActiveTab('trades'));
  setActiveTab(initialTab ?? tabButtons.find((button) => button.classList.contains('is-active'))?.dataset.tab ?? 'home');
  if (initialTab === 'status' && routeState.focus === 'ibkr-connection') {
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
    const nextTab = normalizeTabName(nextRoute.tab);
    if (nextTab) {
      setActiveTab(nextTab);
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
