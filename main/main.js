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

// Auto-update configuration
autoUpdater.autoDownload = false;

app.whenReady().then(() => {
  createWindow();
  require('./ipc-handlers').register(mainWindow);

  // Check for updates (only in production)
  if (!isDev) {
    autoUpdater.checkForUpdates();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Auto-update events
autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Actualización disponible',
    message: `Una nueva versión (${info.version}) está disponible. ¿Deseas descargarla ahora?`,
    buttons: ['Descargar e instalar', 'Más tarde']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Actualización lista',
    message: 'La actualización ha sido descargada. ¿Quieres reiniciar AurumGold para aplicar los cambios?',
    buttons: ['Reiniciar y actualizar', 'Más tarde']
  }).then((result) => {
    if (result.response === 0) autoUpdater.quitAndInstall();
  });
});

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (typeof ffmpegService !== 'undefined' && ffmpegService.cleanup) {
    ffmpegService.cleanup();
  }
});
