const { ipcMain, dialog, shell, app } = require('electron');
const FFmpegService = require('./ffmpeg-service');
const PresetsStore  = require('./presets-store');
const SettingsStore = require('./settings-store');
const SubtitleEngine = require('./subtitle-engine');
const WaveformGenerator = require('./waveform-generator');

const ffmpegService = new FFmpegService();
const presetsStore  = new PresetsStore();
const settingsStore = new SettingsStore();
const subtitleEngine = new SubtitleEngine();
const waveformGenerator = new WaveformGenerator();

function register(mainWindow) {
  ipcMain.on('app:quit', () => app.quit());
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

  // ── Settings & Session ──────────────────────────────────────────────────
  ipcMain.handle('settings:get',  () => settingsStore.getSettings());
  ipcMain.handle('settings:save', (_, settings) => settingsStore.saveSettings(settings));
  ipcMain.handle('session:get',   () => settingsStore.getSession());
  ipcMain.handle('session:save',  (_, session) => settingsStore.saveSession(session));
  ipcMain.handle('session:clear', () => settingsStore.clearSession());

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

  // ── Kick ─────────────────────────────────────────────────────────────────
  const KickService = require('./kick-service');
  const kickService = new KickService();

  ipcMain.handle('kick:getInfo', async (_, url) => {
    const slug = kickService.extractSlug(url);
    if (!slug) throw new Error('Invalid Kick URL');
    return await kickService.getClipInfo(slug);
  });

  ipcMain.handle('kick:download', async (event, { url, folder, filename }) => {
    const destPath = path.join(folder, filename);
    await kickService.downloadClip(url, destPath, (pct) => {
      mainWindow.webContents.send('kick:progress', { percent: pct });
    });
    return destPath;
  });

  // ── Subtitles ─────────────────────────────────────────────────────────────
  let transcribing = false;
  ipcMain.handle('subtitles:transcribe', async (_, { filePath, trimIn, trimOut, language }) => {
    console.log('[AG-Transcribe] paso 4: handler main');
    if(transcribing)return {success:false,error:'Ya hay una transcripción en curso.'};
    transcribing=true;
    let audioPath;
    try {
      if(!Number.isFinite(trimIn) || !Number.isFinite(trimOut) || trimIn<0 || trimOut<=trimIn)throw new Error('Rango de transcripción inválido.');
      audioPath = await subtitleEngine.extractAudioForWhisper(filePath, trimIn, trimOut);
      const blocks = await subtitleEngine.transcribeAudio(audioPath, { language });
      blocks.forEach(b => {b.start+=trimIn;b.end+=trimIn;b.words.forEach(w=>{w.start+=trimIn;w.end+=trimIn;});});
      console.log('[AG-Transcribe] paso 6: enviar resultado IPC',blocks.length);
      return { success: true, blocks, words:blocks.flatMap(b=>b.words) };
    } catch (err) {
      console.error('[AG-Transcribe] error main:', err);
      return { success: false, error: err.message };
    } finally {
      transcribing=false;
      if(audioPath) for(const p of [audioPath,audioPath+'.json',audioPath.replace(/\.wav$/i,'.json')])subtitleEngine.cleanupTempFile(p);
    }
  });

  ipcMain.handle('subtitles:fonts', async () => {
    try { return {fonts:await require('./subtitle-fonts').list()}; }
    catch (err) { return {fonts:[],error:err.message}; }
  });
  ipcMain.handle('subtitles:generateAss', async (_, { blocks, styleConfig, resolution }) => {
    try {
      await require('./subtitle-fonts').verify(blocks,styleConfig);
      // Measure using the same native Canvas and installed fonts as the preview.
      const prepared = await mainWindow.webContents.executeJavaScript(
        `SubtitleVisual.prepare(${JSON.stringify(blocks)},${JSON.stringify(styleConfig || {})})`
      );
      const assPath = subtitleEngine.generateAssFile(prepared, styleConfig, resolution);
      return { success: true, assPath };
    } catch (err) {
      console.error('ASS Generation error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Waveforms ─────────────────────────────────────────────────────────────
  ipcMain.handle('waveform:generate', async (_, { filePath, colorHex, width, height }) => {
    try {
      const pngPath = await waveformGenerator.generateWaveform(filePath, colorHex, width, height);
      return { success: true, pngPath };
    } catch (err) {
      console.error('Waveform generation error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Audio Files (External tracks) ─────────────────────────────────────────
  ipcMain.handle('audio:selectFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Audio File',
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    try {
      const meta = await ffmpegService.getMetadata(filePath);
      return {
        filePath,
        fileName: path.basename(filePath),
        duration: meta.duration || 0
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('audio:probe', async (_, filePath) => {
    try {
      const meta = await ffmpegService.getMetadata(filePath);
      return {
        filePath,
        fileName: path.basename(filePath),
        duration: meta.duration || 0
      };
    } catch (e) {
      return { error: e.message };
    }
  });
}

module.exports = { register };
