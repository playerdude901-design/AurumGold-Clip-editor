const ffmpeg        = require('fluent-ffmpeg');
const ffmpegStatic  = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const {sequenceVideoFilters,audioSlices,tempoFilters}=require('./sequence-filters');

function resolveFfmpegPath() {
  try {
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

function resolveFfprobePath() {
  try {
    let p = ffprobeStatic;
    if (p && typeof p === 'object' && p.path) p = p.path;
    if (typeof p === 'string') {
      const unpacked = p.replace(/app\.asar([/\\])/g, 'app.asar.unpacked$1');
      if (fs.existsSync(unpacked)) return unpacked;
      if (fs.existsSync(p)) return p;
    }
  } catch (_) {}
  const localNodeModules = path.join(__dirname, '../node_modules/ffprobe-static/ffprobe.exe');
  if (fs.existsSync(localNodeModules)) return localNodeModules;
  if (fs.existsSync('C:\\ffmpeg\\bin\\ffprobe.exe')) return 'C:\\ffmpeg\\bin\\ffprobe.exe';
  return 'ffprobe';
}

try {
  ffmpeg.setFfmpegPath(resolveFfmpegPath());
  ffmpeg.setFfprobePath(resolveFfprobePath());
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

  getAudioMetadata(filePath) {
    return new Promise((resolve,reject)=>ffmpeg.ffprobe(filePath,(error,meta)=>{
      if(error)return reject(error);
      if(!meta.streams.some(s=>s.codec_type==='audio'))return reject(new Error('No audio stream found'));
      resolve({duration:Number(meta.format.duration) || 0});
    }));
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
      let sourceLabel = '0:v';
      if(params.sequence) {
        const plan=sequenceVideoFilters(params.sequence,params.videoWidth,params.videoHeight,fps || 30,trimIn,trimOut);
        videoFilters.push(...plan.filters);sourceLabel=plan.label;
      }
      videoFilters.push('['+sourceLabel+']split='+n+active.map((_,i)=>'[source'+i+']').join(''));
      // Start with a black background with matching FPS
      videoFilters.push(`color=c=black:s=${outW}x${outH}:d=${trimOut-trimIn}:r=${fps || 30}[bg]`);

      active.forEach((cam, i) => {
        const x = Math.max(0, Math.round(cam.x));
        const y = Math.max(0, Math.round(cam.y));
        const w = Math.max(2, Math.round(cam.w));
        const ch = Math.max(2, Math.round(cam.h));
        
        // Scale preview coords to actual output resolution
        const pw = Math.round((cam.pw / 1080) * outW);
        const ph = Math.round((cam.ph / 1920) * outH);

        if (cam.shape === 'circle') {
          // Crop and scale, then apply an elliptical alpha mask via geq, then convert to rgba
          videoFilters.push(`[source${i}]crop=${w}:${ch}:${x}:${y},scale=${pw}:${ph}:flags=lanczos,format=rgba[camraw${i}]`);
          // geq lum replicates luma; alpha channel uses ellipse formula: (x-cx)^2/rx^2 + (y-cy)^2/ry^2 <= 1
          const rx = pw / 2, ry = ph / 2;
          videoFilters.push(
            `[camraw${i}]geq=` +
            `lum='p(X,Y)':` +
            `cb='cb(X,Y)':` +
            `cr='cr(X,Y)':` +
            `a='if(lte(pow((X-${rx})/${rx}\\,2)+pow((Y-${ry})/${ry}\\,2)\\,1)\\,255\\,0)'` +
            `[cam${i}]`
          );
        } else {
          videoFilters.push(`[source${i}]crop=${w}:${ch}:${x}:${y},scale=${pw}:${ph}:flags=lanczos[cam${i}]`);
        }
      });

      const hasSubtitles = Boolean(params.assPath && fs.existsSync(params.assPath));

      let lastInput = '[bg]';
      active.forEach((cam, i) => {
        const px = Math.round((cam.px / 1080) * outW);
        const py = Math.round((cam.py / 1920) * outH);
        const isFinalOverlay = (i === n - 1);
        const nextOutput = isFinalOverlay ? (hasSubtitles ? '[v_presub]' : '[vout]') : `[v${i}]`;
        // For circle cameras, use overlay with alpha for transparency support
        const overlayOptions = cam.shape === 'circle' ? `overlay=${px}:${py}:format=auto` : `overlay=${px}:${py}`;
        videoFilters.push(`${lastInput}[cam${i}]${overlayOptions}${nextOutput}`);
        lastInput = `[v${i}]`;
      });

      if (hasSubtitles) {
        const escapedAss = params.assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
        videoFilters.push(`[v_presub]subtitles='${escapedAss}'[vout]`);
      }

      const audioFilters = [];
      const explicitAudio = Array.isArray(params.audioTracks);
      const tracks = explicitAudio ? params.audioTracks : (hasAudio ? [{filePath,offset:0,trimIn:0,trimOut,volume:1}] : []);
      const additionalAudioInputs = audioSlices(tracks,trimIn,trimOut);
      additionalAudioInputs.forEach((clip,i)=>{
        audioFilters.push('['+(i+1)+':a]asetpts=PTS-STARTPTS,'+tempoFilters(clip.speed)+',asetpts=N/SR/TB,volume='+(clip.volume ?? 1)+',adelay='+Math.round(clip.delay*1000)+':all=1[a'+i+']');
      });
      const hasActiveAudio = additionalAudioInputs.length>0;
      const hasMultiAudio = hasActiveAudio;
      if(hasActiveAudio)audioFilters.push(additionalAudioInputs.map((_,i)=>'[a'+i+']').join('')+'amix=inputs='+additionalAudioInputs.length+':duration=longest:normalize=0,asetpts=N/SR/TB,apad=whole_dur='+(trimOut-trimIn)+',atrim=duration='+(trimOut-trimIn)+'[aout]');

      const allFilters = [...videoFilters, ...audioFilters];
      let filterComplex = allFilters.join(';');

      const duration = trimOut - trimIn;
      const ss = Number(trimIn)  || 0;
      const t  = Number(duration) || 0;

      const mapOpts = [
        '-filter_complex_threads 1',
        '-map [vout]',
        hasActiveAudio ? (hasMultiAudio && audioFilters.length > 0 ? '-map [aout]' : '-map 0:a?') : null,
        '-c:v libx264',
        '-crf 18',
        '-preset fast',
        '-pix_fmt yuv420p',
        hasActiveAudio ? '-c:a aac' : null,
        hasActiveAudio ? '-b:a 192k' : null,
        '-r', String(fps || 30),
        '-movflags +faststart'
      ].filter(Boolean);

      if (!filePath) return reject(new Error('Input file path is missing.'));

      let cmd = ffmpeg(filePath);
      if (useGPU) cmd.inputOptions('-hwaccel', 'd3d11va');
      if(!params.sequence)cmd.inputOptions(['-ss', String(ss), '-t', String(t)]);
      cmd.outputOptions(['-t',String(t)]);

      // Add external audio inputs with their trimmed duration
      additionalAudioInputs.forEach(ext => {
        const extSS = ext.sourceStart;
        const extDur = ext.sourceDuration;
        cmd.input(ext.filePath).inputOptions(['-ss', String(extSS), '-t', String(extDur)]);
      });

      cmd.complexFilter(filterComplex)
         .outputOptions(mapOpts)
         .output(outputPath);

      if(process.env.AG_DEBUG_FFMPEG)cmd.on('stderr',line=>console.log(line));
      cmd.on('progress', (info) => {
        if (info.percent != null) onProgress(Math.min(99, Math.round(info.percent)));
      });

      const cleanupAss = () => {
        if (params.assPath && fs.existsSync(params.assPath)) {
          try { fs.unlinkSync(params.assPath); } catch (_) {}
        }
      };

      cmd.on('end', () => {
        this.currentCmd = null;
        cleanupAss();
        onProgress(100);
        resolve();
      });

      cmd.on('error', (err) => {
        this.currentCmd = null;
        if (err.message.includes('SIGKILL')) { cleanupAss(); return reject(new Error('CANCELLED')); }
        // Retry without GPU if hwaccel failed
        if (useGPU && err.message.includes('d3d11va')) {
          params.useGPU = false;
          return this.exportVideo(params, onProgress).then(resolve).catch(reject);
        }
        cleanupAss();
        reject(err);
      });

      this.currentCmd = cmd;
      cmd.run();
    });
  }
}

module.exports = FFmpegService;
