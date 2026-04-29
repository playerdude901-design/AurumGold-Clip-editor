/**
 * Timeline component — scrubbing, playback, trim in/out markers
 */
class Timeline {
  constructor(state) {
    this.state = state;

    this.elTrack    = document.getElementById('tl-track');
    this.elPlayhead = document.getElementById('tl-playhead');
    this.elTrimIn   = document.getElementById('tl-trim-in');
    this.elTrimOut  = document.getElementById('tl-trim-out');
    this.elShadeL   = document.getElementById('tl-shade-left');
    this.elShadeR   = document.getElementById('tl-shade-right');
    this.elCurrent  = document.getElementById('tl-current');
    this.elDuration = document.getElementById('tl-duration');
    this.elInLabel  = document.getElementById('tl-in-label');
    this.elOutLabel = document.getElementById('tl-out-label');
    this.elMarkerInLabel  = document.getElementById('tl-marker-in-label');
    this.elMarkerOutLabel = document.getElementById('tl-marker-out-label');
    this.elPlay     = document.getElementById('tl-play');
    this.elRewind   = document.getElementById('tl-rewind');
    this.elMute     = document.getElementById('tl-mute');
    this.iconPlay   = document.getElementById('icon-play');
    this.iconPause  = document.getElementById('icon-pause');
    this.elZoom     = document.getElementById('tl-zoom');
    this.elInner    = document.getElementById('tl-inner');
    this.elScroll   = document.getElementById('tl-scroll');
    this.elTicks    = document.getElementById('tl-ticks');
    this.elTStart   = document.getElementById('tl-time-start');
    this.elTEnd     = document.getElementById('tl-time-end');

    this._dragging  = null; // 'playhead' | 'trim-in' | 'trim-out'
    this.zoomLevel  = 1.0;
    this._bindEvents();
  }

  // ── Initialise once video is loaded ─────────────────────────────────
  init() {
    const { state } = this;
    state.trimIn  = 0;
    state.trimOut = state.videoDuration;
    this.elDuration.textContent = formatTime(state.videoDuration);
    this.elTEnd.textContent     = formatTime(state.videoDuration);
    this.elOutLabel.textContent = `Out: ${formatTime(state.videoDuration)}`;
    this._renderTicks();
    this._update();
  }

  // ── Update UI positions from state ──────────────────────────────────
  _update() {
    const { state } = this;
    const dur = state.videoDuration || 1;
    const cur = state.videoEl ? state.videoEl.currentTime : 0;

    // Apply zoom
    this.elInner.style.width = (this.zoomLevel * 100) + '%';

    const pct      = cur / dur;
    const inPct    = state.trimIn  / dur;
    const outPct   = state.trimOut / dur;

    this.elPlayhead.style.left     = `${pct   * 100}%`;
    this.elTrimIn.style.left       = `${inPct  * 100}%`;
    this.elTrimOut.style.left      = `${outPct * 100}%`;
    this.elShadeL.style.width      = `${inPct  * 100}%`;
    this.elShadeR.style.left       = `${outPct * 100}%`;
    this.elShadeR.style.width      = `${(1 - outPct) * 100}%`;

    // Auto-scroll to playhead if it's out of view
    if (this._dragging === 'playhead') {
      const scrollRect = this.elScroll.getBoundingClientRect();
      const headRect   = this.elPlayhead.getBoundingClientRect();
      if (headRect.left < scrollRect.left || headRect.right > scrollRect.right) {
        this.elPlayhead.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
      }
    }

    this.elCurrent.textContent  = formatTime(cur);
    this.elInLabel.textContent  = `In: ${formatTime(state.trimIn)}`;
    this.elOutLabel.textContent = `Out: ${formatTime(state.trimOut)}`;
    
    if (this.elMarkerInLabel)  this.elMarkerInLabel.textContent  = formatTime(state.trimIn);
    if (this.elMarkerOutLabel) this.elMarkerOutLabel.textContent = formatTime(state.trimOut);

    // Sync play/pause icons
    const playing = state.videoEl && !state.videoEl.paused;
    this.iconPlay.style.display  = playing ? 'none' : 'block';
    this.iconPause.style.display = playing ? 'block' : 'none';

    // Sync mute icon
    const muted = state.videoEl && state.videoEl.muted;
    this.elMute.style.color = muted ? '#f55' : 'var(--text-muted)';
    this.elMute.innerHTML = muted ? 
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2V15H6L11 19V5Z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>` :
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>`;
  }

