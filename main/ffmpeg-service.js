const ffmpeg        = require('fluent-ffmpeg');
const ffmpegStatic  = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const fs            = require('fs');
const path          = require('path');
const os            = require('os');

// Resolve paths for both dev and asar-packed production
function resolveBin(raw) {
  // ffmpeg-static v5 returns a plain string; ffprobe-static returns { path }
  if (raw && typeof raw === 'object' && raw.path) raw = raw.path;
  if (typeof raw !== 'string') throw new Error('Could not resolve binary path');
  return raw.replace(/app\.asar([/\\])/g, 'app.asar.unpacked$1');
}

try {
  ffmpeg.setFfmpegPath(resolveBin(ffmpegStatic));
  ffmpeg.setFfprobePath(resolveBin(ffprobeStatic.path));
} catch (e) {
  console.error('FFmpeg path resolution failed:', e.message);
}

class FFmpegService {
  constructor() { 
    this.currentCmd = null; 
    this.tempDir = path.join(os.tmpdir(), 'nexus-audio');
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
    this.cleanup();
  }

  // Cleanup temp files
  cleanup() {
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        for (const file of files) fs.unlinkSync(path.join(this.tempDir, file));
      }
    } catch (e) { console.error('Cleanup failed:', e); }
  }

  // ── Probe ──────────────────────────────────────────────────────────────
  getMetadata(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, meta) => {
        if (err) return reject(err);
        const vs = meta.streams.find(s => s.codec_type === 'video');
        if (!vs) return reject(new Error('No video stream found'));
        const [n, d] = (vs.r_frame_rate || '30/1').split('/').map(Number);
        resolve({
          duration: parseFloat(meta.format.duration) || 0,
          width:    vs.width,
          height:   vs.height,
          fps:      Math.round((d ? n / d : 30) * 100) / 100,
          hasAudio: meta.streams.some(s => s.codec_type === 'audio')
        });
      });
    });
  }

  cancelExport() {
    if (this.currentCmd) {
      this.currentCmd.kill('SIGKILL');
      this.currentCmd = null;
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────
  exportVideo(params, onProgress) {
    return new Promise((resolve, reject) => {
      const { filePath, cameras, trimIn, trimOut, resolution, outputPath, useGPU, hasAudio, fps } = params;

      const [outW, outH] = resolution === '720p' ? [720, 1280] : [1080, 1920];
      const active = cameras.filter(c => c.active);
      const n = active.length;
      if (!n) return reject(new Error('No active cameras'));

      // 1. Build Video Filter Complex
      const videoFilters = [];
      // Start with a black background with matching FPS
      videoFilters.push(`color=c=black:s=${outW}x${outH}:d=1:r=${fps || 30}[bg]`);

      active.forEach((cam, i) => {
        const x = Math.max(0, Math.round(cam.x));
        const y = Math.max(0, Math.round(cam.y));
        const w = Math.max(2, Math.round(cam.w));
        const ch = Math.max(2, Math.round(cam.h));
        
        // Scale preview coords to actual output resolution
        const pw = Math.round((cam.pw / 1080) * outW);
        const ph = Math.round((cam.ph / 1920) * outH);

        videoFilters.push(`[0:v]crop=${w}:${ch}:${x}:${y},scale=${pw}:${ph}:flags=lanczos[cam${i}]`);
      });

      let lastInput = '[bg]';
      active.forEach((cam, i) => {
        const px = Math.round((cam.px / 1080) * outW);
        const py = Math.round((cam.py / 1920) * outH);
        const nextOutput = (i === n - 1) ? '[vout]' : `[v${i}]`;
        videoFilters.push(`${lastInput}[cam${i}]overlay=${px}:${py}${nextOutput}`);
        lastInput = `[v${i}]`;
      });

      let filterComplex = videoFilters.join(';');

      const duration = trimOut - trimIn;
      const ss = Number(trimIn)  || 0;
      const t  = Number(duration) || 0;

      const mapOpts = [
        '-map [vout]',
        hasAudio ? '-map 0:a?' : null,
        '-c:v libx264',
        '-crf 18',
        '-preset fast',
        '-pix_fmt yuv420p',
        hasAudio ? '-c:a aac' : null,
        hasAudio ? '-b:a 192k' : null,
        '-r', String(fps || 30),
        '-movflags +faststart'
      ].filter(Boolean);

      if (!filePath) return reject(new Error('Input file path is missing.'));

      let cmd = ffmpeg(filePath);
      if (useGPU) cmd.inputOptions('-hwaccel', 'd3d11va');
      cmd.inputOptions(['-ss', String(ss), '-t', String(t)]);

      cmd.complexFilter(filterComplex)
         .outputOptions(mapOpts)
         .output(outputPath);

      cmd.on('progress', (info) => {
        if (info.percent != null) onProgress(Math.min(99, Math.round(info.percent)));
      });

      cmd.on('end', () => {
        this.currentCmd = null;
        onProgress(100);
        resolve();
      });

      cmd.on('error', (err) => {
        this.currentCmd = null;
        if (err.message.includes('SIGKILL')) return reject(new Error('CANCELLED'));
        // Retry without GPU if hwaccel failed
        if (useGPU && err.message.includes('d3d11va')) {
          params.useGPU = false;
          return this.exportVideo(params, onProgress).then(resolve).catch(reject);
        }
        reject(err);
      });

      this.currentCmd = cmd;
      cmd.run();
    });
  }
}

module.exports = FFmpegService;
