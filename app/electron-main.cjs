const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess = null;

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
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startPythonBackend() {
  const backendPath = path.join(__dirname, '..', 'backend_app.py');
  const userDataPath = app.getPath('userData');
  pythonProcess = spawn('python', [backendPath, '--userdata', userDataPath]);

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Python: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python Error: ${data}`);
  });
}
ipcMain.handle('fetch-headhunting-bypass', async (event, url) => {
  return new Promise((resolve) => {
    let bgWin = new BrowserWindow({
      show: true,
      x: -2000,
      y: -2000,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false
      }
    });

    bgWin.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let isResolved = false;
    let lastText = '';

    bgWin.loadURL(url);

    let pollInterval = setInterval(async () => {
      if (isResolved || bgWin.isDestroyed()) {
        clearInterval(pollInterval);
        return;
      }
      try {
        let text = await bgWin.webContents.executeJavaScript('document.documentElement.outerHTML');
        lastText = text;
        
        let jsonStart = text.indexOf('{');
        let jsonArrayStart = text.indexOf('[');
        let startIdx = -1;
        
        if (jsonStart !== -1 && jsonArrayStart !== -1) startIdx = Math.min(jsonStart, jsonArrayStart);
        else if (jsonStart !== -1) startIdx = jsonStart;
        else if (jsonArrayStart !== -1) startIdx = jsonArrayStart;

        if (startIdx !== -1) {
          let possibleJson = text.substring(startIdx);
          
          let jsonEnd = possibleJson.lastIndexOf('}');
          let jsonArrayEnd = possibleJson.lastIndexOf(']');
          let endIdx = Math.max(jsonEnd, jsonArrayEnd);
          
          if (endIdx !== -1) {
              possibleJson = possibleJson.substring(0, endIdx + 1);
          }

          try {
              let data = JSON.parse(possibleJson);
              isResolved = true;
              clearInterval(pollInterval);
              bgWin.destroy();
              resolve(data);
          } catch(e) {
              // Parse failed on this substring, might be HTML matching '{'
          }
        }
      } catch (e) {
        // Ignore JSON parse errors or execution errors, keep trying
      }
    }, 1000);

    setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        clearInterval(pollInterval);
        if (!bgWin.isDestroyed()) bgWin.destroy();
        resolve({ status: 'error', message: `Timeout. Debug Info HTML: \n\n${lastText.substring(0, 300)}` });
      }
    }, 60000); // 60 seconds timeout
  });
});

app.on('ready', () => {
  startPythonBackend();
  // Wait a moment for python server to start before creating window
  setTimeout(createWindow, 2000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
