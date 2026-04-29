function formatTime(secs, showMs = true) {
  if (!isFinite(secs) || secs < 0) secs = 0;
  const h  = Math.floor(secs / 3600);
  const m  = Math.floor((secs % 3600) / 60);
  const s  = Math.floor(secs % 60);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (showMs) {
    const ms = Math.floor((secs % 1) * 100);
    return `${hh}:${mm}:${ss}:${String(ms).padStart(2,'0')}`;
  }
  return `${hh}:${mm}:${ss}`;
}
