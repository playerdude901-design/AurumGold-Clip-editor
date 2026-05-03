/**
 * Sidebar component — camera list, per-camera controls, presets
 */
class Sidebar {
  constructor(state) {
    this.state = state;

    this.elCameraList  = document.getElementById('camera-list');
    this.elPresetList  = document.getElementById('preset-list');
    this.elAddCamera   = document.getElementById('btn-add-camera');
    this.elDeleteCamera= document.getElementById('btn-delete-camera');
    this.elLockAR      = document.getElementById('btn-lock-ar');
    this.elARPresets   = document.getElementById('ar-presets');
    this.elSavePreset  = document.getElementById('btn-save-preset');
    this.elNamingOverlay = document.getElementById('naming-overlay');
    this.elNamingInput   = document.getElementById('preset-name-input');
    this.elNamingSave    = document.getElementById('btn-naming-save');
    this.elNamingCancel  = document.getElementById('btn-naming-cancel');

    this.CAM_COLORS = [
      { hex: '#c9a84c', key: 'camera_1' },
      { hex: '#4cc9c9', key: 'camera_2' },
      { hex: '#c94c7c', key: 'camera_3' },
      { hex: '#7c4cc9', key: 'camera_4' }
    ];

    this._bindEvents();
    EventBus.on('cameras:changed',   () => this.renderCameras());
    EventBus.on('cameras:committed', () => this.renderCameras());
    EventBus.on('camera:selected',   () => this.renderCameras());
    EventBus.on('video:loaded',      () => this._onVideoLoaded());
  }

  _onVideoLoaded() {
    this.elAddCamera.disabled  = false;
    this.elSavePreset.disabled = false;
    this.loadPresets();
  }

  // ── Camera management ────────────────────────────────────────────────
  addCamera() {
    const idx   = this.state.cameras.length;
    if (idx >= 4) return;
    const info  = this.CAM_COLORS[idx];
    const vw    = this.state.videoWidth  || 1920;
    const vh    = this.state.videoHeight || 1080;
    const w     = Math.round(vw * 0.5);
    const h     = Math.round(vh * 0.5);
    const cam = {
      id:          `cam-${Math.random().toString(36).substr(2, 9)}`,
      x:           Math.round((vw - w) / 2),
      y:           Math.round((vh - h) / 2),
      w, h,
      px: 0, py: 0, pw: 1080, ph: 1920, // Default full-frame (will be scaled)
      lockAR:      true, // Default to true as per request
      aspectRatio: w / h,
      weight:      1,
      color:       info.hex,
      label:       window.i18n.t(info.key),
      shape:       'rect', // New property
      active:      true
    };
    this.state.cameras.push(cam);
    this.state.selectedCameraId = cam.id;
    EventBus.emit('cameras:changed', this.state.cameras);
    EventBus.emit('camera:selected', cam.id);
  }

  removeCamera(id) {
    this.state.cameras = this.state.cameras.filter(c => c.id !== id);
    if (this.state.selectedCameraId === id) {
      this.state.selectedCameraId = this.state.cameras[0]?.id || null;
    }
    EventBus.emit('cameras:changed', this.state.cameras);
    EventBus.emit('camera:selected', this.state.selectedCameraId);
    this.renderCameras();
  }

