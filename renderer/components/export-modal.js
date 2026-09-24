/**
 * Export Modal component
 * Manages video export settings, audio transcription trigger, subtitle customization integration, and FFmpeg export progress.
 */
class ExportModal {
  constructor(state, subtitleEditor) {
    this.state          = state;
    this.subtitleEditor = subtitleEditor;
    this.outputFolder   = null;
    this.resolution     = '1080p';
    this.exporting      = false;
    this.audioStrategy  = 'mix';
    this.subtitlesEnabled = true;

    this.elOverlay      = document.getElementById('export-overlay');
    this.elBtnExport    = document.getElementById('btn-export');
    this.elClose        = document.getElementById('export-close');
    this.elFolderPath   = document.getElementById('export-folder-path');
    this.elSelectFold   = document.getElementById('btn-select-folder');
    this.elTrimInfo     = document.getElementById('export-trim-info');
    this.elProgressWrap = document.getElementById('progress-wrap');
    this.elProgressFill = document.getElementById('progress-fill');
    this.elProgressPct  = document.getElementById('progress-pct');
    this.elActions      = document.getElementById('export-actions');
    this.elBtnStart     = document.getElementById('btn-start-export');
    this.elBtnCancel    = document.getElementById('btn-cancel-export');
    this.elDone         = document.getElementById('export-done');
    this.elDoneMsg      = document.getElementById('export-done-msg');
    this.elOpenFolder   = document.getElementById('btn-open-folder');
    this.elFilename     = document.getElementById('export-filename');
    this.elSubToggle    = document.getElementById('export-subtitles-toggle');

    // Transcribe overlay
    this.elTranscribeOverlay = document.getElementById('transcribe-overlay');
    this.elTranscribeMsg     = document.getElementById('transcribe-msg');

    this._bindEvents();
    const body=this.elOverlay.querySelector('.modal-body');
    const controls=document.createElement('div');controls.className='form-group';
    controls.innerHTML='<label class="form-label">FPS</label><select id="export-fps" class="cam-input"><option value="source">Source</option><option>24</option><option>25</option><option>30</option><option>50</option><option>60</option></select><label class="form-label">Formato</label><select id="export-format" class="cam-input"><option value="mp4">MP4 · H.264 / AAC</option><option value="mov">MOV · H.264 / AAC</option><option value="mkv">MKV · H.264 / AAC</option></select>';
    body.append(controls);
    EventBus.on('export:refresh',()=>this.refresh());
    EventBus.on('video:loaded',()=>{this.elFilename.value='AurumGold_'+this.state.filePath.split(/[\\/]/).pop().replace(/\.[^.]+$/,'');this.refresh();});
  }

  refresh() {
    this.elTrimInfo.textContent=AGTime.format(this.state.trimIn,this.state.videoFps)+' → '+AGTime.format(this.state.trimOut,this.state.videoFps);
    this.elBtnStart.disabled=this.exporting || !this.state.filePath;
  }
  open() { this.refresh(); EventBus.emit('layout:tab','export'); }
  close() { EventBus.emit('layout:tab','cameras'); }

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
    if(this.exporting || !this.state.filePath)return;
    if(!this.outputFolder){alert('Selecciona una carpeta de salida.');return;}
    if(!this.state.cameras.some(c=>c.active)){alert('Añade una cámara activa.');return;}
    const ext=document.getElementById('export-format').value;
    const name=(this.elFilename.value || 'AurumGold_Clip').trim().replace(/\.(mp4|mov|mkv)$/i,'');
    if(!name || /[<>:"/\\|?*]/.test(name) || /[. ]$/.test(name)){alert('Nombre de archivo inválido.');return;}
    const outputPath=this.outputFolder.replace(/\\/g,'/')+'/'+name+'.'+ext;
    if(outputPath.toLowerCase()===this.state.filePath.replace(/\\/g,'/').toLowerCase()){alert('Usa un nombre distinto al archivo original.');return;}
    this.exporting=true;this.elBtnStart.disabled=true;
    try {
      let assPath=null;
      if(this.elSubToggle.checked && this.state.subtitlesVisible!==false && this.state.subtitles.length) {
        const start=this.state.trimIn,end=this.state.trimOut;
        const blocks=this.state.subtitles.filter(b=>b.start<end && b.end>start).map(b=>({...b,start:Math.max(0,b.start-start),end:Math.min(end,b.end)-start,words:(b.words || []).filter(w=>w.end>start && w.start<end).map(w=>({...w,start:Math.max(0,w.start-start),end:Math.min(end,w.end)-start}))}));
        const result=await window.electronAPI.generateAss({blocks,styleConfig:this.state.subtitleStyle,resolution:this.resolution});
        if(!result.success)throw new Error(result.error);assPath=result.assPath;
      }
      await this._proceedFFmpegExport(outputPath,assPath);
    } catch(e) {this._reset();alert('Export: '+e.message);}
  }

  _showTranscribing(show, message = 'Transcribing audio...') {
    if (!this.elTranscribeOverlay) return;
    if (this.elTranscribeMsg) this.elTranscribeMsg.textContent = message;
    this.elTranscribeOverlay.style.display = show ? 'flex' : 'none';
  }

  async _proceedFFmpegExport(outputPath, assPath) {
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
      filePath:      this.state.filePath,
      cameras:       this.state.cameras,
      trimIn:        this.state.trimIn,
      trimOut:       this.state.trimOut,
      resolution:    this.resolution,
      outputPath,
      useGPU:        true,
      hasAudio:      this.state.hasAudio,
      fps:           Number(document.getElementById('export-fps').value) || this.state.videoFps || 30,
      sequence:      this.state.timeline.trackManager.serialize(),
      videoWidth:    this.state.videoWidth,
      videoHeight:   this.state.videoHeight,
      audioTracks:   this.state.timeline.getExportAudioTracks(),
      audioStrategy: this.audioStrategy,
      assPath:       assPath
    });
  }

  _bindEvents() {
    this.elBtnExport.addEventListener('click', () => this.open());
    this.elClose.addEventListener('click',    () => this.close());


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

    if (this.elSubToggle) {
      this.elSubToggle.addEventListener('change', (e) => {
        this.subtitlesEnabled = e.target.checked;
      });
    }

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
