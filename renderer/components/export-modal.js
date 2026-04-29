/**
 * Export Modal component
 */
class ExportModal {
  constructor(state) {
    this.state       = state;
    this.outputFolder = null;
    this.resolution  = '1080p';
    this.exporting   = false;
    this.audioStrategy = 'mix';

    this.elOverlay     = document.getElementById('export-overlay');
    this.elBtnExport   = document.getElementById('btn-export');
    this.elClose       = document.getElementById('export-close');
    this.elFolderPath  = document.getElementById('export-folder-path');
    this.elSelectFold  = document.getElementById('btn-select-folder');
    this.elTrimInfo    = document.getElementById('export-trim-info');
    this.elProgressWrap= document.getElementById('progress-wrap');
    this.elProgressFill= document.getElementById('progress-fill');
    this.elProgressPct = document.getElementById('progress-pct');
    this.elActions     = document.getElementById('export-actions');
    this.elBtnStart    = document.getElementById('btn-start-export');
    this.elBtnCancel   = document.getElementById('btn-cancel-export');
    this.elDone        = document.getElementById('export-done');
    this.elDoneMsg     = document.getElementById('export-done-msg');
    this.elOpenFolder  = document.getElementById('btn-open-folder');

    this._bindEvents();
  }

  open() {
    this._reset();
    const trimDur = this.state.trimOut - this.state.trimIn;
    this.elTrimInfo.textContent =
      this.state.trimIn === 0 && this.state.trimOut === this.state.videoDuration
        ? `Full video — ${formatTime(this.state.videoDuration)}`
        : `${formatTime(this.state.trimIn)} → ${formatTime(this.state.trimOut)}  (${formatTime(trimDur)})`;
    this.elOverlay.style.display = 'flex';
  }

  close() {
    if (this.exporting) return;
    this.elOverlay.style.display = 'none';
  }

  _reset() {
    this.elProgressWrap.style.display = 'none';
    this.elActions.style.display      = 'flex';
    this.elDone.style.display         = 'none';
    this.elBtnCancel.style.display    = 'none';
    this.elBtnStart.disabled          = false;
    this.elProgressFill.style.width   = '0%';
    this.elProgressPct.textContent    = '0%';
    this.exporting = false;
  }

  async _startExport() {
    if (!this.outputFolder) { alert('Please select an output folder.'); return; }
    if (!this.state.cameras.filter(c => c.active).length) { alert('No cameras defined.'); return; }

    const fileName = `nexus_export_${Date.now()}.mp4`;
    const outputPath = this.outputFolder.replace(/\\/g, '/') + '/' + fileName;

    this.exporting = true;
    this.elBtnStart.disabled       = true;
    this.elBtnCancel.style.display = 'inline-flex';
    this.elProgressWrap.style.display = 'flex';

    // Remove stale listeners and add fresh ones
    window.electronAPI.removeExportListeners();

    window.electronAPI.onExportProgress(({ percent }) => {
      this.elProgressFill.style.width = `${percent}%`;
      this.elProgressPct.textContent  = `${percent}%`;
    });

    window.electronAPI.onExportDone(({ outputPath: out }) => {
      this.exporting = false;
      this.elProgressFill.style.width = '100%';
      this.elProgressPct.textContent  = '100%';
      this.elActions.style.display    = 'none';
      this.elDone.style.display       = 'flex';
      this.elDoneMsg.textContent      = `Saved: ${out.split(/[\\/]/).pop()}`;
      this._lastOutputFolder = this.outputFolder;
    });

    window.electronAPI.onExportError(({ message }) => {
      this.exporting = false;
      this._reset();
      alert(`Export failed: ${message}`);
    });

    await window.electronAPI.exportVideo({
      filePath:   this.state.filePath,
      cameras:    this.state.cameras,
      trimIn:     this.state.trimIn,
      trimOut:    this.state.trimOut,
      resolution: this.resolution,
      outputPath,
      useGPU:        true,
      hasAudio:      this.state.hasAudio,
      fps:           this.state.videoFps || 30,
      audioTracks:   this.state.audioTracks,
      audioStrategy: this.audioStrategy
    });
  }

  _bindEvents() {
    this.elBtnExport.addEventListener('click', () => this.open());
    this.elClose.addEventListener('click',    () => this.close());
    this.elOverlay.addEventListener('click',  e => { if (e.target === this.elOverlay) this.close(); });

    this.elSelectFold.addEventListener('click', async () => {
      const folder = await window.electronAPI.selectFolder();
      if (folder) {
        this.outputFolder = folder;
        this.elFolderPath.textContent = folder;
      }
    });

    this.elBtnStart.addEventListener('click', () => this._startExport());

    this.elBtnCancel.addEventListener('click', () => {
      window.electronAPI.cancelExport();
      this.exporting = false;
      this._reset();
    });

    this.elOpenFolder.addEventListener('click', () => {
      if (this._lastOutputFolder) window.electronAPI.openFolder(this._lastOutputFolder);
    });

    // Resolution & Audio radio cards
    document.querySelectorAll('.radio-card').forEach(card => {
      card.addEventListener('click', () => {
        const input = card.querySelector('input');
        const group = input.name;
        
        document.querySelectorAll(`.radio-card:has(input[name="${group}"])`).forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        input.checked = true;
        
        if (group === 'resolution') this.resolution = input.value;
        if (group === 'audio-strategy') this.audioStrategy = input.value;
      });
    });
  }
}
