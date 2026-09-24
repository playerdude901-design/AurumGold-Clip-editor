const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');

class WaveformGenerator {
  constructor() {
    this.cacheDir = path.join(os.tmpdir(), 'aurum-waveforms');
    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch (err) {
        console.warn('Failed creating waveform cache dir:', err.message);
      }
    }
  }

  /**
   * Generates a waveform PNG image for an audio or video file.
   * Uses showwavespic filter in FFmpeg.
   * @param {string} filePath - Absolute path to audio or video file
   * @param {string} [colorHex='4caf50'] - Hex color for waveform (without #)
   * @param {number} [width=2000] - Image width
   * @param {number} [height=80] - Image height
   * @returns {Promise<string>} Path to generated PNG
   */
  async generateWaveform(filePath, colorHex = '4caf50', width = 2000, height = 80) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const cleanColor = colorHex.replace('#', '').trim() || '4caf50';
    const stat=fs.statSync(filePath);
    const hash = crypto.createHash('md5').update(`${filePath}_${stat.size}_${stat.mtimeMs}_${cleanColor}_${width}x${height}`).digest('hex');
    const outPngPath = path.join(this.cacheDir, `wf_${hash}.png`);

    // Check if already cached
    if (fs.existsSync(outPngPath)) {
      return outPngPath;
    }

    return new Promise((resolve, reject) => {
      // FFmpeg showwavespic syntax: colors=0xRRGGBB
      const filter = `aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=0x${cleanColor}`;

      ffmpeg(filePath)
        .complexFilter([filter])
        .outputOptions(['-vframes', '1'])
        .output(outPngPath)
        .on('end', () => resolve(outPngPath))
        .on('error', (err) => {
          console.warn('showwavespic failed, fallback to empty waveform:', err.message);
          // Return null if generation failed so UI does not crash
          resolve(null);
        })
        .run();
    });
  }

  cleanup() {
    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          try { fs.unlinkSync(path.join(this.cacheDir, file)); } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('Waveform cleanup notice:', e.message);
    }
  }
}

module.exports = WaveformGenerator;
