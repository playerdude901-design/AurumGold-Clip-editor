class EditorHistory {
  constructor(state, timeline, sidebar) {
    this.state=state;this.timeline=timeline;this.sidebar=sidebar;this.undoStack=[];this.redoStack=[];this.last=null;this.restoring=false;
    EventBus.on('project:changed',()=>this.capture());
    EventBus.on('history:undo',()=>this.restore(this.undoStack,this.redoStack));
    EventBus.on('history:redo',()=>this.restore(this.redoStack,this.undoStack));
    window.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,[contenteditable="true"]'))return;if((e.ctrlKey || e.metaKey) && ['z','y'].includes(e.key.toLowerCase())){e.preventDefault();EventBus.emit(e.key.toLowerCase()==='y'||e.shiftKey?'history:redo':'history:undo');}});
  }
  snapshot() {const s=this.state;return JSON.stringify({cameras:s.cameras,trimIn:s.trimIn,trimOut:s.trimOut,subtitleStyle:s.subtitleStyle,tracks:this.timeline.trackManager.serialize()});}
  reset(){this.undoStack=[];this.redoStack=[];this.last=this.snapshot();}
  capture(){if(this.restoring || !this.state.filePath)return;const next=this.snapshot();if(next===this.last)return;if(this.last)this.undoStack.push(this.last);if(this.undoStack.length>100)this.undoStack.shift();this.last=next;this.redoStack=[];}
  restore(from,to){if(!from.length)return;this.restoring=true;to.push(this.snapshot());const text=from.pop(),data=JSON.parse(text);Object.assign(this.state,{cameras:data.cameras,trimIn:data.trimIn,trimOut:data.trimOut,subtitleStyle:data.subtitleStyle});this.timeline.trackManager.restore(data.tracks);this.sidebar.renderCameras();EventBus.emit('project:restored');this.last=text;EventBus.emit('project:changed');this.restoring=false;}
}
