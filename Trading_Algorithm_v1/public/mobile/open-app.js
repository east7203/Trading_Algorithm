const params = new URLSearchParams(window.location.search);
const target = params.get('target') || 'signals';
const alertId = params.get('alertId');
const nativeParams = new URLSearchParams({
  target
});
if (alertId) {
  nativeParams.set('alertId', alertId);
}
const nativeUrl = `tradingassist://open?${nativeParams.toString()}`;
const webFallbackParams = new URLSearchParams({
  tab: target
});
if (alertId) {
  webFallbackParams.set('alertId', alertId);
}
const webFallback = `/mobile/?${webFallbackParams.toString()}`;

const nativeLink = document.getElementById('openNativeApp');
const webLink = document.getElementById('openWebFallback');
const statusEl = document.getElementById('openerStatus');

if (nativeLink) {
  nativeLink.href = nativeUrl;
}

if (webLink) {
  webLink.href = webFallback;
}

const openNative = () => {
  window.location.href = nativeUrl;
};

const fallbackTimer = window.setTimeout(() => {
  if (statusEl) {
    statusEl.textContent = 'App did not open automatically. Use the button above or continue in the web app.';
  }
}, 1400);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    window.clearTimeout(fallbackTimer);
  }
});

openNative();
