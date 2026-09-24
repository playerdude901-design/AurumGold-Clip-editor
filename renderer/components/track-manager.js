/**
 * TrackManager
 * Manages the hierarchy of tracks (V1..Vn, A1..An, SUB), their properties
 * (visibility, lock, mute, solo, volume), and the collection of clips within them.
 */
class TrackManager {
  constructor(state) {
    this.state = state;

    // Track definitions
    this.subTrack = {
      id: 'sub',
      name: 'SUB',
      type: 'sub',
      visible: true,
      locked: false
    };

    this.videoTracks = [
      { id: 'v1', name: 'V1', type: 'video', visible: true, locked: false, muted: false }
    ];

    this.audioTracks = [
      { id: 'a1', name: 'A1', type: 'audio', visible: true, locked: false, muted: false, solo: false, volume: 1.0, isOriginal: true }
    ];

    // Clips registry: Map of clipId -> ClipObject
    this.clips = new Map();
  }

  initFromVideo(filePath, duration) {
    this.clips.clear();
    const dur = duration || 10;
    const name = filePath ? filePath.split(/[\\/]/).pop() : 'Clip Principal';

    // Base Video Clip on V1
    const vClipId = 'clip_v1_main';
    this.clips.set(vClipId, {
      id: vClipId,
      trackId: 'v1',
      type: 'video',
      name: name,
      filePath: filePath,
      startTime: 0,
      duration: dur,
      trimIn: 0,
      trimOut: dur,
      fileDuration: dur,
      isMainVideo: true
    });

    // Base Audio Clip on A1
    const aClipId = 'clip_a1_main';
    this.clips.set(aClipId, {
      id: aClipId,
      trackId: 'a1',
      type: 'audio',
      name: `${name} (Audio)`,
      filePath: filePath,
      startTime: 0,
      duration: dur,
      trimIn: 0,
      trimOut: dur,
      fileDuration: dur,
      isOriginal: true
    });

    // Ensure SUB cues are loaded from state.subtitles if present
    this.syncSubtitlesFromState();
  }

  syncSubtitlesFromState() {
    if (!this.state.subtitles) return;
    // Clear existing sub cues from clips map
    for (const [id, c] of this.clips.entries()) {
      if (c.type === 'sub') this.clips.delete(id);
    }
    // Populate
    this.state.subtitles.forEach((s) => {
      this.clips.set(s.id, {
        id: s.id,
        trackId: 'sub',
        type: 'sub',
        name: s.text || 'Subtítulo',
        startTime: s.start,
        duration: Math.max(0.2, s.end - s.start),
        trimIn: 0,
        trimOut: Math.max(0.2, s.end - s.start),
        text: s.text,
        words: s.words || []
      });
    });
  }

  syncSubtitlesToState() {
    const subClips = Array.from(this.clips.values())
      .filter(c => c.type === 'sub')
      .sort((a, b) => a.startTime - b.startTime);

    this.state.subtitles = subClips.map(c => ({
      id: c.id,
      start: Math.round(c.startTime * 100) / 100,
      end: Math.round((c.startTime + c.duration) * 100) / 100,
      text: c.text || c.name || '',
      words: c.words || []
    }));
  }

  // ── Track Manipulation ──────────────────────────────────────────────────
  addVideoTrack() {
    const nextIdx = this.videoTracks.length + 1;
    const newTrack = {
      id: `v${nextIdx}_${Date.now().toString(36)}`,
      name: `V${nextIdx}`,
      type: 'video',
      visible: true,
      locked: false,
      muted: false
    };
    this.videoTracks.push(newTrack);
    EventBus.emit('tracks:changed');
    return newTrack;
  }

  addAudioTrack() {
    const nextIdx = this.audioTracks.length + 1;
    const newTrack = {
      id: `a${nextIdx}_${Date.now().toString(36)}`,
      name: `A${nextIdx}`,
      type: 'audio',
      visible: true,
      locked: false,
      muted: false,
      solo: false,
      volume: 1.0,
      isOriginal: false
    };
    this.audioTracks.push(newTrack);
    EventBus.emit('tracks:changed');
    return newTrack;
  }

  removeTrack(trackId) {
    if (trackId === 'sub' || trackId === 'v1' || trackId === 'a1') {
      return false; // Can't delete base tracks
    }
    // Remove any clips in this track
    for (const [cId, clip] of this.clips.entries()) {
      if (clip.trackId === trackId) {
        this.clips.delete(cId);
      }
    }
    this.videoTracks = this.videoTracks.filter(t => t.id !== trackId);
    this.audioTracks = this.audioTracks.filter(t => t.id !== trackId);
    EventBus.emit('tracks:changed');
    return true;
  }

  renameTrack(trackId, newName) {
    const t = this.getTrackById(trackId);
    if (t && newName) {
      t.name = newName.trim();
      EventBus.emit('tracks:changed');
    }
  }

  toggleTrackVisibility(trackId) {
    const t = this.getTrackById(trackId);
    if (t) {
      t.visible = !t.visible;
      EventBus.emit('tracks:changed');
    }
  }

  toggleTrackLock(trackId) {
    const t = this.getTrackById(trackId);
    if (t) {
      t.locked = !t.locked;
      EventBus.emit('tracks:changed');
    }
  }

  toggleTrackMute(trackId) {
    const t = this.getTrackById(trackId);
    if (t) {
      t.muted = !t.muted;
      EventBus.emit('tracks:changed');
      EventBus.emit('project:changed');
    }
  }

  toggleTrackSolo(trackId) {
    const t = this.getTrackById(trackId);
    if (t && t.type === 'audio') {
      t.solo = !t.solo;
      EventBus.emit('tracks:changed');
      EventBus.emit('project:changed');
    }
  }

