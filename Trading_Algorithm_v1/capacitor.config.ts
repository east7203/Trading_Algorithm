import type { CapacitorConfig } from '@capacitor/cli';

const normalizeUrl = (url: string): string => (url.endsWith('/') ? url : `${url}/`);
const liveServerUrl = normalizeUrl(
  process.env.CAP_SERVER_URL ?? 'https://134-209-125-140.sslip.io/mobile'
);

const config: CapacitorConfig = {
  appId: 'com.tradingalgo.mobile',
  appName: 'Trading Assist',
  webDir: 'public/mobile',
  bundledWebRuntime: false,
  server: {
    url: liveServerUrl,
    cleartext: liveServerUrl.startsWith('http://')
  },
  ios: {
    contentInset: 'automatic'
  }
};

export default config;
