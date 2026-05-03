/**
 * SourceCanvas — Canvas A
 * Renders the source video + draggable/resizable camera crop boxes.
 * All camera coords are stored in VIDEO-pixel space.
 */
class SourceCanvas {
  constructor(canvasEl, state) {
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d');
    this.state  = state;

    this.dragging  = null; // { camId, offsetX, offsetY }
    this.resizing  = null; // { camId, handle, startX, startY, origCam }
    this.hoveredId = null;

    this._raf = null;
    this._bindEvents();
  }

  // ── Scale helpers ────────────────────────────────────────────────────
  get scaleX() { return this.state.videoWidth  ? this.canvas.width  / this.state.videoWidth  : 1; }
  get scaleY() { return this.state.videoHeight ? this.canvas.height / this.state.videoHeight : 1; }

  toVideoCoords(canvasX, canvasY) {
    return { x: canvasX / this.scaleX, y: canvasY / this.scaleY };
  }

  // ── Render loop ──────────────────────────────────────────────────────
  start() {
    const loop = () => {
      this._draw();
      this._raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  resize(w, h) {
    this.canvas.width  = w;
    this.canvas.height = h;
  }

  _draw() {
    const { ctx, canvas, state } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!state.videoEl || !state.videoWidth) return;

    // Draw video frame
    ctx.drawImage(state.videoEl, 0, 0, canvas.width, canvas.height);

    // Draw cameras
    state.cameras.forEach(cam => {
      const x = cam.x * this.scaleX;
      const y = cam.y * this.scaleY;
      const w = cam.w * this.scaleX;
      const h = cam.h * this.scaleY;
      const isSelected = cam.id === state.selectedCameraId;
      const isHovered  = cam.id === this.hoveredId;

      // Dark overlay on unselected cameras
      if (!isSelected && state.cameras.length > 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x, y, w, h);
      }

      // Border
      ctx.strokeStyle = cam.color;
      ctx.lineWidth   = isSelected ? 2.5 : 1.5;
      ctx.globalAlpha = isSelected || isHovered ? 1 : 0.6;
      
      if (cam.shape === 'circle') {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(x, y, w, h);
      }

      // Corner label
      ctx.globalAlpha = 1;
      ctx.fillStyle   = cam.color;
      ctx.font        = 'bold 11px Inter, sans-serif';
      ctx.fillText(cam.label, x + 6, y + 15);

      // Handles (only for selected)
      if (isSelected) this._drawHandles(x, y, w, h, cam.color);
    });

    ctx.globalAlpha = 1;

    // Snap guides
    this._drawSnapGuides();
  }

  _drawHandles(x, y, w, h, color) {
    const { ctx } = this;
    const hs = 7; // half-size
    const positions = this._getHandlePositions(x, y, w, h);
    positions.forEach(pos => {
      ctx.fillStyle   = '#0d0d0f';
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5;
      ctx.fillRect(pos.cx - hs, pos.cy - hs, hs*2, hs*2);
      ctx.strokeRect(pos.cx - hs, pos.cy - hs, hs*2, hs*2);
    });
  }

  _getHandlePositions(x, y, w, h) {
    return [
      { type: 'TL', cx: x,       cy: y       },
      { type: 'T',  cx: x + w/2, cy: y       },
      { type: 'TR', cx: x + w,   cy: y       },
      { type: 'R',  cx: x + w,   cy: y + h/2 },
      { type: 'BR', cx: x + w,   cy: y + h   },
      { type: 'B',  cx: x + w/2, cy: y + h   },
      { type: 'BL', cx: x,       cy: y + h   },
      { type: 'L',  cx: x,       cy: y + h/2 }
    ];
  }

