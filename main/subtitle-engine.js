const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');

function resolveFfmpegPath() {
  try {
    const ffmpegStatic = require('ffmpeg-static');
    let p = ffmpegStatic;
    if (p && typeof p === 'object' && p.path) p = p.path;
    if (typeof p === 'string') {
      const unpacked = p.replace(/app\.asar([/\\])/g, 'app.asar.unpacked$1');
      if (fs.existsSync(unpacked)) return unpacked;
      if (fs.existsSync(p)) return p;
    }
  } catch (_) {}
  const localNodeModules = path.join(__dirname, '../node_modules/ffmpeg-static/ffmpeg.exe');
  if (fs.existsSync(localNodeModules)) return localNodeModules;
  if (fs.existsSync('C:\\ffmpeg\\bin\\ffmpeg.exe')) return 'C:\\ffmpeg\\bin\\ffmpeg.exe';
  return 'ffmpeg';
}

try {
  ffmpeg.setFfmpegPath(resolveFfmpegPath());
} catch (e) {
  console.warn('SubtitleEngine ffmpeg path set failed:', e.message);
}

class SubtitleEngine {
  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'aurum-subtitles');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  // ── Extract Audio from video segment ─────────────────────────────────────
  extractAudioForWhisper(filePath, trimIn, trimOut) {
    return new Promise((resolve, reject) => {
      const outWavPath = path.join(this.tempDir, `audio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.wav`);
      const ss = Number(trimIn) || 0;
      const duration = Math.max(0.1, Number(trimOut - trimIn) || 1);

      ffmpeg(filePath)
        .setStartTime(ss)
        .setDuration(duration)
        .outputOptions([
          '-vn',
          '-acodec', 'pcm_s16le',
          '-ar', '16000',
          '-ac', '1'
        ])
        .output(outWavPath)
        .on('end', () => resolve(outWavPath))
        .on('error', (err) => reject(new Error(`Audio extraction failed: ${err.message}`)))
        .run();
    });
  }

  // Run engines outside the Electron main process; a missing model never blocks the UI.
  async transcribeAudio(audioPath, options = {}) {
    const { fork } = require('child_process');
    console.log('[AG-Transcribe] paso 5: iniciar Whisper');
    const words = await new Promise((resolve, reject) => {
      const worker = fork(path.join(__dirname, 'transcribe-worker.js'), [], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PATH: path.dirname(resolveFfmpegPath()) + path.delimiter + process.env.PATH },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true
      });
      let settled = false;
      const timer = setTimeout(() => { worker.kill(); finish(new Error('Whisper excedió 15 minutos. Comprueba el modelo y Python.')); }, 15 * 60 * 1000);
      const finish = (err, value) => { if(settled)return;settled=true;clearTimeout(timer);worker.kill();err?reject(err):resolve(value); };
      worker.stdout.on('data', data => console.log('[AG-Transcribe]', String(data).trim()));
      worker.stderr.on('data', data => console.warn('[AG-Transcribe]', String(data).trim()));
      worker.on('error', err => finish(err));
      worker.on('exit', code => { if(!settled) finish(new Error('Whisper terminó sin resultado ('+code+').')); });
      worker.on('message', result => finish(result.error ? new Error(result.error) : null, result.words));
      worker.send({audioPath, options});
    });
    return this.groupWordsIntoBlocks(words);
  }

  // ── Parse whisper output files ──────────────────────────────────────────
  _findAndParseWhisperOutput(audioPath, language = 'es') {
    const baseName = audioPath.replace(/\.wav$/i, '');
    const jsonPath = `${baseName}.json`;

    for (const candidate of [audioPath + '.json', jsonPath]) {
      if (fs.existsSync(candidate)) {
        try { return SubtitleEngine.parseWords(JSON.parse(fs.readFileSync(candidate, 'utf8'))); }
        catch (e) { console.warn('Whisper JSON:', e.message); }
      }
    }
    return null;
  }

  static parseWords(data) {
    const rows = Array.isArray(data) ? data : (data.segments || data.transcription || []);
    const result = [];
    const seconds = value => {
      if(typeof value === 'number')return value;
      return String(value || '0').replace(',', '.').split(':').reduce((sum, part) => sum*60+Number(part), 0);
    };
    for(const row of rows) {
      for(const word of row.words || [row]) {
        const text = (word.word || word.text || '').trim();
        const start = word.offsets ? word.offsets.from/1000 : seconds(word.start ?? word.from ?? word.timestamps?.from);
        const end = word.offsets ? word.offsets.to/1000 : seconds(word.end ?? word.to ?? word.timestamps?.to);
        if(!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || text.startsWith('[_'))continue;
        // Older whisper.cpp versions can return a phrase; distribute only in that case.
        const parts = text.split(/\s+/);
        parts.forEach((word,i) => result.push({word,start:start+(end-start)*i/parts.length,end:start+(end-start)*(i+1)/parts.length}));
      }
    }
    return result;
  }

  _parseTimestampToSeconds(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    // Format "00:01:23.450" or "00:01:23,450"
    const str = String(val).replace(',', '.');
    const parts = str.split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(str) || 0;
  }

  // ── Group Words into Blocks (~4 words per block) ─────────────────────────
  groupWordsIntoBlocks(words, targetWordsPerBlock = 4) {
    if (!words || !words.length) return [];
    const blocks = [];
    let currentWords = [];

    for (let i = 0; i < words.length; i++) {
      currentWords.push(words[i]);
      const isPunctuationEnd = /[.!?]$/.test(words[i].word);
      if (currentWords.length >= targetWordsPerBlock || isPunctuationEnd || i === words.length - 1) {
        const start = currentWords[0].start;
        const end = Math.max(start + 0.01, currentWords[currentWords.length - 1].end);
        const text = currentWords.map(w => w.word).join(' ').trim();
        blocks.push({
          id: `block_${blocks.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
          start: Math.round(start * 100) / 100,
          end: Math.round(end * 100) / 100,
          text: text,
          words: [...currentWords]
        });
        currentWords = [];
      }
    }
    return blocks;
  }

  // ── Convert Hex Color to ASS format &HAABBGGRR& ─────────────────────────
  hexToAssColor(hex, alpha = 1) {
    if (!hex) return '&H00FFFFFF&';
    let clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
      clean = clean.split('').map(c => c + c).join('');
    }
    if (clean.length !== 6) return '&H00FFFFFF&';

    const r = clean.substring(0, 2);
    const g = clean.substring(2, 4);
    const b = clean.substring(4, 6);
    // ASS Alpha: 00 = completely opaque, FF = completely transparent
    const aVal = Math.max(0, Math.min(255, Math.round((1 - alpha) * 255)));
    const a = aVal.toString(16).padStart(2, '0').toUpperCase();

    return `&H${a}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}&`;
  }

  // ── Format Seconds to ASS Timestamp (H:MM:SS.CC) ────────────────────────
  formatAssTime(seconds) {
    const s = Math.max(0, Number(seconds) || 0);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    const cs = Math.floor(Math.round((s % 1) * 100));

    const hh = hrs.toString();
    const mm = mins.toString().padStart(2, '0');
    const ss = secs.toString().padStart(2, '0');
    const cc = (cs >= 100 ? 99 : cs).toString().padStart(2, '0');

    return `${hh}:${mm}:${ss}.${cc}`;
  }

  // ── Generate .ASS subtitle file ──────────────────────────────────────────
  generateAssFile(blocks, styleConfig = {}, resolution = '1080p') {
    // PlayRes is fixed; libass scales subtitles to the existing export resolution.
    const content = require('./subtitle-ass').generate(blocks, styleConfig);
    const outAssPath = path.join(this.tempDir, `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.ass`);
    fs.writeFileSync(outAssPath, content, 'utf8');
    return outAssPath;
  }

  // ── Cleanup temp files ───────────────────────────────────────────────────
  cleanupTempFile(filePath) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.warn('Could not remove temp subtitle file:', e.message);
    }
  }
}

module.exports = SubtitleEngine;
