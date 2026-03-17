#!/usr/bin/env node

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const LABEL = 'com.tradingalgo.macnotifier';
const HOME = os.homedir();
const UID = process.getuid();
const PROJECT_ROOT = path.resolve(__dirname, '..');
const NODE_PATH = process.execPath;
const SCRIPT_PATH = path.join(PROJECT_ROOT, 'desktop', 'mac-notifier.cjs');
const LAUNCH_AGENTS_DIR = path.join(HOME, 'Library', 'LaunchAgents');
const LOG_DIR = path.join(HOME, 'Library', 'Logs', 'TradingAlgo');
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, `${LABEL}.plist`);
const STDOUT_PATH = path.join(LOG_DIR, 'mac-notifier.out.log');
const STDERR_PATH = path.join(LOG_DIR, 'mac-notifier.err.log');

const API_BASE = (process.env.TRADING_MAC_NOTIFIER_API_BASE || 'https://167-172-252-171.sslip.io').replace(/\/$/, '');
const OPEN_URL = process.env.TRADING_MAC_NOTIFIER_OPEN_URL || `${API_BASE}/mobile/`;
const POLL_MS = Math.max(Number.parseInt(process.env.TRADING_MAC_NOTIFIER_POLL_MS || '30000', 10) || 30000, 5000);

const command = process.argv[2] || 'status';

const plistXml = () => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_PATH}</string>
    <string>${SCRIPT_PATH}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PROJECT_ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TRADING_MAC_NOTIFIER_API_BASE</key>
    <string>${API_BASE}</string>
    <key>TRADING_MAC_NOTIFIER_OPEN_URL</key>
    <string>${OPEN_URL}</string>
    <key>TRADING_MAC_NOTIFIER_POLL_MS</key>
    <string>${POLL_MS}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${STDOUT_PATH}</string>
  <key>StandardErrorPath</key>
  <string>${STDERR_PATH}</string>
</dict>
</plist>
`;

const runLaunchctl = (args, ignoreFailure = false) => {
  try {
    return execFileSync('launchctl', args, {
      encoding: 'utf8',
      stdio: ignoreFailure ? 'ignore' : 'pipe'
    });
  } catch (error) {
    if (ignoreFailure) {
      return '';
    }
    throw error;
  }
};

const ensurePaths = async () => {
  await fs.mkdir(LAUNCH_AGENTS_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR, { recursive: true });
};

const install = async () => {
  await ensurePaths();
  await fs.writeFile(PLIST_PATH, plistXml());
  runLaunchctl(['unload', '-w', PLIST_PATH], true);
  runLaunchctl(['load', '-w', PLIST_PATH]);
  runLaunchctl(['kickstart', '-k', `gui/${UID}/${LABEL}`], true);
  console.log(`Installed LaunchAgent: ${PLIST_PATH}`);
  console.log(`Logs: ${STDOUT_PATH} and ${STDERR_PATH}`);
};

const uninstall = async () => {
  runLaunchctl(['unload', '-w', PLIST_PATH], true);
  await fs.rm(PLIST_PATH, { force: true });
  console.log(`Removed LaunchAgent: ${PLIST_PATH}`);
};

const status = async () => {
  try {
    const output = runLaunchctl(['print', `gui/${UID}/${LABEL}`]);
    console.log(output.trim());
  } catch {
    console.log(`LaunchAgent ${LABEL} is not loaded`);
  }

  console.log(`Plist: ${PLIST_PATH}`);
  console.log(`Stdout log: ${STDOUT_PATH}`);
  console.log(`Stderr log: ${STDERR_PATH}`);
};

const logs = async () => {
  console.log(`Stdout log: ${STDOUT_PATH}`);
  console.log(`Stderr log: ${STDERR_PATH}`);
};

const main = async () => {
  switch (command) {
    case 'install':
      await install();
      break;
    case 'uninstall':
      await uninstall();
      break;
    case 'logs':
      await logs();
      break;
    case 'status':
    default:
      await status();
      break;
  }
};

void main();
