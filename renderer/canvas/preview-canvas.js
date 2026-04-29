/**
 * PreviewCanvas — Canvas B (9:16 output)
 * Composites camera crops from the source video into a vertical frame.
 */
class PreviewCanvas {
  constructor(canvasEl, state) {
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d');
    this.state  = state;
    this._raf   = null;
    
    this._draggingCam = null;
    this._lastMouse   = { x: 0, y: 0 };
    
    this._bindEvents();
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
    this.canvas.addEventListener('wheel',     e => this._onWheel(e), { passive: false });
    window.addEventListener('mousemove', e => this._onMouseMove(e));
    window.addEventListener('mouseup',   () => { this._draggingCam = null; });
  }

  _onWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const active = this.state.cameras.filter(c => c.active);
    const n = active.length;
    const slotH = rect.height / n;
    const idx = Math.floor(mouseY / slotH);
    const cam = active[idx];
    
    if (cam) {
      const delta = e.deltaY > 0 ? 1.05 : 0.95;
      const oldW = cam.w;
      const oldH = cam.h;
      
      cam.w = Math.max(40, Math.min(this.state.videoWidth, cam.w * delta));
      cam.h = cam.w / cam.aspectRatio;
      
      // If height is too big, scale back
      if (cam.h > this.state.videoHeight) {
        cam.h = this.state.videoHeight;
        cam.w = cam.h * cam.aspectRatio;
      }
      
      // Keep center fixed
      cam.x -= (cam.w - oldW) / 2;
      cam.y -= (cam.h - oldH) / 2;
      
      // Clamp
      cam.x = Math.max(0, Math.min(cam.x, this.state.videoWidth - cam.w));
      cam.y = Math.max(0, Math.min(cam.y, this.state.videoHeight - cam.h));
      
      EventBus.emit('cameras:changed', this.state.cameras);
    }
  }

  _onMouseDown(e) {
    if (!this.state.cameras.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    
    const active = this.state.cameras.filter(c => c.active);
    const n = active.length;
    const slotH = rect.height / n;
    const idx = Math.floor(mouseY / slotH);
    
    if (active[idx]) {
      this._draggingCam = active[idx];
      this._lastMouse = { x: e.clientX, y: e.clientY };
      // Select the camera too
      this.state.selectedCameraId = active[idx].id;
      EventBus.emit('camera:selected', active[idx].id);
    }
  }

  _onMouseMove(e) {
    if (!this._draggingCam) return;
    
    const dx = e.clientX - this._lastMouse.x;
    const dy = e.clientY - this._lastMouse.y;
    this._lastMouse = { x: e.clientX, y: e.clientY };
    
    const rect = this.canvas.getBoundingClientRect();
    const active = this.state.cameras.filter(c => c.active);
    const slotH = rect.height / active.length;
    
    // Scale factor from preview pixels to source pixels
    // Preview width represents the output width (e.g. 1080)
    const previewScale = this._draggingCam.w / rect.width;
    
    this._draggingCam.x += dx * previewScale;
    this._draggingCam.y += dy * previewScale;
    
    // Constraints
    this._draggingCam.x = Math.max(0, Math.min(this._draggingCam.x, this.state.videoWidth - this._draggingCam.w));
    this._draggingCam.y = Math.max(0, Math.min(this._draggingCam.y, this.state.videoHeight - this._draggingCam.h));
    
    EventBus.emit('cameras:changed', this.state.cameras);
  }

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

  // Canvas is always sized to fill its CSS container at 9:16
  // Caller must set canvas.width / canvas.height
  _draw() {
    const { ctx, canvas, state } = this;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const active = state.cameras.filter(c => c.active);
    if (!state.videoEl || !state.videoWidth || !active.length) {
      // Placeholder grid
      ctx.strokeStyle = 'rgba(201,168,76,0.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(0, H * i/4); ctx.lineTo(W, H * i/4); ctx.stroke();
      }
      return;
    }

    const n = active.length;
    const slotH = Math.floor(H / n);

    active.forEach((cam, i) => {
      const dstY = i * slotH;
      // Clamp source coords to video bounds
      const sx = Math.max(0, cam.x);
      const sy = Math.max(0, cam.y);
      const sw = Math.min(cam.w, state.videoWidth  - sx);
      const sh = Math.min(cam.h, state.videoHeight - sy);
      if (sw <= 0 || sh <= 0) return;

      ctx.drawImage(state.videoEl, sx, sy, sw, sh, 0, dstY, W, slotH);

      // Divider line between slots
      if (i < n - 1) {
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(0, dstY + slotH);
        ctx.lineTo(W, dstY + slotH);
        ctx.stroke();
      }

      // Highlight selected camera slot
      if (cam.id === state.selectedCameraId) {
        ctx.strokeStyle = cam.color;
        ctx.lineWidth   = 2;
        ctx.strokeRect(1, dstY + 1, W - 2, slotH - 2);
      }

      // Camera label in preview
      ctx.fillStyle   = 'rgba(0,0,0,0.5)';
      ctx.fillRect(6, dstY + 6, 70, 16);
      ctx.fillStyle   = cam.color;
      ctx.font        = 'bold 10px Inter, sans-serif';
      ctx.fillText(cam.label, 10, dstY + 18);
    });
  }
}
