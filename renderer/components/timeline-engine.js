/* Canvas ruler, track rendering, and editing gestures. No external timeline library. */
class TimelineEngine {
  constructor(state, trackManager, waveformRenderer) {
    Object.assign(this, {state, trackManager, waveformRenderer});
    this.activeTool = 'select'; this.snapEnabled = true; this.selectedClipIds = new Set(); this.pxPerSecond = 100;
    this.elArea = document.getElementById('timeline-area');
    this.elHeaders = document.getElementById('tl-track-headers');
    this.elScroll = document.getElementById('tl-scroll');
    this.elInner = document.getElementById('tl-inner');
    this.elTrack = document.getElementById('tl-track');
    this.ruler = document.getElementById('tl-ruler'); this.elInner.prepend(this.ruler);
    this.ruler.innerHTML = '<canvas id="tl-ruler-canvas"></canvas>';
    this.rulerCanvas = this.ruler.firstChild;
    this.snapLine = document.createElement('div'); this.snapLine.className = 'tl-snap-line'; this.snapLine.hidden = true; this.elInner.append(this.snapLine);
    this.clock = new TimelinePlayhead(state, trackManager);
    this.panel = new TimelinePanel(this);
    this.bind(); this.render();
  }
  get duration() { return this.trackManager.duration; }
  frame(t) { return Math.round(t * (this.state.videoFps || 30)) / (this.state.videoFps || 30); }
  timeAt(e) { return Math.max(0, this.frame((e.clientX-this.elInner.getBoundingClientRect().left)/this.pxPerSecond)); }
  render() {
    if (!this.elInner) return;
    const min = Math.max(1, this.elScroll.clientWidth / this.duration);
    this.pxPerSecond = Math.max(min, Math.min((this.state.videoFps || 30)*20, this.pxPerSecond));
    this.elInner.style.width = `${Math.max(this.elScroll.clientWidth, this.duration*this.pxPerSecond)}px`;
    const zoom = document.getElementById('tl-zoom'); zoom.min = min; zoom.max = Math.max(min, (this.state.videoFps || 30)*20); zoom.step = 1; zoom.value = this.pxPerSecond;
    this.elHeaders.replaceChildren(); this.elTrack.replaceChildren();
    const rh = document.createElement('div'); rh.className = 'tl-hdr-row tl-hdr-ruler'; rh.textContent = 'TRACKS'; this.elHeaders.append(rh);
    for (const track of this.trackManager.tracks) this.renderTrack(track);
    this.elInner.style.minHeight = `${24 + this.trackManager.tracks.reduce((h,t) => h+(t.height || 56),0)}px`;
    this.drawRuler(); this.update();
    this.elHeaders.scrollTop = this.elScroll.scrollTop;
  }
  button(text, title, action, active = false) {
    const b = document.createElement('button'); b.textContent = text; b.title = title; b.className = 'tl-hdr-btn'; b.classList.toggle('active',active);
    b.onclick = e => { e.stopPropagation(); action(); }; return b;
  }
  renderTrack(track) {
    const tm = this.trackManager, height = track.height || 56;
    const header = document.createElement('div'); header.className = 'tl-hdr-row'; header.dataset.trackId = track.id; header.style.height = height+'px';
    const tag = document.createElement('span'); tag.className = 'tl-track-tag'; tag.textContent = track.name; tag.title = 'Double click to expand / collapse'; header.append(tag);
    header.ondblclick = e => { if (e.target.closest('button,input')) return; track.height = height === 56 ? (track.type === 'audio'?100:120) : 56; this.render(); EventBus.emit('project:changed'); };
    if (track.type !== 'audio') header.append(this.button('◉','Visibility',() => { tm.toggleTrackVisibility(track.id); tm.changed(); }, track.visible));
    else {
      header.append(this.button('M','Mute',() => tm.toggleTrackMute(track.id), track.muted), this.button('S','Solo',() => tm.toggleTrackSolo(track.id), track.solo));
    }
    header.append(this.button('🔒','Lock',() => { tm.toggleTrackLock(track.id); tm.changed(); }, track.locked));
    if (track.type === 'audio') {
      const vol = document.createElement('input'); vol.type = 'range'; vol.min=0; vol.max=1; vol.step=0.01; vol.value=track.volume ?? 1; vol.title='Volume'; vol.className='track-volume';
      vol.oninput = () => { track.volume=Number(vol.value); this.clock.sync(); }; vol.onchange=()=>tm.changed(); header.append(vol);
    }
    this.elHeaders.append(header);
    const lane = document.createElement('div'); lane.className = 'tl-lane tl-lane-'+track.type; lane.dataset.trackId=track.id; lane.dataset.trackType=track.type; lane.style.height=height+'px'; lane.classList.toggle('locked',track.locked);
    lane.ondragover = e => { if(track.type==='audio' && !track.locked) e.preventDefault(); };
    lane.ondrop = async e => {
      e.preventDefault(); if(track.type!=='audio' || track.locked) return;
      let at=this.timeAt(e);
      for(const file of e.dataTransfer.files) {
        if(!/\.(mp3|wav|ogg|aac|m4a|flac)$/i.test(file.name)) continue;
        try { const meta=await window.electronAPI.probeAudio(file.path); if(meta.error) throw new Error(meta.error); tm.addAudioClip(track.id,meta,at); at+=meta.duration; } catch(err) { alert(err.message); }
      }
    };
    for(const clip of tm.clips.values()) if(clip.trackId===track.id) lane.append(this.renderClip(clip,track));
    this.elTrack.append(lane);
  }
  renderClip(c, track) {
    const el=document.createElement('div'); el.className='tl-clip tl-clip-'+c.type; el.dataset.clipId=c.id;
    el.classList.toggle('selected',this.selectedClipIds.has(c.id)); el.style.left=c.startTime*this.pxPerSecond+'px'; el.style.width=Math.max(2,c.duration*this.pxPerSecond)+'px';
    el.title=`${c.name}\n${AGTime.format(c.startTime,this.state.videoFps)} · ${AGTime.format(c.duration,this.state.videoFps)}`;
    const content=document.createElement('div'); content.className='tl-clip-content'; content.textContent=c.type==='sub'?c.text:c.name+' · '+AGTime.format(c.duration,this.state.videoFps); el.append(content);
    if(c.type==='audio') {
      const canvas=document.createElement('canvas'); canvas.className='tl-audio-waveform-canvas'; el.prepend(canvas);
      requestAnimationFrame(()=> { if(!canvas.isConnected) return; canvas.width=Math.max(1,Math.min(8192,el.clientWidth)); canvas.height=Math.max(1,el.clientHeight-15); this.waveformRenderer.drawClipWaveform(canvas,c,'7ba77b'); });
    }
    if(c.type==='video' && this.state.thumbnail) { const img=new Image(); img.src=this.state.thumbnail; img.className='clip-thumbnail'; el.prepend(img); }
    for(const side of ['l','r']) { const h=document.createElement('div'); h.className='tl-clip-handle tl-clip-handle-'+side; h.dataset.edge=side; el.append(h); }
    el.onmousedown=e=> {
      if(e.button!==0 || track.locked || e.target.isContentEditable) return;
      if(this.activeTool==='hand') return;
      e.stopPropagation(); e.preventDefault();
      if(this.activeTool==='razor') { this.trackManager.splitClip(c.id,this.timeAt(e)); return; }
      if(e.shiftKey) { if(this.selectedClipIds.has(c.id)) this.selectedClipIds.delete(c.id); else this.selectedClipIds.add(c.id); }
      else if(!this.selectedClipIds.has(c.id)) { this.selectedClipIds.clear(); this.selectedClipIds.add(c.id); }
      this.drag={type:e.target.dataset.edge || 'move', startX:e.clientX, clip:c, original:structuredClone(c), group:[...this.selectedClipIds].map(id=>this.trackManager.clips.get(id)).filter(x=>this.trackManager.canEdit(x)).map(x=>structuredClone(x))};
      this.highlight();
    };
    el.ondblclick=e=> { if(c.type!=='sub' || track.locked) return; e.stopPropagation(); content.contentEditable='true'; content.focus(); this.clock.seek(c.startTime);
      content.onkeydown=e=> { e.stopPropagation(); if(e.key==='Enter') { e.preventDefault(); content.blur(); } };
      content.onblur=()=> { c.text=content.textContent.trim(); c.name=c.text; this.trackManager.retimeWords(c); this.trackManager.changed(); };
    };
    el.oncontextmenu=e=> { e.preventDefault(); e.stopPropagation(); if(!track.locked) this.context(e,c); };
    return el;
  }
  highlight() { this.elTrack.querySelectorAll('.tl-clip').forEach(el=>el.classList.toggle('selected',this.selectedClipIds.has(el.dataset.clipId))); }
  drawRuler() {
    const canvas=this.rulerCanvas, w=this.elScroll.clientWidth, ratio=devicePixelRatio || 1;
    canvas.width=Math.max(1,w*ratio); canvas.height=24*ratio; canvas.style.width=w+'px'; canvas.style.left=this.elScroll.scrollLeft+'px';
    const ctx=canvas.getContext('2d'); ctx.scale(ratio,ratio); ctx.fillStyle='#1e1e1e'; ctx.fillRect(0,0,w,24); ctx.font='10px Segoe UI'; ctx.fillStyle='#888'; ctx.strokeStyle='#555';
    const fps=this.state.videoFps || 30;
    const step=[1/fps,5/fps,0.5,1,2,5,10,30,60,120,300,600,1800,3600].find(n=>n*this.pxPerSecond>=65) || 3600;
    const from=this.elScroll.scrollLeft/this.pxPerSecond, to=from+w/this.pxPerSecond;
    for(let t=Math.floor(from/step)*step;t<=to;t+=step) { const x=t*this.pxPerSecond-this.elScroll.scrollLeft; ctx.beginPath(); ctx.moveTo(x,18); ctx.lineTo(x,24); ctx.stroke(); ctx.fillText(AGTime.format(t,fps).slice(3),x+3,12); }
  }
  update() {
    const time=this.clock.time, fps=this.state.videoFps || 30;
    document.getElementById('tl-playhead').style.left=time*this.pxPerSecond+'px';
    document.getElementById('tl-current').textContent=AGTime.format(time,fps); document.getElementById('tl-duration').textContent=AGTime.format(this.duration,fps);
    document.getElementById('icon-play').style.display=this.clock.playing?'none':'block'; document.getElementById('icon-pause').style.display=this.clock.playing?'block':'none';
    const start=this.state.trimIn || 0, end=this.state.trimOut || this.duration;
    document.getElementById('tl-trim-in').style.left=start*this.pxPerSecond+'px'; document.getElementById('tl-trim-out').style.left=end*this.pxPerSecond+'px';
    document.getElementById('tl-shade-left').style.width=start*this.pxPerSecond+'px';
    const r=document.getElementById('tl-shade-right'); r.style.left=end*this.pxPerSecond+'px'; r.style.width=Math.max(0,this.duration-end)*this.pxPerSecond+'px';
  }
  snap(time, exclude=[]) {
    this.snapLine.hidden=true; if(!this.snapEnabled) return this.frame(time);
    const points=[0,this.clock.time];
    for(const c of this.trackManager.clips.values()) if(!exclude.includes(c.id)) points.push(c.startTime,c.startTime+c.duration);
    const p=points.sort((a,b)=>Math.abs(a-time)-Math.abs(b-time))[0];
    if(Math.abs(p-time)*this.pxPerSecond<=10) { this.snapLine.hidden=false; this.snapLine.style.left=p*this.pxPerSecond+'px'; return this.frame(p); }
    return this.frame(time);
  }
  zoom(value, clientX) {
    const x=clientX == null ? this.elScroll.clientWidth/2 : clientX-this.elScroll.getBoundingClientRect().left;
    const time=(this.elScroll.scrollLeft+x)/this.pxPerSecond;
    this.pxPerSecond=value; this.render(); this.elScroll.scrollLeft=time*this.pxPerSecond-x; this.drawRuler();
  }
  bind() {
    const $=id=>document.getElementById(id);
    $('tl-play').onclick=()=>this.clock.toggle(); $('tl-rewind').onclick=()=>this.clock.seek(this.state.trimIn || 0);
    $('tl-zoom').oninput=e=>this.zoom(Number(e.target.value)); $('tl-zoom-in').onclick=()=>this.zoom(this.pxPerSecond*1.3); $('tl-zoom-out').onclick=()=>this.zoom(this.pxPerSecond/1.3); $('tl-zoom-fit').onclick=()=>this.zoom(this.elScroll.clientWidth/this.duration, this.elScroll.getBoundingClientRect().left);
    for(const [id,tool] of [['tool-select','select'],['tool-razor','razor'],['tool-hand','hand']]) $(id).onclick=()=>this.setTool(tool);
    $('tool-snap').onclick=()=> { this.snapEnabled=!this.snapEnabled; $('tool-snap').classList.toggle('active',this.snapEnabled); };
    this.ruler.onmousedown=e=> { if(e.button!==0)return; e.stopPropagation(); this.drag={type:'seek'}; this.clock.seek(this.timeAt(e)); };
    $('tl-playhead').onmousedown=e=> { e.stopPropagation(); this.drag={type:'seek'}; };
    for(const side of ['in','out']) $('tl-trim-'+side).onmousedown=e=> { e.stopPropagation(); this.drag={type:side}; };
    this.elScroll.onmousedown=e=> {
      if(e.button!==0)return;
      if(this.activeTool==='hand') { this.drag={type:'hand',startX:e.clientX,scroll:this.elScroll.scrollLeft}; return; }
      if(e.target.closest('.tl-clip,#tl-ruler,#tl-playhead,.tl-marker'))return;
      this.drag={type:'box',x:e.clientX,y:e.clientY,initial:e.shiftKey?[...this.selectedClipIds]:[]};
      if(!e.shiftKey)this.selectedClipIds.clear(); this.highlight();
    };
    this.elScroll.addEventListener('scroll',()=> { this.elHeaders.scrollTop=this.elScroll.scrollTop; this.drawRuler(); });
    this.elHeaders.addEventListener('wheel',e=> { this.elScroll.scrollTop+=e.deltaY; e.preventDefault(); },{passive:false});
    this.elScroll.addEventListener('wheel',e=> { if(e.altKey) { e.preventDefault(); this.zoom(this.pxPerSecond*Math.exp(-e.deltaY/400),e.clientX); } else if(e.ctrlKey) { e.preventDefault(); this.elScroll.scrollLeft+=e.deltaY; } },{passive:false});
    window.addEventListener('mousemove',e=>this.move(e));
    window.addEventListener('mouseup',()=> {
      if(this.drag && ['l','r','move'].includes(this.drag.type)) this.trackManager.changed();
      if(this.drag && ['in','out'].includes(this.drag.type))EventBus.emit('project:changed');
      this.drag=null; this.snapLine.hidden=true; $('tl-marquee').style.display='none';
    });
    document.addEventListener('mousedown',e=> { if(!e.target.closest('#tl-context-menu')) $('tl-context-menu').style.display='none'; });
    window.addEventListener('keydown',e=> {
      if(e.target.closest('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open]') || [...document.querySelectorAll('.modal-overlay:not(.docked-export)')].some(el=>getComputedStyle(el).display!=='none'))return;
      if(e.ctrlKey || e.metaKey || e.altKey)return;
      const key=e.key.toLowerCase();
      if([' ','arrowleft','arrowright','delete','backspace','j','k','l','i','o','v','c','h'].includes(key))e.preventDefault();
      if(key===' ')this.clock.toggle(); if(key==='arrowleft')this.clock.step(-1); if(key==='arrowright')this.clock.step(1);
      if(key==='k')this.clock.pause(); if(key==='j')this.clock.play(this.clock.rate<0?Math.max(-4,this.clock.rate-1):-1); if(key==='l')this.clock.play(this.clock.playing && this.clock.rate>0?Math.min(4,this.clock.rate+1):1);
      if(key==='v')this.setTool('select'); if(key==='c')this.setTool('razor'); if(key==='h')this.setTool('hand'); if(key==='s')$('tool-snap').click();
      if(key==='i' || key==='o')this.setMark(key==='i'?'in':'out',this.clock.time);
      if(key==='delete' || key==='backspace') { [...this.selectedClipIds].forEach(id=>this.trackManager.deleteClip(id)); this.selectedClipIds.clear(); this.render(); }
    });
    EventBus.on('sequence:timeupdate',()=>this.update()); EventBus.on('tracks:changed',()=>this.render());
    EventBus.on('subtitles:toggle',()=> { this.trackManager.subTrack.visible=!this.trackManager.subTrack.visible; this.trackManager.changed(); });
  }
  setMark(side,time) {
    const frame=1/(this.state.videoFps || 30);
    if(side==='in') { this.state.trimIn=Math.max(0,Math.min(time,this.duration-frame)); this.state.trimOut=Math.max(this.state.trimIn+frame,this.state.trimOut); }
    else { this.state.trimOut=Math.max(frame,Math.min(time,this.duration)); this.state.trimIn=Math.min(this.state.trimIn,this.state.trimOut-frame); }
    this.update(); EventBus.emit('project:changed');
  }
  setTool(tool) { this.activeTool=tool; for(const t of ['select','razor','hand'])document.getElementById('tool-'+t).classList.toggle('active',tool===t); this.elScroll.style.cursor=tool==='hand'?'grab':tool==='razor'?'crosshair':'default'; }
  move(e) {
    const a=this.drag; if(!a)return;
    if(a.type==='seek') { this.clock.seek(Math.min(this.duration,this.timeAt(e))); return; }
    if(a.type==='in' || a.type==='out') { this.setMark(a.type,this.snap(this.timeAt(e))); return; }
    if(a.type==='hand') { this.elScroll.scrollLeft=a.scroll+a.startX-e.clientX; return; }
    if(a.type==='box') {
      const r={left:Math.min(a.x,e.clientX),top:Math.min(a.y,e.clientY),right:Math.max(a.x,e.clientX),bottom:Math.max(a.y,e.clientY)};
      const box=document.getElementById('tl-marquee'); Object.assign(box.style,{display:'block',left:r.left+'px',top:r.top+'px',width:r.right-r.left+'px',height:r.bottom-r.top+'px'});
      this.selectedClipIds=new Set(a.initial);
      this.elTrack.querySelectorAll('.tl-clip').forEach(el=> { const b=el.getBoundingClientRect(); if(b.left<r.right && b.right>r.left && b.top<r.bottom && b.bottom>r.top)this.selectedClipIds.add(el.dataset.clipId); }); this.highlight(); return;
    }
    const c=a.clip, o=a.original, speed=o.speed || 1, frame=1/(this.state.videoFps || 30), dt=(e.clientX-a.startX)/this.pxPerSecond;
    if(a.type==='move') {
      let start=this.snap(o.startTime+dt,a.group.map(c=>c.id));
      if(this.snapLine.hidden) { const end=this.snap(o.startTime+dt+o.duration,a.group.map(c=>c.id)); if(!this.snapLine.hidden)start=end-o.duration; }
      const delta=Math.max(-Math.min(...a.group.map(c=>c.startTime)),start-o.startTime);
      for(const original of a.group) { const clip=this.trackManager.clips.get(original.id); clip.startTime=this.frame(original.startTime+delta); if(clip.words)clip.words=original.words.map(w=>({...w,start:w.start+delta,end:w.end+delta})); }
      const lane=document.elementFromPoint(e.clientX,e.clientY)?.closest('.tl-lane');
      if(lane?.dataset.trackType===c.type && !this.trackManager.getTrackById(lane.dataset.trackId).locked)c.trackId=lane.dataset.trackId;
    } else if(a.type==='l') {
      const min=c.type==='sub'?0:Math.max(0,o.startTime-(o.trimIn || 0)/speed);
      const start=Math.max(min,Math.min(o.startTime+o.duration-frame,this.snap(o.startTime+dt,[c.id])));
      c.startTime=start; c.duration=o.duration-(start-o.startTime); c.trimIn=(o.trimIn || 0)+(start-o.startTime)*speed;
      if(c.type==='sub')this.trackManager.retimeWords(c);
    } else if(a.type==='r') {
      const max=c.type==='sub'?Infinity:((c.fileDuration || this.state.videoDuration)-(c.trimIn || 0))/speed;
      c.duration=Math.max(frame,Math.min(max,this.snap(o.startTime+o.duration+dt,[c.id])-o.startTime)); c.trimOut=(c.trimIn || 0)+c.duration*speed;
      if(c.type==='sub')this.trackManager.retimeWords(c);
    }
    const snapHidden=this.snapLine.hidden; this.render(); this.snapLine.hidden=snapHidden; this.clock.sync();
  }
  context(e,c) {
    const menu=document.getElementById('tl-context-menu'); menu.replaceChildren();
    const edit=(title,value,commit)=> { const input=document.createElement('input'); input.value=value; input.setAttribute('aria-label',title); menu.replaceChildren(input); input.focus(); input.select(); input.onkeydown=e=> { e.stopPropagation(); if(e.key==='Enter') { commit(input.value); menu.style.display='none'; } if(e.key==='Escape')menu.style.display='none'; }; };
    const actions=[['Split at Playhead',()=>this.trackManager.splitClip(c.id,this.clock.time)],['Duplicate',()=>this.trackManager.duplicateClip(c.id)],['Rename',()=>edit('Name',c.name,value=>{c.name=value;if(c.type==='sub'){c.text=value;this.trackManager.retimeWords(c);}this.trackManager.changed();})],['Speed / Duration',()=>{
      const speed=document.createElement('input'),duration=document.createElement('input'),apply=document.createElement('button');
      speed.type=duration.type='number';speed.min=.25;speed.max=4;speed.step=.05;speed.value=c.speed || 1;speed.setAttribute('aria-label','Speed');duration.min=1/(this.state.videoFps || 30);duration.step=.01;duration.value=c.duration;duration.setAttribute('aria-label','Duration (seconds)');
      const sourceDuration=c.duration*(c.speed || 1);
      speed.oninput=()=>{if(Number(speed.value)>0)duration.value=sourceDuration/Number(speed.value);};duration.oninput=()=>{if(Number(duration.value)>0)speed.value=sourceDuration/Number(duration.value);};
      apply.textContent='Apply';apply.className='tl-menu-item';apply.onclick=()=>{if(Number(speed.value)<.25 || Number(speed.value)>4){speed.reportValidity();return;}this.trackManager.setSpeed(c.id,Number(speed.value));menu.style.display='none';};
      const label=document.createElement('label');label.textContent='Speed × / Duration (s)';menu.replaceChildren(label,speed,duration,apply);speed.focus();
    }],['Delete',()=>this.trackManager.deleteClip(c.id)]];
    actions.forEach(([name,action])=> { const b=document.createElement('button'); b.textContent=name;b.className='tl-menu-item';b.onclick=()=>{action();if(!menu.querySelector('input'))menu.style.display='none';};menu.append(b); });
    menu.style.display='block';menu.style.left=Math.min(e.clientX,innerWidth-190)+'px';menu.style.top=Math.min(e.clientY,innerHeight-190)+'px';
  }
}
window.TimelineEngine=TimelineEngine;
