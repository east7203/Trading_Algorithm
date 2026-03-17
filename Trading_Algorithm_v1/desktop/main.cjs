const { app, BrowserWindow, shell, session } = require("electron");
const fs = require("fs");
const path = require("path");

const REMOTE_URL =
  process.env.TRADING_APP_URL || "https://167-172-252-171.sslip.io/mobile/";
const LOCAL_INDEX = path.join(__dirname, "..", "public", "mobile", "index.html");

function createWindow() {
  const window = new BrowserWindow({
    width: 430,
    height: 900,
    minWidth: 390,
    minHeight: 740,
    title: "Trading Algo",
    autoHideMenuBar: true,
    backgroundColor: "#0B141A",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const openExternal = (url) => {
    shell.openExternal(url).catch(() => {});
  };

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const isRemote = url.startsWith(REMOTE_URL);
    const isLocal = url.startsWith("file://");
    if (!isRemote && !isLocal) {
      event.preventDefault();
      openExternal(url);
    }
  });

  window.loadURL(REMOTE_URL).catch(() => {
    if (fs.existsSync(LOCAL_INDEX)) {
      window.loadFile(LOCAL_INDEX);
      return;
    }
    window.loadURL("data:text/html,<h2>Trading Algo could not load.</h2>");
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === "notifications") {
      return true;
    }
    return false;
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "notifications");
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
