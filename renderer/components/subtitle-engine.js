class SubtitleTranscription {
  static sequenceBlocks(words, manager) {
    const mapped=[];
    const clips=manager.videoTracks.filter(t=>t.visible).flatMap(t=>[...manager.clips.values()].filter(c=>c.type==='video' && c.trackId===t.id));
    for(const c of clips) {
      const sourceStart=c.trimIn || 0, speed=c.speed || 1, sourceEnd=sourceStart+c.duration*speed;
      for(const w of words) {
        if(w.end<=sourceStart || w.start>=sourceEnd)continue;
        const start=c.startTime+(Math.max(sourceStart,w.start)-sourceStart)/speed;
        const end=c.startTime+(Math.min(sourceEnd,w.end)-sourceStart)/speed;
        const visible=clips.filter(other=>start>=other.startTime && start<other.startTime+other.duration).at(-1);
        if(visible?.id===c.id)mapped.push({...w,start,end});
      }
    }
    mapped.sort((a,b)=>a.start-b.start);
    const blocks=[];let group=[];
    const flush=()=>{if(!group.length)return;blocks.push({id:crypto.randomUUID(),start:group[0].start,end:group.at(-1).end,text:group.map(w=>w.word).join(' '),words:group});group=[];};
    for(const word of mapped){if(group.length && word.start-group.at(-1).end>.6)flush();group.push(word);if(group.length===4 || /[.!?]$/.test(word.word))flush();}flush();
    return blocks;
  }
  constructor(state, editor) {
    this.state=state;this.editor=editor;this.busy=false;
    document.getElementById('btn-transcribe-audio').onclick=()=>this.run();
  }
  async run() {
    if(this.busy || !this.state.filePath)return;
    this.busy=true;
    const button=document.getElementById('btn-transcribe-audio'),status=document.getElementById('transcribe-status');
    const overlay=document.getElementById('transcribe-overlay');button.disabled=true;overlay.style.display='flex';
    status.textContent='Transcribiendo…'; console.log('[AG-Transcribe] paso 1: click renderer');
    try {
      console.log('[AG-Transcribe] paso 2: invocar IPC');
      const result=await window.electronAPI.transcribeAudio({filePath:this.state.filePath,trimIn:0,trimOut:this.state.videoDuration,language:document.getElementById('transcribe-lang-select').value});
      console.log('[AG-Transcribe] paso 6: resultado renderer',result.success,result.words?.length);
      if(!result.success)throw new Error(result.error);
      const blocks=SubtitleTranscription.sequenceBlocks(result.words || result.blocks.flatMap(b=>b.words),this.state.timeline.trackManager);
      status.textContent=`${blocks.length} bloques. Revisa y aplica los subtítulos.`;
      this.editor.open(blocks,({blocks,styleConfig})=>{this.state.subtitles=blocks;this.state.subtitleStyle=styleConfig;EventBus.emit('subtitles:changed');});
    } catch(e) {
      status.textContent=`Error: ${e.message}`; console.error('[AG-Transcribe] error',e);
      this.editor.open(this.state.subtitles,({blocks,styleConfig})=>{this.state.subtitles=blocks;this.state.subtitleStyle=styleConfig;EventBus.emit('subtitles:changed');});
      const error=document.createElement('p');error.className='transcription-error';error.textContent=status.textContent;this.editor.elBlockList.prepend(error);
    } finally {this.busy=false;button.disabled=false;overlay.style.display='none';EventBus.emit('layout:tab','subtitles');}
  }
}
