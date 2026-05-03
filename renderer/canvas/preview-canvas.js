/**
 * PreviewCanvas — Canvas B (9:16 output)
 * Composites camera crops from the source video into a vertical frame.
 * Supports manual layering, positioning, and resizing.
 */
class PreviewCanvas {
  constructor(canvasEl, state) {
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d');
    this.state  = state;
    this._raf   = null;
    
    this._draggingCam = null;
    this._resizingCam = null;
    this._resizeDir   = ''; // 'tl', 'tr', 'bl', 'br'
    this._lastMouse   = { x: 0, y: 0 };
    
    this._bindEvents();
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
    window.addEventListener('mousemove', e => this._onMouseMove(e));
    window.addEventListener('mouseup',   () => { 
      this._draggingCam = null; 
      this._resizingCam = null;
    });
  }

  _onMouseDown(e) {
    if (!this.state.cameras.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    // Convert mouse to preview space (e.g. 1080x1920)
    const px = (mx / rect.width) * 1080;
    const py = (my / rect.height) * 1920;

    // Check cameras from top to bottom (reverse array)
    const cameras = [...this.state.cameras].reverse();
    
    for (const cam of cameras) {
      if (!cam.active) continue;

      // Check handles first
      const handleSize = 40;
      const h = handleSize;
      
      // br handle
      if (px > cam.px + cam.pw - h && px < cam.px + cam.pw && py > cam.py + cam.ph - h && py < cam.py + cam.ph) {
        this._resizingCam = cam;
        this._resizeDir = 'br';
        this._lastMouse = { x: e.clientX, y: e.clientY };
        this._selectCamera(cam.id);
        return;
      }

      // Check body
      if (px >= cam.px && px <= cam.px + cam.pw && py >= cam.py && py <= cam.py + cam.ph) {
        this._draggingCam = cam;
        this._lastMouse = { x: e.clientX, y: e.clientY };
        this._selectCamera(cam.id);
        return;
      }
    }
  }

  _selectCamera(id) {
    this.state.selectedCameraId = id;
    EventBus.emit('camera:selected', id);
  }

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const px = (mx / rect.width) * 1080;
    const py = (my / rect.height) * 1920;

    // Cursor feedback
    let foundHandle = false;
    for (const cam of this.state.cameras) {
       if (cam.id === this.state.selectedCameraId) {
         const h = 40;
         if (px > cam.px + cam.pw - h && px < cam.px + cam.pw && py > cam.py + cam.ph - h && py < cam.py + cam.ph) {
           this.canvas.style.cursor = 'nwse-resize';
           foundHandle = true;
           break;
         }
       }
    }
    if (!foundHandle && !this._draggingCam && !this._resizingCam) {
      this.canvas.style.cursor = 'default';
    }

    if (this._resizingCam) {
      const dx = (e.clientX - this._lastMouse.x) * (1080 / rect.width);
      const dy = (e.clientY - this._lastMouse.y) * (1920 / rect.height);
      this._lastMouse = { x: e.clientX, y: e.clientY };

      const cam = this._resizingCam;
      
      // Calculate new width with constraints
      const newPw = Math.max(40, Math.min(1080 - cam.px, cam.pw + dx));
      
      if (cam.lockAR) {
        const ar = cam.w / cam.h;
        let newPh = newPw / ar;
        
        // If height exceeds bottom, cap height and recalculate width
        if (cam.py + newPh > 1920) {
          newPh = 1920 - cam.py;
          cam.pw = newPh * ar;
          cam.ph = newPh;
        } else {
          cam.pw = newPw;
          cam.ph = newPh;
        }
      } else {
        cam.pw = newPw;
        cam.ph = Math.max(40, Math.min(1920 - cam.py, cam.ph + dy));
      }
      
      EventBus.emit('cameras:changed', this.state.cameras);
    } else if (this._draggingCam) {
      const dx = (e.clientX - this._lastMouse.x) * (1080 / rect.width);
      const dy = (e.clientY - this._lastMouse.y) * (1920 / rect.height);
      this._lastMouse = { x: e.clientX, y: e.clientY };

      this._draggingCam.px = Math.max(0, Math.min(1080 - this._draggingCam.pw, this._draggingCam.px + dx));
      this._draggingCam.py = Math.max(0, Math.min(1920 - this._draggingCam.ph, this._draggingCam.py + dy));
      
      EventBus.emit('cameras:changed', this.state.cameras);
    }
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

  _draw() {
    const { ctx, canvas, state } = this;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    if (!state.videoEl || !state.videoWidth) return;

    // Draw cameras in array order (bottom to top)
    state.cameras.forEach((cam) => {
      if (!cam.active) return;

      const sx = Math.max(0, cam.x);
      const sy = Math.max(0, cam.y);
      const sw = Math.min(cam.w, state.videoWidth  - sx);
      const sh = Math.min(cam.h, state.videoHeight - sy);
      if (sw <= 0 || sh <= 0) return;

      // Scale preview coords to canvas size
      const dx = (cam.px / 1080) * W;
      const dy = (cam.py / 1920) * H;
      const dw = (cam.pw / 1080) * W;
      const dh = (cam.ph / 1920) * H;

      ctx.save();
      if (cam.shape === 'circle') {
        ctx.beginPath();
        ctx.ellipse(dx + dw / 2, dy + dh / 2, dw / 2, dh / 2, 0, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.drawImage(state.videoEl, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.restore();

      // Selected highlight & handles
      if (cam.id === state.selectedCameraId) {
        ctx.strokeStyle = cam.color;
        ctx.lineWidth   = 2;
        ctx.strokeRect(dx, dy, dw, dh);

        // Resize handle (br)
        ctx.fillStyle = cam.color;
        const hs = 8;
        ctx.fillRect(dx + dw - hs, dy + dh - hs, hs, hs);
      }

      // Label
      ctx.fillStyle   = 'rgba(0,0,0,0.5)';
      ctx.fillRect(dx + 4, dy + 4, 60, 14);
      ctx.fillStyle   = cam.color;
      ctx.font        = 'bold 9px Inter, sans-serif';
      ctx.fillText(cam.label, dx + 8, dy + 14);
    });
  }
}
