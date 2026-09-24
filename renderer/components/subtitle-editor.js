/* Cue editing and ordered multi-selection. Style edits are isolated patches. */
class SubtitleEditor {
  constructor(state) {
    this.state=state;this.blocks=[];this.selected=new Set();this.isOpen=false;this.applying=false;
    this.styleConfig=SubtitleStyle.normalize(state.subtitleStyle);state.subtitleStyle={...this.styleConfig};
    this.elOverlay=document.getElementById('subtitle-editor-overlay');
    this.elOverlay.addEventListener('keydown',e=>e.stopPropagation());
    this.elBlockList=document.getElementById('sub-block-list');this.elBlockList.tabIndex=0;
    this.elBlockList.setAttribute('aria-label','Bloques de subtítulos');
    this.host=document.querySelector('.sub-col-styles');this.home=this.host.parentElement;
    document.querySelector('#subtitle-editor-modal .sub-col-preview')?.remove();
    this.properties=new SubtitleProperties(this.host,patch=>this.patch(patch),()=>this.currentStyle());
    this.properties.replay.onclick=()=>{this.previewEpoch=performance.now();};
    document.getElementById('sub-editor-close').onclick=()=>this.cancel();
    document.getElementById('sub-editor-cancel').onclick=()=>this.cancel();
    document.getElementById('sub-editor-confirm').onclick=()=>this.apply();
    const add=document.getElementById('sub-btn-add-block');add.textContent='+ Añadir bloque';add.onclick=()=>this.add();
    document.querySelector('.sub-col-blocks .sub-col-title').textContent='BLOQUES';
    this.elBlockList.addEventListener('click',e=>{if(!e.target.closest('.sub-block-card')){this.selected.clear();this.syncSelection();}});
    document.addEventListener('keydown',e=>{
      if(!this.isOpen)return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a') {
        e.preventDefault();e.stopImmediatePropagation();this.selected=new Set(this.blocks.map(b=>b.id));this.syncSelection();
      }
      if(e.key==='Escape'&&!this.applying){e.stopImmediatePropagation();this.cancel();}
    },true);
    EventBus.on('project:restored',()=>{if(this.isOpen)this.cancel();this.styleConfig=SubtitleStyle.normalize(state.subtitleStyle);state.subtitleStyle={...this.styleConfig};this.syncSelection();});
    EventBus.on('video:loaded',()=>{if(this.isOpen)this.cancel();});
    queueMicrotask(()=>SubtitleStyleStore.attach(state));
    this.previewEpoch=performance.now();this.syncSelection();
    const tick=()=>{if(this.isOpen || !document.getElementById('panel-subtitles').hidden)this.drawPreview();requestAnimationFrame(tick);};requestAnimationFrame(tick);
  }
  currentStyle() {const id=this.selected.values().next().value;return this.blocks.find(b=>b.id===id)?.style || this.styleConfig;}
  open(initialBlocks=[],onConfirm,onCancel) {
    this.styleConfig=SubtitleStyle.normalize(this.state.subtitleStyle);
    this.blocks=structuredClone(initialBlocks).map(b=>({...b,id:b.id || crypto.randomUUID(),style:SubtitleStyle.normalize(b.style || this.styleConfig)}));
    this.selected.clear();this.onConfirmCallback=onConfirm;this.onCancelCallback=onCancel;this.isOpen=true;
    this.properties.notice.textContent='';this.previewEpoch=performance.now();
    document.querySelector('#subtitle-editor-modal .sub-editor-layout').append(this.host);
    EventBus.emit('layout:tab','subtitles');console.log('[AG-Transcribe] paso 7: abrir editor',this.blocks.length);
    this.elOverlay.style.display='flex';this.render();this.syncSelection();this.elBlockList.focus();
  }
  close() {this.isOpen=false;this.elOverlay.style.display='none';this.selected.clear();this.home.append(this.host);this.syncSelection();}
  cancel() {if(this.applying)return;this.styleConfig=SubtitleStyle.normalize(this.state.subtitleStyle);this.close();this.onCancelCallback?.();}
  select(id,additive=false) {if(!additive)this.selected.clear();this.selected.add(id);this.previewEpoch=performance.now();this.syncSelection();}
  syncSelection() {
    const count=this.selected.size,first=this.selected.values().next().value;
    const header=count===0?'Estilo por defecto':count===1?`Editando: bloque ${this.blocks.findIndex(b=>b.id===first)+1}`:`Editando: ${count} bloques`;
    for(const card of this.elBlockList.querySelectorAll('.sub-block-card')) {const active=this.selected.has(card.dataset.id);card.classList.toggle('selected',active);card.setAttribute('aria-selected',String(active));}
    this.properties.sync(this.currentStyle(),header);this.drawPreview();
  }
  patch(patch) {
    if(this.applying)return;
    if(patch.animation && patch.entryDuration==null)patch={...patch,entryDuration:({'Fade In':200,'Pop In':250,'Pop In Bounce':260,'Slide Up':220,'Slide Down':220,'Slide Left':220,'Slide Right':220,'Zoom In':250,'Fade + Slide Up':200})[patch.animation] || this.currentStyle().entryDuration};
    if(this.selected.size) {for(const cue of this.blocks)if(this.selected.has(cue.id))cue.style=SubtitleStyle.normalize({...cue.style,...patch});}
    else {
      // Freeze legacy cues before changing defaults for future cues.
      for(const cue of this.state.subtitles || [])cue.style=SubtitleStyle.normalize(cue.style || this.state.subtitleStyle);
      this.styleConfig=SubtitleStyle.normalize({...this.styleConfig,...patch});
      if(!this.isOpen) {this.state.subtitleStyle={...this.styleConfig};this.state.timeline?.trackManager.syncSubtitlesFromState();EventBus.emit('project:changed');}
    }
    this.syncSelection();
  }
  render() {
    this.elBlockList.replaceChildren();
    document.querySelector('#subtitle-editor-modal .modal-title').textContent=`Subtítulos — ${this.blocks.length} bloques`;
    document.getElementById('sub-editor-confirm').textContent='Aplicar';
    const hint=document.createElement('p');hint.className='sub-selection-hint';hint.textContent='Shift + clic: añadir · Ctrl + A: todos';this.elBlockList.append(hint);
    if(!this.blocks.length){const p=document.createElement('p');p.className='panel-empty';p.textContent='Sin bloques. Añade un subtítulo para comenzar.';this.elBlockList.append(p);}
    const format=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(2).padStart(5,'0')}`;
    const parse=t=>{const parts=t.trim().split(':').map(Number);return parts.length===2?parts[0]*60+parts[1]:parts.length===1?parts[0]:NaN;};
    this.blocks.forEach((cue,index)=>{
      const card=document.createElement('div');card.className='sub-block-card';card.dataset.id=cue.id;card.tabIndex=0;card.setAttribute('role','option');
      card.addEventListener('click',e=>{if(!e.target.closest('.sub-delete-block'))this.select(cue.id,e.shiftKey);});
      card.addEventListener('keydown',e=>{if(e.target===card && ['Enter',' '].includes(e.key)){e.preventDefault();this.select(cue.id,e.shiftKey);}});
      const title=document.createElement('span');title.className='sub-block-number';title.textContent=`Bloque ${index+1}`;
      const times=document.createElement('div');times.className='sub-block-times';
      for(const key of ['start','end']) {
        const input=document.createElement('input');input.className='sub-time-input';input.value=format(cue[key]);input.setAttribute('aria-label',`${key} bloque ${index+1}`);
        input.onchange=()=>{
          const value=parse(input.value),oldStart=cue.start,oldEnd=cue.end;
          if(!Number.isFinite(value)||value<0||(key==='end'?value<=cue.start:value>=cue.end)){input.value=format(cue[key]);return;}
          cue[key]=value;cue.words=(cue.words||[]).map(w=>({...w,start:cue.start+(w.start-oldStart)/(oldEnd-oldStart)*(cue.end-cue.start),end:cue.start+(w.end-oldStart)/(oldEnd-oldStart)*(cue.end-cue.start)}));this.previewEpoch=performance.now();
        };times.append(input);
      }
      const del=document.createElement('button');del.className='sub-delete-block';del.textContent='✕';del.setAttribute('aria-label',`Eliminar bloque ${index+1}`);
      del.onclick=e=>{e.stopPropagation();if(this.applying)return;this.blocks=this.blocks.filter(b=>b!==cue);this.selected.delete(cue.id);this.render();};times.append(del);
      const text=document.createElement('div');text.className='sub-block-text';text.contentEditable='true';text.textContent=cue.text;text.setAttribute('role','textbox');text.setAttribute('aria-label',`Texto bloque ${index+1}`);
      text.onfocus=()=>{this.state.timeline?.engine.clock.seek(cue.start);};
      text.oninput=()=>{cue.text=text.innerText;cue.words=[];cue.words=SubtitleStyle.cueWords(cue,{...cue.style,uppercase:false});};
      text.onpaste=e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));};
      card.append(title,times,text);this.elBlockList.append(card);
    });this.syncSelection();
  }
  add() {
    if(this.applying)return;const start=this.blocks.length?Math.max(...this.blocks.map(b=>b.end))+.2:0;
    const cue={id:crypto.randomUUID(),start,end:start+2,text:'Nuevo subtítulo',style:{...this.styleConfig},words:[]};
    cue.words=SubtitleStyle.cueWords(cue,{...cue.style,uppercase:false});this.blocks.push(cue);this.selected=new Set([cue.id]);this.previewEpoch=performance.now();this.render();
  }
  async apply() {
    if(this.applying)return;this.applying=true;
    const button=document.getElementById('sub-editor-confirm');button.disabled=true;button.textContent='Aplicando…';this.host.inert=true;this.elBlockList.inert=true;
    try {
      const blocks=structuredClone(this.blocks),styleConfig={...this.styleConfig};
      const result=await window.electronAPI.generateAss({blocks,styleConfig,resolution:'1080p'});
      if(!result.success)throw new Error(result.error || 'No se pudieron aplicar los subtítulos.');
      this.state.subtitleStyle={...styleConfig};this.onConfirmCallback?.({blocks,styleConfig,assPath:result.assPath});this.close();EventBus.emit('project:changed');
    } catch(e) {this.properties.notice.textContent=e.message;}
    finally {this.applying=false;button.disabled=false;button.textContent='Aplicar';this.host.inert=false;this.elBlockList.inert=false;}
  }
  drawPreview() {
    if(!this.properties)return;
    const canvas=this.properties.canvas,ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000000';ctx.fillRect(0,0,canvas.width,canvas.height);
    const selected=this.blocks.find(b=>b.id===this.selected.values().next().value);
    const cue=selected || {start:0,end:3,text:'Tu estilo de subtítulos',words:[],style:this.styleConfig};
    const duration=Math.max(.01,cue.end-cue.start),elapsed=(performance.now()-this.previewEpoch)/1000%(duration+.5);
    SubtitleVisual.draw(ctx,cue,this.styleConfig,cue.start+elapsed,canvas.width,canvas.height);
  }
}