  _drawSnapGuides() {
    if (!this.dragging && !this.resizing) return;
    const { ctx, canvas, state } = this;
    const cw = canvas.width, ch = canvas.height;
    ctx.strokeStyle = 'rgba(201,168,76,0.5)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);

    const cam = state.cameras.find(c => c.id === (this.dragging?.camId || this.resizing?.camId));
    if (!cam) { ctx.setLineDash([]); return; }

    const cx = (cam.x + cam.w / 2) * this.scaleX;
    const cy = (cam.y + cam.h / 2) * this.scaleY;
    const SNAP = 8;

    if (Math.abs(cx - cw / 2) < SNAP) {
      ctx.beginPath(); ctx.moveTo(cw/2, 0); ctx.lineTo(cw/2, ch); ctx.stroke();
    }
    if (Math.abs(cy - ch / 2) < SNAP) {
      ctx.beginPath(); ctx.moveTo(0, ch/2); ctx.lineTo(cw, ch/2); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // ── Mouse events ─────────────────────────────────────────────────────
  _bindEvents() {
    this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
    window.addEventListener('mousemove', e => this._onMouseMove(e));
    window.addEventListener('mouseup',   e => this._onMouseUp(e));
    this.canvas.addEventListener('mousemove', e => this._updateHover(e));
    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredId = null;
      this.canvas.style.cursor = 'default';
    });
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (this.canvas.height / rect.height)
    };
  }

  _updateHover(e) {
    const pos = this._getCanvasPos(e);
    const vc  = this.toVideoCoords(pos.x, pos.y);
    const selCam = this.state.cameras.find(c => c.id === this.state.selectedCameraId);

    if (selCam) {
      const hx = selCam.x * this.scaleX, hy = selCam.y * this.scaleY;
      const hw = selCam.w * this.scaleX, hh = selCam.h * this.scaleY;
      const handle = this._hitHandle(pos.x, pos.y, hx, hy, hw, hh);
      if (handle) {
        this.canvas.style.cursor = this._handleCursor(handle);
        return;
      }
    }

    const cam = this._hitCamera(vc.x, vc.y);
    this.hoveredId = cam ? cam.id : null;
    this.canvas.style.cursor = cam ? 'move' : 'default';
  }

  _onMouseDown(e) {
    if (!this.state.videoWidth) return;
    const pos = this._getCanvasPos(e);
    const vc  = this.toVideoCoords(pos.x, pos.y);

    // Check handle on selected camera first
    const selCam = this.state.cameras.find(c => c.id === this.state.selectedCameraId);
    if (selCam) {
      const hx = selCam.x * this.scaleX, hy = selCam.y * this.scaleY;
      const hw = selCam.w * this.scaleX, hh = selCam.h * this.scaleY;
      const handle = this._hitHandle(pos.x, pos.y, hx, hy, hw, hh);
      if (handle) {
        this.resizing = {
          camId: selCam.id, handle,
          startX: vc.x, startY: vc.y,
          origCam: { ...selCam }
        };
        return;
      }
    }

    // Check camera interior
    const cam = this._hitCamera(vc.x, vc.y);
    if (cam) {
      this.state.selectedCameraId = cam.id;
      EventBus.emit('camera:selected', cam.id);
      this.dragging = { camId: cam.id, offsetX: vc.x - cam.x, offsetY: vc.y - cam.y };
    } else {
      this.state.selectedCameraId = null;
      EventBus.emit('camera:selected', null);
    }
  }

  _onMouseMove(e) {
    if (!this.dragging && !this.resizing) return;
    const pos = this._getCanvasPos(e);
    const vc  = this.toVideoCoords(pos.x, pos.y);
    const vw  = this.state.videoWidth, vh = this.state.videoHeight;

    if (this.dragging) {
      const cam = this.state.cameras.find(c => c.id === this.dragging.camId);
      if (!cam) return;
      cam.x = Math.max(0, Math.min(vw - cam.w, vc.x - this.dragging.offsetX));
      cam.y = Math.max(0, Math.min(vh - cam.h, vc.y - this.dragging.offsetY));
      EventBus.emit('cameras:changed', this.state.cameras);
    }

    if (this.resizing) {
      const cam  = this.state.cameras.find(c => c.id === this.resizing.camId);
      if (!cam) return;
      const orig = this.resizing.origCam;
      const dx   = vc.x - this.resizing.startX;
      const dy   = vc.y - this.resizing.startY;
      this._applyResize(cam, orig, this.resizing.handle, dx, dy, vw, vh);
      EventBus.emit('cameras:changed', this.state.cameras);
    }
  }

  _onMouseUp() {
    this.dragging = null;
    this.resizing = null;
    EventBus.emit('cameras:committed', this.state.cameras);
  }

  // ── Hit testing ──────────────────────────────────────────────────────
  _hitHandle(mx, my, hx, hy, hw, hh) {
    const HS = 9;
    const positions = this._getHandlePositions(hx, hy, hw, hh);
    for (const p of positions) {
      if (mx >= p.cx - HS && mx <= p.cx + HS && my >= p.cy - HS && my <= p.cy + HS) return p.type;
    }
    return null;
  }

  _hitCamera(vx, vy) {
    // Iterate in reverse (top-drawn = last in array wins)
    for (let i = this.state.cameras.length - 1; i >= 0; i--) {
      const c = this.state.cameras[i];
      if (vx >= c.x && vx <= c.x + c.w && vy >= c.y && vy <= c.y + c.h) return c;
    }
    return null;
  }

  _handleCursor(type) {
    const map = { TL:'nwse-resize', TR:'nesw-resize', BL:'nesw-resize', BR:'nwse-resize',
                  T:'ns-resize', B:'ns-resize', L:'ew-resize', R:'ew-resize' };
    return map[type] || 'crosshair';
  }

  // ── Resize logic ─────────────────────────────────────────────────────
  _applyResize(cam, orig, handle, dx, dy, vw, vh) {
    const MIN = 40;
    let { x, y, w, h } = orig;

    if (handle.includes('L')) { x = Math.min(orig.x + dx, orig.x + orig.w - MIN); w = orig.x + orig.w - x; }
    if (handle.includes('R')) { w = Math.max(MIN, orig.w + dx); }
    if (handle.includes('T')) { y = Math.min(orig.y + dy, orig.y + orig.h - MIN); h = orig.y + orig.h - y; }
    if (handle.includes('B')) { h = Math.max(MIN, orig.h + dy); }

    if (cam.lockAR) {
      const ratio = cam.aspectRatio || (orig.w / orig.h);
      if (handle === 'T' || handle === 'B') w = h * ratio;
      else if (handle === 'L' || handle === 'R') h = w / ratio;
      else {
        // Corner: use the larger delta to determine primary axis
        if (Math.abs(dx) > Math.abs(dy)) h = w / ratio;
        else w = h * ratio;
      }
    }

    // Clamp to video bounds
    x = Math.max(0, x); y = Math.max(0, y);
    w = Math.min(w, vw - x); h = Math.min(h, vh - y);
    w = Math.max(MIN, w);    h = Math.max(MIN, h);

    cam.x = x; cam.y = y; cam.w = w; cam.h = h;
    if (cam.lockAR) cam.aspectRatio = w / h;
  }
}
