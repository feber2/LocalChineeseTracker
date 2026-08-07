'use strict';

const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { ScannerEngine, DEFAULT_TIMING } = require('./scanner.cjs');
const { AutoTraderEngine } = require('./engine/auto_trader.cjs');

const DEFAULT_COORDS = {
  I_HAVE_SEARCH_BOX: { x: 0, y: 0 },
  I_WANT_SEARCH_BOX: { x: 0, y: 0 },
  TOP_SEARCH_RESULT: { x: 0, y: 0 },
  I_HAVE_PRICE_BOX: { x: 0, y: 0 },
  I_WANT_PRICE_BOX: { x: 0, y: 0 },
  PLACE_ORDER_BTN: { x: 0, y: 0 },
  CONFIRM_ORDER_BTN: { x: 0, y: 0 }
};

let mainWindow;
let pythonProcess = null;
const scanner = new ScannerEngine();
const trader = new AutoTraderEngine();

// ---- Settings helpers ----

function getSettingsPath(file) {
  return path.join(app.getPath('userData'), file);
}

function loadSettings(file, fallback) {
  const fp = getSettingsPath(file);
  try {
    if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    console.error(`[Settings] Failed to load ${file}:`, e.message);
  }
  return fallback;
}

function saveSettings(file, data) {
  const fp = getSettingsPath(file);
  try {
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[Settings] Failed to save ${file}:`, e.message);
  }
}

// Default currency list
const DEFAULT_CURRENCIES = [
  { name: 'Divine Orb', search_term: 'Divine Orb', enabled: true, category: 'Core' },
  { name: 'Chaos Orb', search_term: 'Chaos Orb', enabled: true, category: 'Core' },
  { name: 'Exalted Orb', search_term: 'Exalted Orb', enabled: true, category: 'Orb' },
  { name: 'Mirror of Kalandra', search_term: 'Mirror', enabled: false, category: 'Orb' },
  { name: 'Orb of Annulment', search_term: 'Annulment', enabled: true, category: 'Orb' },
  { name: 'Orb of Alteration', search_term: 'Alteration', enabled: true, category: 'Orb' },
  { name: 'Orb of Fusing', search_term: 'Fusing', enabled: true, category: 'Orb' }
];

// ---- Window ----

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#00d2ff',
      height: 35
    }
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---- Python backend (Headhunting only) ----

function startPythonBackend() {
  const backendPath = path.join(__dirname, '..', 'backend_app.py');
  if (!fs.existsSync(backendPath)) return;

  const userDataPath = app.getPath('userData');
  pythonProcess = spawn('python', [backendPath, '--userdata', userDataPath]);
  pythonProcess.stdout.on('data', d => console.log(`Python: ${d}`));
  pythonProcess.stderr.on('data', d => console.error(`Python: ${d}`));
}

// ---- Scanner IPC ----

const scannedRecordsCache = [];

scanner.setUpdateCallback((type, data) => {
  if (type === 'record') {
    const idx = scannedRecordsCache.findIndex(r => r.itemName === data.itemName);
    if (idx >= 0) scannedRecordsCache[idx] = data;
    else scannedRecordsCache.push(data);
    saveSettings('scan_records.json', scannedRecordsCache);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scanner:update', { type, data });
  }
});

ipcMain.handle('scanner:start', async () => {
  if (scanner.isScanning) return { status: 'already_running' };
  const coords = loadSettings('ui_coordinates.json', DEFAULT_COORDS);
  const timing = loadSettings('timing_settings.json', DEFAULT_TIMING);
  const currencies = loadSettings('currency_registry.json', DEFAULT_CURRENCIES);
  scanner.scanLoop(currencies, coords, timing);
  return { status: 'started' };
});

ipcMain.handle('scanner:get-records', () => {
  return loadSettings('scan_records.json', []);
});

ipcMain.handle('scanner:clear-records', () => {
  scannedRecordsCache.length = 0;
  saveSettings('scan_records.json', []);
  return { status: 'cleared' };
});

ipcMain.handle('scanner:stop', () => {
  scanner.stop();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scanner:update', { type: 'status', data: { message: 'STATUS: 🛑 STOPPED (F2)' } });
    mainWindow.webContents.send('scanner:update', { type: 'scan_finished', data: {} });
  }
  return { status: 'stopped' };
});

ipcMain.handle('scanner:get-settings', () => {
  const loadedTiming = loadSettings('timing_settings.json', DEFAULT_TIMING);
  const timing = { ...DEFAULT_TIMING, ...loadedTiming };
  return {
    coords: loadSettings('ui_coordinates.json', DEFAULT_COORDS),
    timing: timing,
    currencies: loadSettings('currency_registry.json', DEFAULT_CURRENCIES)
  };
});

ipcMain.handle('scanner:save-coords', (_, coords) => {
  saveSettings('ui_coordinates.json', coords);
  return { status: 'saved' };
});

ipcMain.handle('scanner:save-timing', (_, timing) => {
  saveSettings('timing_settings.json', timing);
  return { status: 'saved' };
});

ipcMain.handle('scanner:save-currencies', (_, currencies) => {
  saveSettings('currency_registry.json', currencies);
  return { status: 'saved' };
});

ipcMain.handle('scanner:calibrate', async (_, key, delaySeconds = 3) => {
  const pos = await scanner.captureMousePosition(delaySeconds);
  const coords = loadSettings('ui_coordinates.json', DEFAULT_COORDS);
  coords[key] = { x: pos.x, y: pos.y };
  saveSettings('ui_coordinates.json', coords);
  return { x: pos.x, y: pos.y };
});

ipcMain.handle('scanner:status', () => {
  return { isScanning: scanner.isScanning };
});

// ---- Auto Trader IPC ----

trader.setUpdateCallback((type, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('trader:update', { type, data });
  }
});

ipcMain.handle('trader:start', async (_, config) => {
  if (trader.state !== 'IDLE' && trader.state !== 'STOPPED') return { status: 'already_running' };
  const coords = loadSettings('ui_coordinates.json', DEFAULT_COORDS);
  const timing = loadSettings('timing_settings.json', DEFAULT_TIMING);
  const currencies = loadSettings('currency_registry.json', DEFAULT_CURRENCIES);
  const targetItems = currencies.filter(c => c.enabled !== false && c.name !== 'Divine Orb' && c.name !== 'Chaos Orb');
  trader.startLoop(targetItems, coords, timing, config);
  return { status: 'started' };
});

ipcMain.handle('trader:stop', () => {
  trader.stop();
  return { status: 'stopped' };
});

ipcMain.handle('trader:status', () => {
  return { state: trader.state, logs: trader.logs };
});

// ---- Headhunting bypass IPC ----

ipcMain.handle('fetch-headhunting-bypass', async (event, url) => {
  return new Promise((resolve) => {
    let bgWin = new BrowserWindow({
      show: false, width: 800, height: 600,
      webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: false }
    });
    bgWin.webContents.setMaxListeners(30);
    bgWin.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let isResolved = false;
    let lastText = '';
    bgWin.loadURL(url);

    let pollInterval = setInterval(async () => {
      if (isResolved || bgWin.isDestroyed()) { clearInterval(pollInterval); return; }
      try {
        let text = await bgWin.webContents.executeJavaScript('document.documentElement.outerHTML');
        lastText = text;
        let jsonStart = text.indexOf('{'), jsonArrayStart = text.indexOf('[');
        let startIdx = -1;
        if (jsonStart !== -1 && jsonArrayStart !== -1) startIdx = Math.min(jsonStart, jsonArrayStart);
        else if (jsonStart !== -1) startIdx = jsonStart;
        else if (jsonArrayStart !== -1) startIdx = jsonArrayStart;
        if (startIdx !== -1) {
          let possibleJson = text.substring(startIdx);
          let endIdx = Math.max(possibleJson.lastIndexOf('}'), possibleJson.lastIndexOf(']'));
          if (endIdx !== -1) possibleJson = possibleJson.substring(0, endIdx + 1);
          try {
            let data = JSON.parse(possibleJson);
            isResolved = true; clearInterval(pollInterval); bgWin.destroy(); resolve(data);
          } catch (e) {}
        }
      } catch (e) {}
    }, 1000);

    setTimeout(() => {
      if (!isResolved) {
        isResolved = true; clearInterval(pollInterval);
        if (!bgWin.isDestroyed()) bgWin.destroy();
        resolve({ status: 'error', message: `Timeout.\n\n${lastText.substring(0, 300)}` });
      }
    }, 60000);
  });
});

// ---- App lifecycle ----

app.on('ready', () => {
  startPythonBackend();
  setTimeout(createWindow, pythonProcess ? 2000 : 0);

  globalShortcut.register('F1', () => {
    if (!scanner.isScanning) {
      const coords = loadSettings('ui_coordinates.json', DEFAULT_COORDS);
      const timing = loadSettings('timing_settings.json', DEFAULT_TIMING);
      const currencies = loadSettings('currency_registry.json', DEFAULT_CURRENCIES);
      scanner.scanLoop(currencies, coords, timing);
    }
  });

  globalShortcut.register('F2', () => {
    scanner.stop();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scanner:update', { type: 'status', data: { message: 'STATUS: 🛑 STOPPED (F2)' } });
      mainWindow.webContents.send('scanner:update', { type: 'scan_finished', data: {} });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  scanner.stop();
  trader.stop();
  if (pythonProcess) pythonProcess.kill();
});
