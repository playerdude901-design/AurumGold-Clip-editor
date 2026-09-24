/* Move the existing controls, preserving their IDs and event listeners. */
class EditorLayout {
  constructor() {
    const $ = s => document.querySelector(s);
    $('.workspace').classList.add('top-section');
    $('#timeline-area').classList.add('timeline-panel');
    $('#tl-resizer').classList.add('timeline-resize-handle');
    const right = document.createElement('aside');
    right.className = 'editor-inspector';
    right.innerHTML = '<nav class="inspector-tabs" role="tablist"></nav><div class="inspector-body"></div>';
    $('.workspace').append(right);
    this.panels = {};
    for (const [id, label] of [['cameras','Cámaras'], ['effects','Efectos'], ['export','Exportar'], ['subtitles','Subtítulos']]) {
      const button = document.createElement('button');
      button.textContent = label; button.dataset.i18n = 'tab_' + id;
      button.setAttribute('role', 'tab'); button.id = 'tab-' + id;
      button.setAttribute('aria-controls', 'panel-' + id);
      button.onclick = () => this.select(id);
      right.querySelector('nav').append(button);
      const panel = document.createElement('section');
      panel.id = 'panel-' + id; panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      right.querySelector('.inspector-body').append(panel);
      this.panels[id] = panel;
    }
    this.panels.cameras.append($('#sidebar'));
    this.panels.effects.innerHTML = '<p class="panel-empty" data-i18n="coming_soon">Próximamente</p>';
    this.panels.export.append($('#export-overlay'));
    $('#export-overlay').classList.add('docked-export');
    $('#export-overlay').style.display = 'flex';
    this.panels.subtitles.append($('.toolbar-transcribe-box'));
    const status = document.createElement('p'); status.id = 'transcribe-status'; status.setAttribute('role','status');
    this.panels.subtitles.append(status);
    this.panels.subtitles.append($('.sub-col-styles'));
    $('.toolbar-right').append($('.lang-switcher'));
    const menus = document.createElement('nav'); menus.className = 'global-menus';
    $('.app-logo').after(menus);
    const click = id => document.getElementById(id).click();
    this.actions = {
      open: () => click('btn-open'), audio: () => click('tl-btn-add-audio-file'),
      export: () => { this.select('export'); click('btn-export'); },
      quit: () => window.electronAPI.quitApp(), undo: () => EventBus.emit('history:undo'),
      redo: () => EventBus.emit('history:redo'), preferences: () => this.preferences.showModal(),
      waveform: () => click('tl-btn-toggle-waveform'),
      subtitles: () => EventBus.emit('subtitles:toggle'), fullscreen: () => this.fullscreen(document.documentElement)
    };
    for (const [key, label, entries] of [
      ['file','Archivo', [['open','Abrir video'],['audio','Importar audio'],['export','Exportar clip'],['quit','Salir']]],
      ['edit','Edición', [['undo','Deshacer'],['redo','Rehacer'],['preferences','Preferencias']]],
      ['view','Vista', [['waveform','Mostrar/ocultar waveforms'],['subtitles','Mostrar/ocultar subtítulos'],['fullscreen','Pantalla completa']]]
    ]) {
      const menu = document.createElement('details'); menu.className = 'global-menu';
      const summary = document.createElement('summary'); summary.dataset.i18n = 'menu_' + key; summary.textContent = label + ' ▾';
      menu.append(summary);
      const list = document.createElement('div'); list.className = 'menu-items';
      entries.forEach(([action, text]) => {
        const b = document.createElement('button'); b.textContent = text; b.dataset.i18n = 'action_' + action;
        b.onclick = () => { menu.open = false; this.actions[action](); }; list.append(b);
      });
      if (key === 'file') list.append($('#btn-open'), $('#btn-twitch'), $('#btn-kick'));
      menu.append(list); menus.append(menu);
      menu.addEventListener('toggle', () => { if (menu.open) menus.querySelectorAll('details').forEach(m => { if (m !== menu) m.open = false; }); });
    }
    document.addEventListener('click', e => { if (!menus.contains(e.target)) menus.querySelectorAll('details').forEach(m => m.open = false); });
    this.preferences = document.createElement('dialog'); this.preferences.className = 'preferences-dialog';
    this.preferences.innerHTML = '<h2 data-i18n="action_preferences">Preferencias</h2><button class="dialog-close" aria-label="Close">✕</button>';
    this.preferences.append($('#theme-switcher'));
    this.preferences.querySelector('button').onclick = () => this.preferences.close();
    document.body.append(this.preferences);
    for (const [text, title, action] of [['🔔','Notificaciones',() => { this.select('subtitles'); status.textContent ||= 'Sin notificaciones pendientes.'; }],['⚙','Preferencias',this.actions.preferences]]) {
      const b = document.createElement('button'); b.textContent = text; b.title = title; b.onclick = action;
      $('.toolbar-right').append(b);
    }
    $('.toolbar-sep')?.remove();
    this.select('cameras');
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') menus.querySelectorAll('details').forEach(m => m.open = false);
      if (e.ctrlKey && e.key.toLowerCase() === 'e') { e.preventDefault(); this.actions.export(); }
    });
    EventBus.on('layout:tab', id => this.select(id));
  }
  select(id) {
    Object.entries(this.panels).forEach(([key, panel]) => {
      panel.hidden = key !== id;
      document.getElementById('tab-' + key).setAttribute('aria-selected', String(key === id));
    });
    if (id === 'export') EventBus.emit('export:refresh');
  }
  async fullscreen(element) {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await element.requestFullscreen(); }
    catch (e) { console.warn('Fullscreen:', e.message); }
  }
}
window.editorLayout = new EditorLayout();
