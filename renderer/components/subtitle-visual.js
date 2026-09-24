/* Native Canvas 2D renderer and layout measurement shared by both previews. */
const SubtitleVisual = (() => {
  const measureCanvas = document.createElement('canvas');
  const measureContext = measureCanvas.getContext('2d');
  function measure(text,s) {
    measureContext.font = SubtitleStyle.fontCSS(s);
    const m = measureContext.measureText(text);
    return {width:m.width,ascent:m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent,descent:m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent};
  }
  function prepare(cues,defaults) {
    return cues.map(cue=> {
      const style = SubtitleStyle.normalize(cue.style || defaults);
      return {...cue,style,_layout:SubtitleStyle.layout(cue,style,measure)};
    });
  }
  function draw(ctx,cue,defaults,time,width,height) {
    if (!cue || time < cue.start || time >= cue.end) return;
    const S = SubtitleStyle, s = S.normalize(cue.style || defaults);
    const l = S.layout(cue,s,measure), a = S.animation(s,time-cue.start,cue.end-cue.start);
    ctx.save(); ctx.scale(width/1080,height/1920);
    ctx.translate(l.position.x+a.x,l.position.y+a.y);ctx.scale(a.scale,a.scale);ctx.translate(-l.position.x,-l.position.y);
    for (const box of S.boxes(s,l,time)) {
      ctx.save();ctx.globalAlpha=a.alpha*box.opacity;ctx.fillStyle=box.color;
      ctx.beginPath();ctx.roundRect(box.x,box.y,box.width,box.height,Math.min(box.radius,box.width/2,box.height/2));ctx.fill();ctx.restore();
    }
    for (const w of l.words) {
      const v = S.wordState(s,w,time); if (!v.visible) continue;
      ctx.save();ctx.globalAlpha=a.alpha*v.alpha;
      ctx.translate(w.x+w.width/2,w.y+w.height/2);ctx.scale(v.scale,v.scale);
      ctx.font=S.fontCSS(s,v.bold);ctx.textAlign='center';ctx.textBaseline='alphabetic';
      const baseline=(w.ascent-w.descent)/2;
      if (s.shadowEnabled) {ctx.shadowColor=s.shadowColor;ctx.shadowBlur=s.shadowBlur;ctx.shadowOffsetX=s.shadowOffsetX;ctx.shadowOffsetY=s.shadowOffsetY;}
      if (s.outlineEnabled && s.outlineWidth>0) {ctx.lineJoin='round';ctx.lineWidth=s.outlineWidth*2;ctx.strokeStyle=s.outlineColor;ctx.strokeText(w.word,0,baseline);}
      ctx.fillStyle=v.color;ctx.fillText(w.word,0,baseline);
      if(v.underline) {ctx.fillRect(-w.width/2,baseline+3,w.width,Math.max(2,s.size/18));}
      ctx.restore();
    }
    ctx.restore();
  }
  return {draw,prepare,measure};
})();
