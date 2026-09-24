const AGTime = {
  format(seconds, fps = 30) {
    const rate = Math.round(fps), frame = Math.max(0, Math.round(seconds * fps));
    return [Math.floor(frame / rate / 3600), Math.floor(frame / rate / 60)%60, Math.floor(frame/rate)%60, frame%rate].map(n => String(n).padStart(2,'0')).join(':');
  },
  parse(text, fps = 30) {
    const a = text.trim().split(':').map(Number);
    if (a.some(n => !Number.isFinite(n) || n < 0)) return NaN;
    if (a.length === 4) return a[0]*3600+a[1]*60+a[2]+a[3]/fps;
    if (a.length === 3) return a[0]*60+a[1]+a[2]/fps;
    return a.length === 1 ? a[0] : NaN;
  }
};
class TimelinePlayhead {
  constructor(state, tracks) {
    this.state = state; this.tracks = tracks; this.time = 0; this.playing = false; this.rate = 1;
    this.audio = new Map(); this.last = performance.now();
    state.sequenceTime = 0;
    const tick = now => {
      if (this.playing) this.seek(this.time + (now-this.last)/1000*this.rate, false);
      this.last = now; this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    EventBus.on('tracks:changed', () => this.sync());
    EventBus.on('video:loaded', () => { this.pause(); this.seek(0); });
  }
  seek(time, pause = true) {
    if (pause) this.pause();
    const limit = this.tracks.duration;
    this.time = Math.max(0, Math.min(limit, time)); this.state.sequenceTime = this.time;
    if (time >= limit || time < 0) this.pause();
    this.sync(); EventBus.emit('sequence:timeupdate');
  }
  sync() {
    const s = this.state, time = this.time;
    const clips = [...this.tracks.clips.values()];
    let video;
    for (const track of this.tracks.videoTracks) {
      if (track.visible) video = clips.filter(c => c.trackId === track.id && time >= c.startTime && time < c.startTime+c.duration).at(-1) || video;
    }
    s.sequenceHasVideo = !!video;
    s.subtitlesVisible = this.tracks.subTrack.visible;
    if (video) {
      const target = (video.trimIn || 0) + (time-video.startTime)*(video.speed || 1);
      if (Math.abs(s.videoEl.currentTime-target) > (this.playing && this.rate>0 ? 0.12 : 0.001)) s.videoEl.currentTime = target;
      s.videoEl.playbackRate = Math.max(0.25, Math.min(16, Math.abs(this.rate)*(video.speed || 1)));
      if (this.playing && this.rate>0) s.videoEl.play().catch(() => {}); else s.videoEl.pause();
    } else s.videoEl.pause();
    s.videoEl.muted = true;
    const solo = this.tracks.audioTracks.some(t => t.solo);
    const active = new Set();
    for (const c of clips) {
      if (c.type !== 'audio') continue;
      const track = this.tracks.getTrackById(c.trackId);
      if (!track || track.muted || (solo && !track.solo) || time < c.startTime || time >= c.startTime+c.duration) continue;
      active.add(c.id);
      let player = this.audio.get(c.id);
      if (!player) { player = new Audio(encodeURI('file:///' + c.filePath.replace(/\\/g,'/')).replace(/#/g,'%23')); this.audio.set(c.id, player); }
      const target = (c.trimIn || 0)+(time-c.startTime)*(c.speed || 1);
      if (Math.abs(player.currentTime-target)>0.12) player.currentTime = target;
      player.volume = Math.min(1, track.volume ?? 1);
      player.playbackRate = Math.max(0.25, Math.min(16, Math.abs(this.rate)*(c.speed || 1)));
      if (this.playing && this.rate>0) player.play().catch(() => {}); else player.pause();
    }
    for (const [id, player] of this.audio) if (!active.has(id)) { player.pause(); player.removeAttribute('src'); this.audio.delete(id); }
  }
  pause() { this.playing = false; this.state.videoEl.pause(); for (const a of this.audio.values()) a.pause(); }
  play(rate = 1) { if (!this.state.filePath) return; this.rate = rate; this.playing = true; this.last = performance.now(); this.sync(); }
  toggle() { if (this.playing) this.pause(); else { if (this.time >= this.tracks.duration) this.seek(0); this.play(); } EventBus.emit('sequence:timeupdate'); }
  step(dir) { this.seek(this.time + dir / (this.state.videoFps || 30)); }
}
