/**
 * Timeline component — Premiere Pro Multi-track NLE Coordinator
 * Integrates TrackManager, WaveformRenderer, and TimelineEngine.
 */
class Timeline {
  constructor(state) {
    this.state = state;

    // Sub-modules
    this.waveformRenderer = new WaveformCache();
    this.trackManager     = new TimelineTracks(state);
    this.engine           = new TimelineEngine(state, this.trackManager, this.waveformRenderer);

    // Toolbar elements
    this.btnAddVideoTrack = document.getElementById('tl-btn-add-video-track');
    this.btnAddAudioTrack = document.getElementById('tl-btn-add-audio-track');
    this.btnAddAudioFile  = document.getElementById('tl-btn-add-audio-file');
    this.btnToggleWaveform= document.getElementById('tl-btn-toggle-waveform');
    this.btnAddSubCue     = document.getElementById('tl-btn-add-sub-cue');
    this.btnSubStyles     = document.getElementById('tl-btn-edit-sub-styles');

    this._bindToolbar();
  }

  init() {
    const { state } = this;
    state.trimIn  = 0;
    state.trimOut = state.videoDuration;

    // Initialize track manager with loaded video
    this.trackManager.initFromVideo(state.filePath, state.videoDuration);
    this.engine.pxPerSecond = 100;
    state.sequenceDuration = state.videoDuration;
    this.engine.clock.sync();

    // Pre-generate waveform for video audio
    if (state.hasAudio && state.filePath) {
      this.waveformRenderer.loadWaveform(state.filePath, '7ba77b', () => {
        this.engine.render();
      });
    }

    this.engine.render();
  }

  _bindToolbar() {
    // Add Video Track
    if (this.btnAddVideoTrack) {
      this.btnAddVideoTrack.addEventListener('click', () => {
        this.trackManager.addVideoTrack();
        this.trackManager.changed();
        this.engine.render();
      });
    }

    // Add Audio Track
    if (this.btnAddAudioTrack) {
      this.btnAddAudioTrack.addEventListener('click', () => {
        this.trackManager.addAudioTrack();
        this.trackManager.changed();
        this.engine.render();
      });
    }

    // Add External Audio File
    if (this.btnAddAudioFile) {
      this.btnAddAudioFile.addEventListener('click', async () => {
        const fileMeta = await window.electronAPI.selectAudioFile();
        if(fileMeta?.error){alert(fileMeta.error);return;}
        if (fileMeta && !fileMeta.error) {
          const curTime = this.engine.clock.time;
          this.trackManager.addAudioClip(null, fileMeta, curTime);
          this.engine.render();
        }
      });
    }

    // Toggle Waveforms
    if (this.btnToggleWaveform) {
      this.btnToggleWaveform.addEventListener('click', () => {
        const isVis = this.waveformRenderer.toggleVisibility();
        this.btnToggleWaveform.classList.toggle('active', isVis);
        this.engine.render();
      });
    }

    // Add Subtitle Cue at playhead
    if (this.btnAddSubCue) {
      this.btnAddSubCue.addEventListener('click', () => {
        this._addSubtitleAtPlayhead();
      });
    }

    // Subtitle Styles
    if (this.btnSubStyles) {
      this.btnSubStyles.addEventListener('click', () => {
        EventBus.emit('subtitle:edit-requested');
      });
    }

    // Listen for external subtitles updates
    EventBus.on('subtitles:changed', () => {
      this.trackManager.syncSubtitlesFromState();
      this.engine.render();
      EventBus.emit('project:changed');
    });

    // Listen for video loaded
    EventBus.on('video:loaded', () => {
      this.init();
    });

    // Window resize
    EventBus.on('window:resize', () => {
      this.engine.render();
    });
    window.addEventListener('resize', () => {
      this.engine.render();
    });
  }

  _addSubtitleAtPlayhead() {
    const curTime = this.engine.clock.time;
    const dur = this.trackManager.duration;
    const start = Math.round(curTime * 100) / 100;
    const end = Math.min(dur, Math.round((start + 2.0) * 100) / 100);

    if (!this.state.subtitles) this.state.subtitles = [];
    const newId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newBlock = {
      id: newId,
      start,
      end,
      text: 'Nuevo subtítulo',
      words: [
        { word: 'Nuevo', start: start, end: start + 0.9 },
        { word: 'subtítulo', start: start + 0.9, end: end }
      ]
    };

    this.state.subtitles.push(newBlock);
    this.state.subtitles.sort((a, b) => a.start - b.start);
    this.state.selectedSubtitleId = newId;

    this.trackManager.syncSubtitlesFromState();
    this.engine.render();
    EventBus.emit('subtitles:changed');
    EventBus.emit('project:changed');
  }

  getExportAudioTracks() {
    return this.trackManager.getExportAudioTracks();
  }
}

window.Timeline = Timeline;
