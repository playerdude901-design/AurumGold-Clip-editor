const { ipcMain, dialog, shell, app } = require('electron');
const FFmpegService = require('./ffmpeg-service');
const PresetsStore  = require('./presets-store');

const ffmpegService = new FFmpegService();
const presetsStore  = new PresetsStore();

function register(mainWindow) {
  // ── Open video ──────────────────────────────────────────────────────────
  ipcMain.handle('video:open', async (_, customPath) => {
    let filePath = customPath;
    if (!filePath) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Video File',
        filters: [
          { name: 'Video Files', extensions: ['mp4','mov','avi','mkv','webm','mts','m2ts','wmv'] },
          { name: 'All Files',   extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      if (result.canceled || !result.filePaths.length) return null;
      filePath = result.filePaths[0];
    }
    try {
      const meta = await ffmpegService.getMetadata(filePath);
      return { filePath, ...meta };
    } catch (e) {
      return { error: e.message };
    }
  });

  // ── Export ───────────────────────────────────────────────────────────────
  ipcMain.handle('export:start', async (event, params) => {
    try {
      await ffmpegService.exportVideo(params, (pct) => {
        mainWindow.webContents.send('export:progress', { percent: pct });
      });
      mainWindow.webContents.send('export:done', { outputPath: params.outputPath });
    } catch (err) {
      if (err.message !== 'CANCELLED') {
        mainWindow.webContents.send('export:error', { message: err.message });
      }
    }
  });

  ipcMain.on('export:cancel', () => ffmpegService.cancelExport());

  // ── Presets ──────────────────────────────────────────────────────────────
  ipcMain.handle('presets:list',   ()              => presetsStore.list());
  ipcMain.handle('presets:save',   (_, preset)     => presetsStore.save(preset));
  ipcMain.handle('presets:delete', (_, name)       => presetsStore.remove(name));

  // ── Utilities ────────────────────────────────────────────────────────────
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Output Folder',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('shell:openFolder', (_, folderPath) => shell.openPath(folderPath));
  ipcMain.handle('app:version', () => app.getVersion());

  // ── Twitch ───────────────────────────────────────────────────────────────
  const TwitchService = require('./twitch-service');
  const twitchService = new TwitchService();
  const path = require('path');

  ipcMain.handle('twitch:getInfo', async (_, url) => {
    const slug = twitchService.extractSlug(url);
    if (!slug) throw new Error('Invalid Twitch URL');
    return await twitchService.getClipInfo(slug);
  });

  ipcMain.handle('twitch:download', async (event, { url, folder, filename }) => {
    const destPath = path.join(folder, filename);
    await twitchService.downloadClip(url, destPath, (pct) => {
      mainWindow.webContents.send('twitch:progress', { percent: pct });
    });
    return destPath;
  });
}

module.exports = { register };
