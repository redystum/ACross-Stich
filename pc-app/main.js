const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let detachedWindow = null;
let lastKnownState = null;

// Persistent server config path
const configPath = path.join(app.getPath('userData'), 'server-config.json');

function loadServerUrl() {
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (data && data.serverUrl) return data.serverUrl;
    }
  } catch (e) {
    console.error('Failed to read server-config.json:', e);
  }
  return process.env.ACROSS_STITCH_SERVER_URL || 'http://localhost:3000';
}

function saveServerUrl(url) {
  try {
    fs.writeFileSync(configPath, JSON.stringify({ serverUrl: url }), 'utf8');
  } catch (e) {
    console.error('Failed to write server-config.json:', e);
  }
}

function createMainWindow() {
  const serverUrl = loadServerUrl();

  const logoPath = path.join(__dirname, '../public/logo.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 540,
    title: 'Across Stitch',
    icon: logoPath,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allows cross-origin API calls to Raspberry Pi
    },
  });

  mainWindow.loadURL(serverUrl).catch(err => {
    console.warn(`Could not connect directly to ${serverUrl}:`, err.message);
    // If remote Raspberry Pi isn't reachable yet, load fallback connection page
    mainWindow.loadFile(path.join(__dirname, 'connection-failed.html')).catch(() => {
      // If no fallback file, attempt localhost
      mainWindow.loadURL('http://localhost:3000');
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (detachedWindow && !detachedWindow.isDestroyed()) {
      detachedWindow.close();
    }
  });
}

function createDetachedWindow(initialState) {
  if (detachedWindow && !detachedWindow.isDestroyed()) {
    detachedWindow.focus();
    if (initialState) {
      lastKnownState = initialState;
      detachedWindow.webContents.send('state-updated', initialState);
    }
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const winW = 460;
  const winH = 500;
  const posX = Math.max(20, screenWidth - winW - 40);
  const posY = Math.max(40, Math.floor((screenHeight - winH) / 2));

  const logoPath = path.join(__dirname, '../public/logo.png');

  detachedWindow = new BrowserWindow({
    width: winW,
    height: winH,
    minWidth: 240,
    minHeight: 240,
    x: posX,
    y: posY,
    alwaysOnTop: true,
    frame: false, // Frameless for pure image focus with custom micro-bar
    transparent: false,
    backgroundColor: '#09090b',
    skipTaskbar: false,
    title: 'Across Stitch — Detached',
    icon: logoPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Ensure true always-on-top over other windows and apps
  detachedWindow.setAlwaysOnTop(true, 'screen-saver');

  detachedWindow.loadFile(path.join(__dirname, 'detached.html'));

  detachedWindow.webContents.once('did-finish-load', () => {
    if (initialState) {
      lastKnownState = initialState;
      detachedWindow.webContents.send('state-updated', initialState);
    } else if (lastKnownState) {
      detachedWindow.webContents.send('state-updated', lastKnownState);
    }
  });

  detachedWindow.on('closed', () => {
    detachedWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('detached-closed');
    }
  });
}

// IPC Handlers
ipcMain.handle('open-detached-window', (event, initialState) => {
  createDetachedWindow(initialState);
  return true;
});

ipcMain.handle('close-detached-window', () => {
  if (detachedWindow && !detachedWindow.isDestroyed()) {
    detachedWindow.close();
  }
  return true;
});

ipcMain.handle('is-detached-open', () => {
  return detachedWindow !== null && !detachedWindow.isDestroyed();
});

ipcMain.on('sync-state-to-detached', (event, state) => {
  lastKnownState = state;
  if (detachedWindow && !detachedWindow.isDestroyed()) {
    detachedWindow.webContents.send('state-updated', state);
  }
});

ipcMain.on('sync-action-to-main', (event, action) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('action-from-detached', action);
  }
});

ipcMain.handle('set-always-on-top', (event, flag) => {
  if (detachedWindow && !detachedWindow.isDestroyed()) {
    detachedWindow.setAlwaysOnTop(flag, flag ? 'screen-saver' : 'normal');
    return true;
  }
  return false;
});

ipcMain.handle('set-window-opacity', (event, opacity) => {
  if (detachedWindow && !detachedWindow.isDestroyed()) {
    const val = Math.max(0.2, Math.min(1.0, Number(opacity)));
    detachedWindow.setOpacity(val);
    return true;
  }
  return false;
});

ipcMain.on('minimize-detached', () => {
  if (detachedWindow && !detachedWindow.isDestroyed()) {
    detachedWindow.minimize();
  }
});

ipcMain.on('close-detached', () => {
  if (detachedWindow && !detachedWindow.isDestroyed()) {
    detachedWindow.close();
  }
});

ipcMain.handle('get-server-url', () => {
  return loadServerUrl();
});

ipcMain.handle('set-server-url', (event, url) => {
  saveServerUrl(url);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(url);
  }
  return true;
});

// App Lifecycle
app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
