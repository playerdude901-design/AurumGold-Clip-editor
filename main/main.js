const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const FFmpegService = require('./ffmpeg-service');
const ffmpegService = new FFmpegService();

const isDev = process.argv.includes('--dev');
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#0d0d0f',
    title: 'AurumGold',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#141418',
      symbolColor: '#c9a84c',
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // Disabling webSecurity to allow file:// loading reliably for local use
    },
    show: true
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });
}

app.whenReady().then(() => {
  createWindow();
  require('./ipc-handlers').register(mainWindow);

  // Check for updates (only in production)
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Auto-update events
autoUpdater.on('update-available', () => {
  console.log('Update available.');
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Actualización lista',
    message: 'Hay una nueva versión de AurumGold lista para instalar. ¿Quieres reiniciar ahora?',
    buttons: ['Reiniciar y actualizar', 'Más tarde']
  }).then((result) => {
    if (result.response === 0) autoUpdater.quitAndInstall();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (typeof ffmpegService !== 'undefined' && ffmpegService.cleanup) {
    ffmpegService.cleanup();
  }
});
