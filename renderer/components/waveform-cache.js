class WaveformCache extends WaveformRenderer {
  constructor() { super(); this.pending = new Map(); }
  async loadWaveform(filePath, colorHex = '7ba77b', onLoaded) {
    const key = filePath + ':' + colorHex;
    if (!this.pending.has(key)) {
      this.pending.set(key, (async () => {
        const result = await window.electronAPI.generateWaveform({filePath, colorHex, width: 2400, height: 80});
        if (!result.success || !result.pngPath) throw new Error(result.error || 'No waveform');
        const img = new Image();
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = encodeURI('file:///' + result.pngPath.replace(/\\/g, '/')).replace(/#/g,'%23'); });
        this._imageCache.set(filePath, img);
        return img;
      })());
    }
    try { const img = await this.pending.get(key); onLoaded?.(img); return img; }
    catch (e) { console.warn('Waveform:', e.message); return null; }
  }
}
