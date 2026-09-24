/**
 * WaveformRenderer
 * Manages asynchronous waveform generation and sharp rendering onto clip canvases.
 */
class WaveformRenderer {
  constructor() {
    this._imageCache = new Map(); // filePath -> HTMLImageElement
    this._loading = new Set();
    this.visible = true; // Global toggle
  }

  /**
   * Request waveform generation and preload the image.
   * @param {string} filePath 
   * @param {string} colorHex - e.g. '4caf50' or '888888'
   * @param {Function} onLoaded - Callback when ready to redraw
   */
  async loadWaveform(filePath, colorHex = '4caf50', onLoaded = null) {
    if (!filePath) return;
    if (this._imageCache.has(filePath)) {
      if (onLoaded) onLoaded(this._imageCache.get(filePath));
      return;
    }
    if (this._loading.has(filePath)) return;
    this._loading.add(filePath);

    try {
      const res = await window.electronAPI.generateWaveform({
        filePath,
        colorHex,
        width: 2400,
        height: 80
      });

      if (res && res.success && res.pngPath) {
        const img = new Image();
        img.onload = () => {
          this._imageCache.set(filePath, img);
          this._loading.delete(filePath);
          if (onLoaded) onLoaded(img);
        };
        img.onerror = () => {
          this._loading.delete(filePath);
        };
        // Normalize path for Windows file://
        const urlPath = res.pngPath.replace(/\\/g, '/');
        img.src = `file://${urlPath}`;
      } else {
        this._loading.delete(filePath);
      }
    } catch (e) {
      console.warn('WaveformRenderer error:', e.message);
      this._loading.delete(filePath);
    }
  }

  /**
   * Render the sliced portion of waveform onto a clip's canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {Object} clip - { filePath, trimIn, trimOut, duration }
   * @param {string} defaultColor
   */
  drawClipWaveform(canvas, clip, defaultColor = '4caf50') {
    if (!canvas || !clip || !clip.filePath) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!this.visible) return;

    const img = this._imageCache.get(clip.filePath);
    if (!img || !img.complete || img.naturalWidth === 0) {
      // Trigger lazy load
      this.loadWaveform(clip.filePath, defaultColor, () => {
        this.drawClipWaveform(canvas, clip, defaultColor);
      });
      return;
    }

    const totalDur = clip.fileDuration || clip.duration || (clip.trimOut - clip.trimIn) || 1;
    const trimIn = Math.max(0, clip.trimIn || 0);
    const trimOut = Math.min(totalDur, clip.trimOut || totalDur);

    // Compute source slice in image coordinates
    const sx = Math.max(0, (trimIn / totalDur) * img.naturalWidth);
    const sw = Math.max(1, ((trimOut - trimIn) / totalDur) * img.naturalWidth);

    ctx.save();
    ctx.drawImage(img, sx, 0, sw, img.naturalHeight, 0, 0, w, h);
    ctx.restore();
  }

  toggleVisibility() {
    this.visible = !this.visible;
    return this.visible;
  }
}

window.WaveformRenderer = WaveformRenderer;