  setTrackVolume(trackId, vol) {
    const t = this.getTrackById(trackId);
    if (t && t.type === 'audio') {
      t.volume = Math.max(0, Math.min(2.0, parseFloat(vol) || 1.0));
      EventBus.emit('tracks:changed');
      EventBus.emit('project:changed');
    }
  }

  getTrackById(trackId) {
    if (trackId === 'sub') return this.subTrack;
    return this.videoTracks.find(t => t.id === trackId) || this.audioTracks.find(t => t.id === trackId);
  }

  // ── Clip Operations ─────────────────────────────────────────────────────
  addAudioClip(trackId, fileMeta, targetStartTime = 0) {
    if (!fileMeta || !fileMeta.filePath) return null;
    let track = this.getTrackById(trackId);
    if (!track || track.type !== 'audio') {
      // Pick first non-original audio track or create one
      track = this.audioTracks.find(t => !t.isOriginal) || this.addAudioTrack();
    }

    const clipId = `audio_clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const dur = fileMeta.duration || 5;
    const clip = {
      id: clipId,
      trackId: track.id,
      type: 'audio',
      name: fileMeta.fileName || fileMeta.filePath.split(/[\\/]/).pop(),
      filePath: fileMeta.filePath,
      startTime: Math.max(0, targetStartTime),
      duration: dur,
      trimIn: 0,
      trimOut: dur,
      fileDuration: dur,
      isOriginal: false
    };

    this.clips.set(clipId, clip);
    EventBus.emit('tracks:changed');
    EventBus.emit('project:changed');
    return clip;
  }

  splitClip(clipId, splitTime) {
    const clip = this.clips.get(clipId);
    if (!clip) return null;

    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;
    if (splitTime <= clipStart + 0.1 || splitTime >= clipEnd - 0.1) {
      return null; // Too close to boundaries
    }

    const firstDuration = splitTime - clipStart;
    const secondDuration = clipEnd - splitTime;

    // Adjust first clip
    const origTrimIn = clip.trimIn || 0;
    clip.duration = firstDuration;
    clip.trimOut = origTrimIn + firstDuration;

    // Create second clip
    const secondClipId = `${clip.type}_clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const secondClip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: secondClipId,
      name: `${clip.name} (Part 2)`,
      startTime: splitTime,
      duration: secondDuration,
      trimIn: origTrimIn + firstDuration,
      trimOut: (clip.trimIn || 0) + firstDuration + secondDuration
    };

    if (clip.type === 'sub') {
      clip.text = clip.text ? `${clip.text} [1]` : '';
      secondClip.text = clip.text ? `${clip.text.replace(/ \[1\]$/, '')} [2]` : '';
    }

    this.clips.set(secondClipId, secondClip);
    if (clip.type === 'sub') this.syncSubtitlesToState();

    EventBus.emit('tracks:changed');
    EventBus.emit('project:changed');
    return secondClip;
  }

  duplicateClip(clipId) {
    const clip = this.clips.get(clipId);
    if (!clip) return null;

    const newId = `${clip.type}_clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newClip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: newId,
      name: `${clip.name} (Copy)`,
      startTime: clip.startTime + clip.duration + 0.2
    };

    this.clips.set(newId, newClip);
    if (clip.type === 'sub') this.syncSubtitlesToState();

    EventBus.emit('tracks:changed');
    EventBus.emit('project:changed');
    return newClip;
  }

  deleteClip(clipId) {
    const clip = this.clips.get(clipId);
    if (!clip) return;
    this.clips.delete(clipId);
    if (clip.type === 'sub') this.syncSubtitlesToState();
    EventBus.emit('tracks:changed');
    EventBus.emit('project:changed');
  }

  // ── Prepare Audio Tracks Export Payload for FFmpeg ───────────────────────
  getExportAudioTracks() {
    const anySolo = this.audioTracks.some(t => t.solo);
    const result = [];

    for (const track of this.audioTracks) {
      if (track.muted) continue;
      if (anySolo && !track.solo) continue;

      const trackClips = Array.from(this.clips.values())
        .filter(c => c.trackId === track.id && c.type === 'audio');

      for (const clip of trackClips) {
        result.push({
          filePath: clip.filePath,
          isOriginal: !!clip.isOriginal,
          offset: Math.max(0, clip.startTime),
          trimIn: Math.max(0, clip.trimIn || 0),
          trimOut: Math.max(0, clip.trimOut || clip.duration),
          volume: track.volume != null ? track.volume : 1.0,
          muted: false
        });
      }
    }

    return result;
  }

  // ── Serialization ───────────────────────────────────────────────────────
  serialize() {
    return {
      subTrack: { ...this.subTrack },
      videoTracks: this.videoTracks.map(t => ({ ...t })),
      audioTracks: this.audioTracks.map(t => ({ ...t })),
      clips: Array.from(this.clips.values()).map(c => ({ ...c }))
    };
  }

  restore(data) {
    if (!data) return;
    if (data.subTrack) this.subTrack = { ...data.subTrack };
    if (data.videoTracks) this.videoTracks = data.videoTracks.map(t => ({ ...t }));
    if (data.audioTracks) this.audioTracks = data.audioTracks.map(t => ({ ...t }));
    if (data.clips && Array.isArray(data.clips)) {
      this.clips.clear();
      data.clips.forEach(c => this.clips.set(c.id, { ...c }));
    }
    this.syncSubtitlesToState();
    EventBus.emit('tracks:changed');
  }
}

window.TrackManager = TrackManager;
