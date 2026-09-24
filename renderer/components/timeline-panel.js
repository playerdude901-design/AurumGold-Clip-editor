class TimelinePanel {
  constructor(engine) {
    const panel = document.getElementById('timeline-area');
    const handle = document.getElementById('tl-resizer');
    let dragging = false, startY = 0, startH = 0;
    const clamp = h => Math.min(Math.max(h, 120), window.innerHeight * 0.8);
    handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'horizontal'); handle.tabIndex = 0;
    const set = h => { panel.style.flex = `0 0 ${clamp(h)}px`; handle.setAttribute('aria-valuenow', Math.round(clamp(h))); };
    handle.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      dragging = true; startY = e.clientY; startH = panel.getBoundingClientRect().height;
      handle.classList.add('active'); document.body.style.userSelect = 'none'; e.preventDefault();
    });
    document.addEventListener('mousemove', e => { if (dragging) set(startH + startY - e.clientY); });
    const finish = () => {
      if (!dragging) return;
      dragging = false; handle.classList.remove('active'); document.body.style.userSelect = '';
      localStorage.setItem('ag-timeline-h', panel.getBoundingClientRect().height);
    };
    document.addEventListener('mouseup', finish); window.addEventListener('blur', finish);
    handle.addEventListener('keydown', e => {
      if (!['ArrowUp','ArrowDown'].includes(e.key)) return;
      e.preventDefault(); set(panel.getBoundingClientRect().height + (e.key === 'ArrowUp' ? 20 : -20));
      localStorage.setItem('ag-timeline-h', panel.getBoundingClientRect().height);
    });
    const savedH = Number(localStorage.getItem('ag-timeline-h'));
    if (Number.isFinite(savedH) && savedH > 0) set(savedH);
    new ResizeObserver(() => engine.render()).observe(panel);
    window.addEventListener('resize', () => set(panel.getBoundingClientRect().height));
  }
}
