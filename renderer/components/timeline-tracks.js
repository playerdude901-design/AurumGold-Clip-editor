/* Sequence model. Source offsets are seconds; speed maps source to sequence time. */
class TimelineTracks extends TrackManager {
  get tracks() { return [...this.videoTracks, ...this.audioTracks, this.subTrack]; }
  get duration() { return Math.max(this.state.videoDuration || 0, ...Array.from(this.clips.values(), c => c.startTime + c.duration), 1); }
  initFromVideo(path, duration) {
    this.videoTracks = [{id:'v1', name:'V1', type:'video', visible:true, locked:false}];
    this.audioTracks = [{id:'a1', name:'A1', type:'audio', visible:true, locked:false, muted:false, solo:false, volume:1, isOriginal:true}];
    super.initFromVideo(path, duration);
    if (!this.state.hasAudio) this.clips.delete('clip_a1_main');
  }
  canEdit(clip) { return clip && !this.getTrackById(clip.trackId)?.locked; }
  changed() { const old=this.state.sequenceDuration; if(old != null && Math.abs(this.state.trimOut-old)<0.01)this.state.trimOut=this.duration; this.state.sequenceDuration=this.duration; this.syncSubtitlesToState(); EventBus.emit('tracks:changed'); EventBus.emit('project:changed'); }
  splitClip(id, time) {
    const c = this.clips.get(id);
    if (!this.canEdit(c)) return;
    const frame = 1 / (this.state.videoFps || 30);
    time = Math.round(time / frame) * frame;
    const left = time - c.startTime, right = c.duration - left;
    if (left < frame * 0.99 || right < frame * 0.99) return;
    const copy = structuredClone(c); copy.id = crypto.randomUUID();
    copy.startTime = time; copy.duration = right;
    copy.trimIn = (c.trimIn || 0) + left * (c.speed || 1);
    c.duration = left; c.trimOut = copy.trimIn;
    if (c.type === 'sub') { c.words = (c.words || []).filter(w => w.start < time); copy.words = (copy.words || []).filter(w => w.end > time); }
    this.clips.set(copy.id, copy); this.changed(); return copy;
  }
  duplicateClip(id) {
    const c = this.clips.get(id); if (!this.canEdit(c)) return;
    const copy = structuredClone(c); copy.id = crypto.randomUUID(); copy.startTime += c.duration;
    if (copy.words) copy.words = copy.words.map(w => ({...w, start:w.start+c.duration, end:w.end+c.duration}));
    this.clips.set(copy.id, copy); this.changed(); return copy;
  }
  deleteClip(id) { if (this.canEdit(this.clips.get(id))) { this.clips.delete(id); this.changed(); } }
  setTrackVolume(id, value) { const t = this.getTrackById(id); if (t) { t.volume = Math.max(0, Math.min(2, Number(value))); this.changed(); } }
  setSpeed(id, speed) {
    const c = this.clips.get(id); if (!this.canEdit(c) || !Number.isFinite(speed) || speed < 0.25 || speed > 4) return;
    const sourceDuration = c.duration * (c.speed || 1); c.speed = speed; c.duration = sourceDuration / speed;
    if (c.type === 'sub') this.retimeWords(c); this.changed();
  }
  retimeWords(c) {
    const words = (c.text || c.name || '').trim().split(/\s+/).filter(Boolean);
    c.words = words.map((word, i) => ({word, start:c.startTime+i*c.duration/words.length, end:c.startTime+(i+1)*c.duration/words.length}));
  }
  insertSource(start, end, at, overwrite = false) {
    const duration = end - start; if (duration <= 0 || !this.state.filePath) return;
    const targets = ['v1', ...(this.state.hasAudio ? ['a1'] : [])];
    if (targets.some(id => this.getTrackById(id).locked)) return;
    for (const c of [...this.clips.values()]) {
      if (!targets.includes(c.trackId)) continue;
      if (!overwrite) {
        if (c.startTime < at && c.startTime + c.duration > at) this.splitClip(c.id, at);
      } else {
        if (c.startTime < at && c.startTime+c.duration > at) this.splitClip(c.id, at);
      }
    }
    if (overwrite) {
      for (const c of [...this.clips.values()]) if (targets.includes(c.trackId) && c.startTime < at+duration && c.startTime+c.duration > at+duration) this.splitClip(c.id, at+duration);
      for (const c of [...this.clips.values()]) if (targets.includes(c.trackId) && c.startTime >= at && c.startTime < at+duration) this.clips.delete(c.id);
    } else {
      for (const c of this.clips.values()) if (targets.includes(c.trackId) && c.startTime >= at) c.startTime += duration;
    }
    targets.forEach(trackId => {
      const id = crypto.randomUUID();
      this.clips.set(id, {id, trackId, type:trackId === 'v1'?'video':'audio', name:this.state.filePath.split(/[\\/]/).pop(), filePath:this.state.filePath, fileDuration:this.state.videoDuration, startTime:at, duration, trimIn:start, trimOut:end, speed:1, isOriginal:trackId === 'a1'});
    });
    this.changed();
  }
  getExportAudioTracks() {
    const solo = this.audioTracks.some(t => t.solo);
    return this.audioTracks.filter(t => !t.muted && (!solo || t.solo)).flatMap(t => [...this.clips.values()].filter(c => c.trackId === t.id).map(c => ({...c, offset:c.startTime, volume:t.volume ?? 1})));
  }
}
