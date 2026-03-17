import type { CapacitorConfig } from '@capacitor/cli';

const normalizeUrl = (url: string): string => (url.endsWith('/') ? url : `${url}/`);
const liveServerUrl = normalizeUrl(
  process.env.CAP_SERVER_URL ?? 'https://167-172-252-171.sslip.io/mobile'
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
