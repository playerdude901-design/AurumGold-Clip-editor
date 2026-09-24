/* Preserve subtitle-only metadata through the existing track serialization API. */
const SubtitleStyleStore = {
  attach(state) {
    const manager = state.timeline?.trackManager;
    if (!manager || manager.subtitleStylesAttached) return;
    manager.subtitleStylesAttached = true;
    const from = manager.syncSubtitlesFromState.bind(manager);
    const to = manager.syncSubtitlesToState.bind(manager);
    manager.syncSubtitlesFromState = function () {
      for (const cue of state.subtitles || []) cue.style = SubtitleStyle.normalize(cue.style || state.subtitleStyle);
      from();
      for (const cue of state.subtitles || []) {
        const clip = manager.clips.get(cue.id);
        if (clip) clip.style = {...cue.style};
      }
    };
    manager.syncSubtitlesToState = function () {
      const previous = new Map((state.subtitles || []).map(c=>[c.id,c.style]));
      to();
      for (const cue of state.subtitles || []) {
        const clip = manager.clips.get(cue.id);
        cue.style = SubtitleStyle.normalize(clip?.style || previous.get(cue.id) || state.subtitleStyle);
        if (clip) clip.style = {...cue.style};
      }
    };
    manager.syncSubtitlesFromState();
  },
  key:'ag-subtitle-style-presets-v1',
  load() {
    try {
      const value = JSON.parse(localStorage.getItem(this.key));
      if (Array.isArray(value)) return value.filter(p=>p && typeof p.name==='string').map(p=>({name:p.name,style:SubtitleStyle.normalize(p.style)}));
    } catch (_) { /* Old/corrupt local data should not prevent opening the editor. */ }
    return structuredClone(SubtitleStyle.presets);
  },
  save(presets) { localStorage.setItem(this.key,JSON.stringify(presets)); }
};
