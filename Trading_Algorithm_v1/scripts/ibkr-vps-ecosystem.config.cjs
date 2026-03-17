module.exports = {
  apps: [
    {
      name: 'ibkr-xvfb',
      script: '/usr/bin/Xvfb',
      args: ':99 -screen 0 1440x900x24 -nolisten tcp -ac',
      interpreter: 'none',
      autorestart: true,
      restart_delay: 3000
    },
    {
      name: 'ibkr-fluxbox',
      script: '/usr/bin/fluxbox',
      interpreter: 'none',
      env: {
        DISPLAY: ':99',
        HOME: '/root'
      },
      autorestart: true,
      restart_delay: 3000
    },
    {
      name: 'ibkr-x11vnc',
      script: '/usr/bin/x11vnc',
      interpreter: 'none',
      args: '-display :99 -rfbport 5901 -localhost -forever -shared -nopw -xkb -o /opt/ibkr-runtime/logs/x11vnc.log',
      autorestart: true,
      restart_delay: 3000
    },
    {
      name: 'ibkr-novnc',
      script: '/usr/bin/websockify',
      interpreter: 'none',
      args: '127.0.0.1:6080 127.0.0.1:5901 --web /usr/share/novnc',
      autorestart: true,
      restart_delay: 3000
    },
    {
      name: 'ibgateway',
      script: '/opt/trading-algorithm/scripts/launch-ibgateway-vps.sh',
      interpreter: 'none',
      env: {
        IBKR_DISPLAY: ':99',
        HOME: '/root',
        IBKR_RUNTIME_LOG_DIR: '/opt/ibkr-runtime/logs'
      },
      autorestart: true,
      restart_delay: 5000
    },
    {
      name: 'ibkr-bridge',
      script: '/opt/trading-algorithm/scripts/launch-ibkr-bridge-vps.sh',
      interpreter: 'none',
      env: {
        HOME: '/root'
      },
      cwd: '/opt/trading-algorithm',
      autorestart: true,
      restart_delay: 5000
    },
    {
      name: 'ibkr-fallback-watchdog',
      script: '/usr/bin/node',
      args: '/opt/trading-algorithm/dist/tools/runIbkrFallbackWatchdog.js',
      interpreter: 'none',
      env: {
        HOME: '/root'
      },
      cwd: '/opt/trading-algorithm',
      autorestart: true,
      restart_delay: 5000
    }
  ]
};
