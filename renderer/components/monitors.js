class Monitors {
  constructor(state, timeline) {
    this.state=state; this.timeline=timeline; this.sourceIn=0; this.sourceOut=0;
    for (const [kind, wrapper] of [['source','source-wrapper'],['program','preview-wrapper']]) {
      const col=document.getElementById(wrapper).parentElement;
      const controls=document.createElement('div'); controls.className='monitor-controls';
      const seek=time=> { if(kind==='source') { timeline.engine.clock.pause(); state.videoEl.currentTime=Math.max(0,Math.min(state.videoDuration,time)); } else timeline.engine.clock.seek(time); };
      const current=()=>kind==='source'?state.videoEl.currentTime:timeline.engine.clock.time;
      const duration=()=>kind==='source'?state.videoDuration:timeline.trackManager.duration;
      const actions=[['|◀','Start',()=>seek(0)],['◀◀','Previous frame',()=>seek(current()-1/state.videoFps)],['▶','Play / Pause',()=>{
        if(kind==='program')timeline.engine.clock.toggle(); else { timeline.engine.clock.pause(); if(this.sourcePlaying) {state.videoEl.pause();this.sourcePlaying=false;}else{state.videoEl.muted=false;state.videoEl.playbackRate=1;state.videoEl.play().catch(()=>{});this.sourcePlaying=true;} }
      }],['▶▶','Next frame',()=>seek(current()+1/state.videoFps)],['▶|','End',()=>seek(duration())]];
      actions.forEach(([text,title,fn])=> {const b=document.createElement('button');b.textContent=text;b.title=title;b.onclick=fn;controls.append(b);});
      const input=document.createElement('input');input.className='monitor-timecode';input.value='00:00:00:00';input.setAttribute('aria-label',kind+' timecode');
      input.onchange=()=>{const t=AGTime.parse(input.value,state.videoFps);if(Number.isFinite(t))seek(t);else input.value=AGTime.format(current(),state.videoFps);}; controls.append(input);
      const mark=document.createElement('div');mark.className='monitor-marks';
      for(const [text,action] of [['In (I)',()=>{if(kind==='source')this.sourceIn=current();else timeline.engine.setMark('in',current());}],['Out (O)',()=>{if(kind==='source')this.sourceOut=current();else timeline.engine.setMark('out',current());}]]) {const b=document.createElement('button');b.textContent=text;b.onclick=action;mark.append(b);}
      if(kind==='source') {
        for(const [text,overwrite] of [['Insert',false],['Overwrite',true]]) {const b=document.createElement('button');b.textContent=text;b.onclick=()=>timeline.trackManager.insertSource(this.sourceIn,this.sourceOut,timeline.engine.clock.time,overwrite);mark.append(b);}
      } else {const b=document.createElement('button');b.textContent='⛶';b.title='Full Screen';b.onclick=()=>window.editorLayout.fullscreen(document.getElementById(wrapper));mark.append(b);}
      col.append(controls,mark);
      const update=()=>{if(document.activeElement!==input)input.value=AGTime.format(current(),state.videoFps);controls.children[2].textContent=(kind==='program'?timeline.engine.clock.playing:!state.videoEl.paused)?'⏸':'▶';};
      EventBus.on('sequence:timeupdate',update);state.videoEl.addEventListener('timeupdate',update);state.videoEl.addEventListener('pause',update);
    }
    const badge=document.createElement('span');badge.className='program-meta';document.getElementById('preview-wrapper').append(badge);
    EventBus.on('video:loaded',()=>{this.sourceIn=0;this.sourceOut=state.videoDuration;badge.textContent=`1080 × 1920 · ${state.videoFps} FPS`;});
  }
}