  // ── Bind all events ──────────────────────────────────────────────────
  _bindEvents() {
    // Playback buttons
    this.elPlay.addEventListener('click', () => this._togglePlay());
    this.elRewind.addEventListener('click', () => {
      if (this.state.videoEl) {
        this.state.videoEl.currentTime = this.state.trimIn;
        this._update();
      }
    });
    this.elMute.addEventListener('click', () => {
      if (this.state.videoEl) {
        this.state.videoEl.muted = !this.state.videoEl.muted;
      }
    });

    // Zoom slider
    this.elZoom.addEventListener('input', () => {
      this.zoomLevel = parseFloat(this.elZoom.value);
      this._renderTicks();
      this._update();
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); this._togglePlay(); }
      if (e.code === 'ArrowLeft')  this._stepFrame(-1);
      if (e.code === 'ArrowRight') this._stepFrame(1);
      if (e.key.toLowerCase() === 'i') {
        this.state.trimIn = this.state.videoEl.currentTime;
        if (this.state.trimIn > this.state.trimOut - 0.1) this.state.trimOut = Math.min(this.state.videoDuration, this.state.trimIn + 0.1);
        this._update();
      }
      if (e.key.toLowerCase() === 'o') {
        this.state.trimOut = this.state.videoEl.currentTime;
        if (this.state.trimOut < this.state.trimIn + 0.1) this.state.trimIn = Math.max(0, this.state.trimOut - 0.1);
        this._update();
      }
    });

    // Track mouse events for drag
    this.elTrack.addEventListener('mousedown', e => this._trackMouseDown(e));
    this.elTrimIn.addEventListener('mousedown',  e => { e.stopPropagation(); this._dragging = 'trim-in';  });
    this.elTrimOut.addEventListener('mousedown', e => { e.stopPropagation(); this._dragging = 'trim-out'; });
    this.elPlayhead.addEventListener('mousedown', e => { e.stopPropagation(); this._dragging = 'playhead'; });

    window.addEventListener('mousemove', e => this._onMouseMove(e));
    window.addEventListener('mouseup',   () => { this._dragging = null; });

    // Video time update
    EventBus.on('video:loaded', () => {
      this.init();
      this._renderTicks();
    });
    EventBus.on('video:timeupdate', () => this._update());
    window.addEventListener('resize', () => this._renderTicks());
  }

  _togglePlay() {
    const v = this.state.videoEl;
    if (!v || !this.state.videoDuration) return;
    if (v.paused) {
      if (v.currentTime >= this.state.trimOut - 0.05) v.currentTime = this.state.trimIn;
      v.play();
    } else {
      v.pause();
    }
    this._update();
  }

  _stepFrame(dir) {
    const v = this.state.videoEl;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(this.state.videoDuration, v.currentTime + dir / (this.state.videoFps || 30)));
    this._update();
  }

  _trackMouseDown(e) {
    this._dragging = 'playhead';
    this._seekToEvent(e);
  }

  _onMouseMove(e) {
    if (!this._dragging || !this.state.videoDuration) return;
    const rect = this.elTrack.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t    = pct * this.state.videoDuration;
    const v    = this.state.videoEl;

    if (this._dragging === 'playhead') {
      if (v) v.currentTime = Math.max(this.state.trimIn, Math.min(this.state.trimOut, t));
    } else if (this._dragging === 'trim-in') {
      this.state.trimIn = Math.max(0, Math.min(t, this.state.trimOut - 0.5));
    } else if (this._dragging === 'trim-out') {
      this.state.trimOut = Math.min(this.state.videoDuration, Math.max(t, this.state.trimIn + 0.5));
    }
    this._update();
  }

  _seekToEvent(e) {
    const rect = this.elTrack.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t    = pct * this.state.videoDuration;
    if (this.state.videoEl) this.state.videoEl.currentTime = t;
    this._update();
  }

  _renderTicks() {
    const dur = this.state.videoDuration;
    if (!dur) return;

    this.elTicks.innerHTML = '';
    const width = this.elInner.clientWidth;
    const pxPerSec = (width / dur);
    
    // Determine interval based on zoom
    let interval = 1; // 1 second
    if (pxPerSec < 2) interval = 60;
    if (pxPerSec < 10) interval = 10;
    if (pxPerSec > 100) interval = 0.5;
    if (pxPerSec > 500) interval = 0.1;

    for (let t = 0; t <= dur; t += interval) {
      const pct = t / dur;
      const tick = document.createElement('div');
      tick.className = 'tl-tick';
      tick.style.left = (pct * 100) + '%';
      
      // Only add labels at certain intervals
      if (t % (interval * 5) === 0 || interval < 1) {
        const label = document.createElement('span');
        label.className = 'tl-tick-label';
        label.textContent = formatTime(t, false);
        tick.appendChild(label);
      }
      
      this.elTicks.appendChild(tick);
    }
  }
}
