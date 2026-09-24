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
    presets:           [],
    // Subtitles & Layers state
    subtitles:         [],
    selectedSubtitleId: null,
    subtitlesVisible:  true,
    subtitlesLocked:   false,
    subtitleStyle: {
      animation: 'Pop In',
      verticalPosition: 'bottom',
      horizontalPosition: 'center',
      fontName: 'Montserrat',
      fontSize: 64,
      textColor: '#FFFFFF',
      outlineColor: '#000000',
      outlineWidth: 4,
      shadowColor: '#000000',
      shadowWidth: 2,
      highlightEnabled: true,
      highlightColor: '#FFD700',
      bgBox: false,
      bgColor: '#000000',
      bgOpacity: 0.6,
      marginV: 120,
      marginH: 60,
      bold: true
    }
  };

  // ── Persistence ────────────────────────────────────────────────────
  let restoringSession = false;
  async function autoSave() {
    if (restoringSession) return;
    if (!state.filePath) return;
    const session = {
      tracks: timeline.trackManager.serialize(),
      filePath: state.filePath,
      trimIn:   state.trimIn,
      trimOut:  state.trimOut,
      cameras:  state.cameras.map(c => ({ ...c })),
      subtitles: state.subtitles ? state.subtitles.map(s => ({ ...s })) : [],
      subtitleStyle: state.subtitleStyle ? { ...state.subtitleStyle } : undefined
    };
    await window.electronAPI.saveSession(session);
  }

  EventBus.on('project:changed',   () => autoSave());
  EventBus.on('video:loaded',      () => autoSave());
  EventBus.on('cameras:changed',   () => EventBus.emit('project:changed'));

  // We don't save on every timeupdate, but maybe on trim change
  // For now, components will emit project:changed when relevant.

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
  const timeline       = new Timeline(state);
  const sidebar        = new Sidebar(state);
  const subtitleEditor = new SubtitleEditor(state);
  const exportModal    = new ExportModal(state, subtitleEditor);
  const twitchModal    = new TwitchModal(state);
  const featuresModal  = new FeaturesModal();
  const monitors = new Monitors(state, timeline);
  const history = new EditorHistory(state, timeline, sidebar);
  state.timeline = timeline;

  // ── i18n Initialization ─────────────────────────────────────────────
  const btnEn = document.getElementById('btn-lang-en');
  const btnEs = document.getElementById('btn-lang-es');

  function updateLangUI(lang) {
    btnEn.classList.toggle('active', lang === 'en');
    btnEs.classList.toggle('active', lang === 'es');
  }

  btnEn.addEventListener('click', () => { window.i18n.setLocale('en'); updateLangUI('en'); });
  btnEs.addEventListener('click', () => { window.i18n.setLocale('es'); updateLangUI('es'); });

  // Load saved settings
  const settings = await window.electronAPI.getSettings();
  const lang = settings.language || 'en';
  await window.i18n.setLocale(lang);
  updateLangUI(lang);

  // ── Theme Initialization ─────────────────────────────────────────────
  const themeManager = new ThemeManager();
  await themeManager.init(settings.theme);

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
    prvCanvasEl.height = Math.max(1, Math.round(Math.min(prvRect.height, prvRect.width * 16 / 9)));
    prvCanvasEl.width  = Math.round(prvCanvasEl.height * 9 / 16);

    document.getElementById('source-dim').textContent =
      state.videoWidth ? `${state.videoWidth} × ${state.videoHeight}` : '';
  }

  window.addEventListener('resize', resizeCanvases);
  const canvasObserver = new ResizeObserver(resizeCanvases);
  canvasObserver.observe(srcWrapper); canvasObserver.observe(prvWrapper);
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
    state.subtitles = [];
    state.thumbnail = null;
    state.selectedCameraId = null;

    document.getElementById('video-filename').removeAttribute('data-i18n');
    // Attach video to element
    const v = state.videoEl;
    v.src = encodeURI(`file:///${filePath.replace(/\\/g, '/')}`).replace(/#/g, '%23');
    await new Promise((resolve,reject)=>{
      const done=()=>{cleanup();resolve();};
      const fail=()=>{cleanup();reject(new Error('No se puede reproducir este video.'));};
      const timer=setTimeout(fail,20000);
      const cleanup=()=>{clearTimeout(timer);v.removeEventListener('loadedmetadata',done);v.removeEventListener('error',fail);};
      v.addEventListener('loadedmetadata',done);v.addEventListener('error',fail);v.load();
    });

    // Toolbar info
    document.getElementById('video-filename').textContent =
      filePath.split(/[\\/]/).pop();
    document.getElementById('video-meta').textContent =
      `${width}×${height}  •  ${fps.toFixed(2)} fps  •  ${formatTime(duration)}`;
    document.getElementById('btn-export').disabled = false;

    const btnTranscribe = document.getElementById('btn-transcribe-audio');
    const btnSubStyles = document.getElementById('btn-open-sub-editor');
    if (btnTranscribe) btnTranscribe.disabled = false;
    if (btnSubStyles) btnSubStyles.disabled = false;

    // Wire time update
    v.ontimeupdate = () => EventBus.emit('video:timeupdate');
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
    const thumb = () => { if(v.readyState<2)return; const c=document.createElement('canvas'); c.width=96;c.height=54;c.getContext('2d').drawImage(v,0,0,96,54);state.thumbnail=c.toDataURL();timeline.engine.render(); };
    if(v.readyState>=2)thumb();else v.addEventListener('loadeddata',thumb,{once:true});
    history.reset();
  }

  // Open button
  document.getElementById('btn-open').addEventListener('click', () => openVideo().catch(e => alert(e.message)));

  // Keyboard shortcut Ctrl+O
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'o') { e.preventDefault(); openVideo(); }
  });

  // Listen for Twitch downloads
  EventBus.on('twitch:download-complete', (filePath) => {
    openVideo(filePath).catch(e => alert(e.message));
  });

  const transcription = new SubtitleTranscription(state, subtitleEditor);
  const btnSubStyles = document.getElementById('btn-open-sub-editor');

  function openSubtitleCustomizer() {
    subtitleEditor.open(
      state.subtitles,
      ({ blocks, styleConfig }) => {
        state.subtitles = blocks;
        state.subtitleStyle = styleConfig;
        EventBus.emit('subtitles:changed');
        EventBus.emit('project:changed');
      },
      () => {}
    );
  }

  if (btnSubStyles) {
    btnSubStyles.addEventListener('click', () => openSubtitleCustomizer());
  }

  EventBus.on('subtitle:edit-requested', () => openSubtitleCustomizer());

  // ── App version ────────────────────────────────────────────────────
  try {
    const ver = await window.electronAPI.getVersion();
    document.getElementById('app-version').textContent = `v${ver}`; 
  } catch (_) {}

  // ── Session Restore ────────────────────────────────────────────────
  const lastSession = await window.electronAPI.getSession();
  if (lastSession && lastSession.filePath) {
    try {
      restoringSession = true;
      await openVideo(lastSession.filePath);
      state.trimIn  = lastSession.trimIn  || 0;
      state.trimOut = lastSession.trimOut || state.videoDuration;
      state.cameras = lastSession.cameras || [];
      if (lastSession.subtitles) state.subtitles = lastSession.subtitles;
      if (lastSession.subtitleStyle) state.subtitleStyle = lastSession.subtitleStyle;
      
      // Update UI
      if (state.cameras.length > 0) {
        state.selectedCameraId = state.cameras[0].id;
      }
      if (lastSession.tracks) timeline.trackManager.restore(lastSession.tracks);
      sidebar.renderCameras();
      EventBus.emit('subtitles:changed');
      EventBus.emit('video:timeupdate'); // Refresh timeline UI
      timeline.engine.render();
      history.reset();
      EventBus.emit('project:restored');
    } catch (e) {
      console.warn('Failed to restore session:', e);
      window.electronAPI.clearSession();
    } finally { restoringSession = false; }
  }

  // ── Show Features Announcement ─────────────────────────────────────
  // Release announcements remain accessible through the existing component.

})();