  moveCamera(id, dir) {
    const idx = this.state.cameras.findIndex(c => c.id === id);
    if (idx === -1) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= this.state.cameras.length) return;
    const [cam] = this.state.cameras.splice(idx, 1);
    this.state.cameras.splice(newIdx, 0, cam);
    EventBus.emit('cameras:changed', this.state.cameras);
    this.renderCameras();
  }

  // ── Render cameras ───────────────────────────────────────────────────
  renderCameras() {
    this.elCameraList.innerHTML = '';
    this.elAddCamera.disabled    = !this.state.videoWidth || this.state.cameras.length >= 4;
    this.elDeleteCamera.disabled = !this.state.selectedCameraId;
    this.elLockAR.disabled       = !this.state.selectedCameraId;
    this.elARPresets.disabled    = !this.state.selectedCameraId;
    this.elARPresets.value       = ''; // Reset select

    const selCam = this.state.cameras.find(c => c.id === this.state.selectedCameraId);
    if (selCam) {
      this.elLockAR.classList.toggle('active', selCam.lockAR);
      this.elLockAR.title = selCam.lockAR ? 'Unlock Aspect Ratio' : 'Lock Aspect Ratio';
    } else {
      this.elLockAR.classList.remove('active');
    }

    this.state.cameras.forEach((cam, idx) => {
      const isSelected = cam.id === this.state.selectedCameraId;
      const card = document.createElement('div');
      card.className = `camera-card${isSelected ? ' selected' : ''}`;
      card.draggable = true;
      card.style.setProperty('--cam-color', cam.color);
      card.innerHTML = `
        <div class="cam-header">
          <div class="cam-dot"></div>
          <span class="cam-label">${cam.label}</span>
        </div>
        <div class="cam-coords">
          <div class="cam-input-group">
            <span class="cam-input-label">X</span>
            <input class="cam-input" data-id="${cam.id}" data-field="x" type="number" value="${Math.round(cam.x)}" />
          </div>
          <div class="cam-input-group">
            <span class="cam-input-label">Y</span>
            <input class="cam-input" data-id="${cam.id}" data-field="y" type="number" value="${Math.round(cam.y)}" />
          </div>
          <div class="cam-input-group">
            <span class="cam-input-label">W</span>
            <input class="cam-input" data-id="${cam.id}" data-field="w" type="number" value="${Math.round(cam.w)}" />
          </div>
          <div class="cam-input-group">
            <span class="cam-input-label">H</span>
            <input class="cam-input" data-id="${cam.id}" data-field="h" type="number" value="${Math.round(cam.h)}" />
          </div>
        </div>
        <div class="cam-lock-row">
          <span class="cam-lock-label">Ratio</span>
          <div class="cam-presets">
            <button class="btn-preset" data-id="${cam.id}" data-val="0.5625">9:16</button>
            <button class="btn-preset" data-id="${cam.id}" data-val="1.7777">16:9</button>
            <button class="btn-preset" data-id="${cam.id}" data-val="1">1:1</button>
            <button class="btn-preset" data-id="${cam.id}" data-val="0.8">4:5</button>
          </div>
        </div>
      `;

      // Drag and drop events
      card.addEventListener('dragstart', e => {
        this._isDragging = true;
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', idx);
        e.dataTransfer.effectAllowed = 'move';
      });

      card.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', e => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIdx = idx;
        if (fromIdx === toIdx) return;
        
        const [movedCam] = this.state.cameras.splice(fromIdx, 1);
        this.state.cameras.splice(toIdx, 0, movedCam);
        EventBus.emit('cameras:changed', this.state.cameras);
        this.renderCameras();
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        // Use timeout so click event (which fires after dragend) sees the flag
        setTimeout(() => { this._isDragging = false; }, 0);
      });

      // Select/deselect on click (but not when drag just ended)
      card.addEventListener('click', () => {
        if (this._isDragging) return;
        if (this.state.selectedCameraId === cam.id) {
          this.state.selectedCameraId = null;
        } else {
          this.state.selectedCameraId = cam.id;
        }
        EventBus.emit('camera:selected', this.state.selectedCameraId);
        this.renderCameras();
      });


      // Numeric inputs
      card.querySelectorAll('.cam-input').forEach(input => {
        input.addEventListener('change', e => {
          e.stopPropagation();
          const id    = input.dataset.id;
          const field = input.dataset.field;
          const c     = this.state.cameras.find(c => c.id === id);
          if (!c) return;
          let val = input.value;
          const vw  = this.state.videoWidth, vh = this.state.videoHeight;

          if (field === 'ar') {
            let ratio = 1;
            if (val.includes(':')) {
              const parts = val.split(':').map(Number);
              if (parts.length === 2 && parts[1] !== 0) ratio = parts[0] / parts[1];
            } else {
              ratio = parseFloat(val) || 1;
            }
            c.aspectRatio = ratio;
            if (c.lockAR) {
              c.h = Math.max(40, Math.min(vh - c.y, c.w / c.aspectRatio));
              c.w = c.h * c.aspectRatio;
            }
          } else {
            const num = parseFloat(val) || 0;
            if (field === 'x') c.x = Math.max(0, Math.min(num, vw - c.w));
            if (field === 'y') c.y = Math.max(0, Math.min(num, vh - c.h));
            if (field === 'w') { c.w = Math.max(40, Math.min(num, vw - c.x)); if (c.lockAR) c.h = c.w / c.aspectRatio; }
            if (field === 'h') { c.h = Math.max(40, Math.min(num, vh - c.y)); if (c.lockAR) c.w = c.h * c.aspectRatio; }
          }
          EventBus.emit('cameras:changed', this.state.cameras);
          if (field === 'ar') this.renderCameras(); // Refresh labels
        });
        input.addEventListener('click', e => e.stopPropagation());
      });



      // Preset buttons
      card.querySelectorAll('.btn-preset').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const ratio = parseFloat(btn.dataset.val);
          cam.aspectRatio = ratio;
          if (cam.lockAR) {
            cam.h = Math.max(40, Math.min(this.state.videoHeight - cam.y, cam.w / cam.aspectRatio));
            cam.w = cam.h * cam.aspectRatio;
          }
          EventBus.emit('cameras:changed', this.state.cameras);
          this.renderCameras();
        });
      });



      this.elCameraList.appendChild(card);
    });
  }

  // ── Presets ──────────────────────────────────────────────────────────
  async loadPresets() {
    let presets = await window.electronAPI.listPresets();
    
    // Add default presets if they don't exist
    const defaultPresets = [
      {
        name: "Default: Overlay 16:9",
        isDefault: true,
        cameras: [
          { label: "Cam 2", x: 656, y: 0, w: 608, h: 1080, aspectRatio: 0.5625, lockAR: true, color: "#4cc9c9", px: 0, py: 0, pw: 1080, ph: 1920 },
          { label: "Cam 1", x: 0, y: 0, w: 1920, h: 1080, aspectRatio: 1.7777, lockAR: true, color: "#c9a84c", px: 0, py: 420, pw: 1080, ph: 607 }
        ]
      },
      {
        name: "Default: Split Top/Bottom",
        isDefault: true,
        cameras: [
          { label: "Cam 2", x: 656, y: 0, w: 608, h: 1080, aspectRatio: 0.5625, lockAR: true, color: "#4cc9c9", px: 0, py: 960, pw: 1080, ph: 960 },
          { label: "Cam 1", x: 0, y: 0, w: 1920, h: 1080, aspectRatio: 1.7777, lockAR: true, color: "#c9a84c", px: 0, py: 0, pw: 1080, ph: 960 }
        ]
      }
    ];

    this.state.presets = [...defaultPresets, ...presets];
    this.renderPresets();
  }

  renderPresets() {
    this.elPresetList.innerHTML = '';
    if (!this.state.presets.length) {
      this.elPresetList.innerHTML = '<div class="empty-hint">No presets saved yet</div>';
      return;
    }
    this.state.presets.forEach(preset => {
      const card = document.createElement('div');
      card.className = 'preset-card';
      card.innerHTML = `
        <span class="preset-name">${preset.name}</span>
        <span class="preset-cams">${preset.cameras.length} cam${preset.cameras.length !== 1 ? 's' : ''}</span>
        <button class="preset-del" data-name="${preset.name}" title="Delete preset">✕</button>
      `;
      card.addEventListener('click', () => this._loadPreset(preset));
      card.querySelector('.preset-del').addEventListener('click', e => {
        e.stopPropagation();
        this._deletePreset(preset.name);
      });
      this.elPresetList.appendChild(card);
    });
  }

  _savePreset() {
    if (!this.state.cameras.length) return;
    this.elNamingInput.value = '';
    this.elNamingOverlay.style.display = 'flex';
    this.elNamingInput.focus();
  }

  async _confirmSavePreset() {
    const name = this.elNamingInput.value.trim();
    if (!name) return;
    this.elNamingOverlay.style.display = 'none';
    const cameras = this.state.cameras.map(({ id, x, y, w, h, px, py, pw, ph, lockAR, aspectRatio, color, label }) =>
      ({ id, x, y, w, h, px, py, pw, ph, lockAR, aspectRatio, color, label }));
    const presets = await window.electronAPI.savePreset({ name, cameras });
    this.state.presets = presets;
    this.loadPresets(); // Reload to include defaults
  }

  _loadPreset(preset) {
    const vw = this.state.videoWidth  || 1920;
    const vh = this.state.videoHeight || 1080;
    this.state.cameras = preset.cameras.map((c, i) => ({
      ...c,
      id:     `cam-${Date.now()}-${i}`,
      active: true,
      x: Math.min(c.x, vw - 40),
      y: Math.min(c.y, vh - 40),
      w: Math.min(c.w, vw),
      h: Math.min(c.h, vh),
      px: c.px ?? 0,
      py: c.py ?? 0,
      pw: c.pw ?? 1080,
      ph: c.ph ?? 1920,
      shape: c.shape ?? 'rect'
    }));
    this.state.selectedCameraId = this.state.cameras[this.state.cameras.length - 1]?.id || null;
    EventBus.emit('cameras:changed', this.state.cameras);
    EventBus.emit('camera:selected', this.state.selectedCameraId);
  }

  async _deletePreset(name) {
    const presets = await window.electronAPI.deletePreset(name);
    this.state.presets = presets;
    this.renderPresets();
  }

  _bindEvents() {
    this.elAddCamera.addEventListener('click', () => this.addCamera());
    this.elDeleteCamera.addEventListener('click', () => {
      if (this.state.selectedCameraId) {
        this.removeCamera(this.state.selectedCameraId);
      }
    });
    this.elLockAR.addEventListener('click', () => {
      const c = this.state.cameras.find(c => c.id === this.state.selectedCameraId);
      if (c) {
        c.lockAR = !c.lockAR;
        if (c.lockAR) c.aspectRatio = c.w / c.h;
        EventBus.emit('cameras:changed', this.state.cameras);
        this.renderCameras();
      }
    });
    this.elARPresets.addEventListener('change', () => {
      const c = this.state.cameras.find(c => c.id === this.state.selectedCameraId);
      if (c && this.elARPresets.value) {
        if (this.elARPresets.value === 'circle') {
          c.shape = 'circle';
          // If locked, circle should be 1:1
          if (c.lockAR) {
            c.aspectRatio = 1;
            const vh = this.state.videoHeight || 1080;
            c.h = Math.max(40, Math.min(vh - c.y, c.w / c.aspectRatio));
            c.w = c.h * c.aspectRatio;
          }
        } else {
          c.shape = 'rect';
          const ratio = parseFloat(this.elARPresets.value);
          c.aspectRatio = ratio;
          // If locked, we should apply the ratio to dimensions
          if (c.lockAR) {
            const vh = this.state.videoHeight || 1080;
            c.h = Math.max(40, Math.min(vh - c.y, c.w / c.aspectRatio));
            c.w = c.h * c.aspectRatio;
          }
        }
        EventBus.emit('cameras:changed', this.state.cameras);
        this.renderCameras();
      }
    });
    this.elSavePreset.addEventListener('click', () => this._savePreset());
    
    this.elNamingSave.addEventListener('click', () => this._confirmSavePreset());
    this.elNamingCancel.addEventListener('click', () => this.elNamingOverlay.style.display = 'none');
    this.elNamingInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') this._confirmSavePreset();
      if (e.key === 'Escape') this.elNamingOverlay.style.display = 'none';
    });
  }
}
