/**
 * App — root orchestrator
 * Wires all components together, manages central state.
 */
(async () => {

  // ── Central State ──────────────────────────────────────────────────
  const state = {
    filePath:          null,
    videoEl:           document.getElementById('video-el'),
    videoDuration:     0,
    videoWidth:        0,
    videoHeight:       0,
    videoFps:          30,
    hasAudio:          true,
    cameras:           [],
    selectedCameraId:  null,
    trimIn:            0,
    trimOut:           0,
    presets:           []
  };

  // ── Canvas elements ────────────────────────────────────────────────
  const srcCanvasEl  = document.getElementById('source-canvas');
  const prvCanvasEl  = document.getElementById('preview-canvas');
  const srcWrapper   = document.getElementById('source-wrapper');
  const prvWrapper   = document.getElementById('preview-wrapper');
  const srcEmpty     = document.getElementById('source-empty');
  const prvEmpty     = document.getElementById('preview-empty');

  // ── Canvas renderers ───────────────────────────────────────────────
  const sourceCanvas  = new SourceCanvas(srcCanvasEl, state);
  const previewCanvas = new PreviewCanvas(prvCanvasEl, state);

  // ── UI Components ──────────────────────────────────────────────────
  const timeline      = new Timeline(state);
  const sidebar       = new Sidebar(state);
  const exportModal   = new ExportModal(state);
  const twitchModal   = new TwitchModal(state);

  // ── Canvas sizing ──────────────────────────────────────────────────
  function resizeCanvases() {
    // Source canvas: fill its wrapper
    const srcRect = srcWrapper.getBoundingClientRect();
    if (state.videoWidth && state.videoHeight) {
      const scale = Math.min(srcRect.width / state.videoWidth, srcRect.height / state.videoHeight);
      srcCanvasEl.width  = Math.round(state.videoWidth  * scale);
      srcCanvasEl.height = Math.round(state.videoHeight * scale);
    } else {
      srcCanvasEl.width  = srcRect.width  || 640;
      srcCanvasEl.height = srcRect.height || 360;
    }

    // Preview canvas: always 9:16 inside its wrapper
    const prvRect = prvWrapper.getBoundingClientRect();
    prvCanvasEl.height = Math.round(prvRect.height) || 640;
    prvCanvasEl.width  = Math.round(prvCanvasEl.height * 9 / 16);

    document.getElementById('source-dim').textContent =
      state.videoWidth ? `${state.videoWidth} × ${state.videoHeight}` : '';
  }

  window.addEventListener('resize', resizeCanvases);
  resizeCanvases();

  // Start render loops
  sourceCanvas.start();
  previewCanvas.start();

  // ── Video load ─────────────────────────────────────────────────────
  async function openVideo(path) {
    const result = await window.electronAPI.openVideo(path);

    if (!result || result.error) {
      if (result?.error) alert(`Could not open video: ${result.error}`);
      return;
    }

    const { filePath, duration, width, height, fps, hasAudio } = result;

    state.filePath      = filePath;
    state.videoDuration = duration;
    state.videoWidth    = width;
    state.videoHeight   = height;
    state.videoFps      = fps;
    state.hasAudio      = hasAudio;
    state.trimIn        = 0;
    state.trimOut       = duration;
    state.cameras       = [];
    state.selectedCameraId = null;

    // Attach video to element
    const v = state.videoEl;
    v.src = `file://${filePath.replace(/\\/g, '/')}`;
    v.load();

    await new Promise(resolve => {
      v.addEventListener('loadedmetadata', resolve, { once: true });
    });

    // Toolbar info
    document.getElementById('video-filename').textContent =
      filePath.split(/[\\/]/).pop();
    document.getElementById('video-meta').textContent =
      `${width}×${height}  •  ${fps.toFixed(2)} fps  •  ${formatTime(duration)}`;
    document.getElementById('btn-export').disabled = false;

    // Wire time update
    v.addEventListener('timeupdate', () => EventBus.emit('video:timeupdate'));
    v.addEventListener('ended', () => { v.pause(); EventBus.emit('video:timeupdate'); });

    // Pause at start
    v.pause();
    v.currentTime = 0;

    resizeCanvases();
    srcEmpty.classList.add('hidden');
    prvEmpty.classList.add('hidden');

    EventBus.emit('video:loaded', state);

    // Auto-add first camera covering full video
    sidebar.addCamera();
  }

  // Open button
  document.getElementById('btn-open').addEventListener('click', () => openVideo());

  // Keyboard shortcut Ctrl+O
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'o') { e.preventDefault(); openVideo(); }
  });

  // Listen for Twitch downloads
  EventBus.on('twitch:download-complete', (filePath) => {
    openVideo(filePath);
  });

  // ── App version ────────────────────────────────────────────────────
  try {
    const ver = await window.electronAPI.getVersion();
    document.getElementById('app-version').textContent = `v${ver}`;
  } catch (_) {}

})();
