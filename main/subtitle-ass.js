'use strict';
const S = require('../renderer/components/subtitle-style-model');
const n = v => String(Math.round(v*1000)/1000);
const color = hex => '&H'+hex.slice(5,7)+hex.slice(3,5)+hex.slice(1,3)+'&';
const alpha = opacity => '&H'+Math.round(255*(1-S.clamp(opacity,0,1))).toString(16).padStart(2,'0').toUpperCase()+'&';
function time(seconds) {
  const cs=Math.max(0,Math.round(seconds*100));
  return `${Math.floor(cs/360000)}:${String(Math.floor(cs/6000)%60).padStart(2,'0')}:${String(Math.floor(cs/100)%60).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}`;
}
// User text must never become an ASS override or a line break command.
const escape = text => String(text).replace(/\\/g,'＼').replace(/{/g,'｛').replace(/}/g,'｝').replace(/[\r\n]/g,' ');
function roundedPath(width,height,radius) {
  const w=width,h=height,r=Math.min(radius,w/2,h/2),k=.55228475;
  return `m ${n(r)} 0 l ${n(w-r)} 0 b ${n(w-r+k*r)} 0 ${n(w)} ${n(r-k*r)} ${n(w)} ${n(r)} l ${n(w)} ${n(h-r)} b ${n(w)} ${n(h-r+k*r)} ${n(w-r+k*r)} ${n(h)} ${n(w-r)} ${n(h)} l ${n(r)} ${n(h)} b ${n(r-k*r)} ${n(h)} 0 ${n(h-r+k*r)} 0 ${n(h-r)} l 0 ${n(r)} b 0 ${n(r-k*r)} ${n(r-k*r)} 0 ${n(r)} 0`;
}
function baseTags(s) {
  return `\\fn${s.font}\\fs${n(s.size)}\\b${s.bold?1:0}\\i${s.italic?1:0}\\c${color(s.color)}\\3c${color(s.outlineColor)}\\bord${s.outlineEnabled?n(s.outlineWidth):0}\\4c${color(s.shadowColor)}\\shad0\\q2`;
}
function keyframes(cue,s,layout) {
  const start=Math.round(cue.start*100),end=Math.round(cue.end*100),points=new Set([start,end]);
  const add=t=>points.add(S.clamp(Math.round(t*100),start,end));
  const transition=(a,b)=>{add(a);add(b);};
  if(!['None','Typewriter'].includes(s.animation))transition(cue.start,cue.start+s.entryDuration/1000);
  if(s.animation==='Pop In')add(cue.start+s.entryDuration*.0006);
  if(s.animation==='Pop In Bounce'){add(cue.start+s.entryDuration/1000*120/260);add(cue.start+s.entryDuration/1000*200/260);}
  if(s.exitEnabled && s.exitAnimation!=='None')transition(cue.end-s.exitDuration/1000,cue.end);
  if(s.wordAnimation!=='None' || s.animation==='Typewriter')for(const w of layout.words) {
    add(w.start);add(w.end);
    if(['Fade per word','Pop per word'].includes(s.wordAnimation)) {transition(w.start,w.start+.18);add(w.start+.108);}
  }
  // Products of simultaneous scale/fade transitions are nonlinear. Subdivide
  // only those overlaps, retaining ordinary ASS keyframes everywhere else.
  const overlaps = s.exitEnabled && cue.end-cue.start < (s.entryDuration+s.exitDuration)/1000;
  if(overlaps || ['Fade per word','Pop per word'].includes(s.wordAnimation)) {
    for(const [a,b] of [[cue.start,cue.start+s.entryDuration/1000],[cue.end-s.exitDuration/1000,cue.end]]) {
      for(let t=a+.02;t<b;t+=.02)add(t);
    }
  }
  return [...points].sort((a,b)=>a-b).map(t=>t/100);
}
function transform(point,layout,a) {return {x:layout.position.x+(point.x-layout.position.x)*a.scale+a.x,y:layout.position.y+(point.y-layout.position.y)*a.scale+a.y};}
function motionTags(p0,p1,scale0,scale1,opacity0,opacity1,ms) {
  let tags=(Math.abs(p0.x-p1.x)+Math.abs(p0.y-p1.y)<.001)
    ? `\\pos(${n(p0.x)},${n(p0.y)})` : `\\move(${n(p0.x)},${n(p0.y)},${n(p1.x)},${n(p1.y)},0,${ms})`;
  tags+=`\\fscx${n(scale0*100)}\\fscy${n(scale0*100)}`;
  const fadeIn=opacity0<1e-6 && opacity1>1-1e-6, fadeOut=opacity0>1-1e-6 && opacity1<1e-6;
  tags+=fadeIn?`\\fad(${ms},0)`:fadeOut?`\\fad(0,${ms})`:`\\alpha${alpha(opacity0)}`;
  let target='';
  if(Math.abs(scale0-scale1)>.00001)target+=`\\fscx${n(scale1*100)}\\fscy${n(scale1*100)}`;
  if(!fadeIn && !fadeOut && alpha(opacity0)!==alpha(opacity1))target+=`\\alpha${alpha(opacity1)}`;
  if(target)tags+=`\\t(0,${ms},${target})`;
  return tags;
}
function generate(blocks,defaults={}) {
  const lines=['[Script Info]','Title: AurumGold per-cue subtitles','ScriptType: v4.00+','PlayResX: 1080','PlayResY: 1920','WrapStyle: 2','ScaledBorderAndShadow: yes','',
    '[V4+ Styles]','Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1','',
    '[Events]','Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'];
  const emit=(layer,a,b,tags,text)=>{if(Math.round(b*100)>Math.round(a*100))lines.push(`Dialogue: ${layer},${time(a)},${time(b)},Default,,0,0,0,,{${tags}}${text}`);};
  for(const cue of blocks) {
    if(!String(cue.text || '').trim())continue;
    if(!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.start<0||cue.end<=cue.start)throw new Error('Un bloque tiene tiempos inválidos.');
    const s=S.normalize(cue.style || defaults);
    // IPC supplies native Canvas metrics. The synchronous API retains a fallback
    // for scripts running outside Electron, without introducing a dependency.
    const layout=cue._layout || S.layout(cue,s,text=>({width:[...text].length*s.size*.55,ascent:s.size*.8,descent:s.size*.2}));
    const keys=keyframes(cue,s,layout),base=baseTags(s);
    for(let i=0;i<keys.length-1;i++) {
      const a=keys[i],b=keys[i+1],ms=Math.round((b-a)*1000),mid=(a+b)/2;
      const anim0=S.animation(s,a-cue.start,cue.end-cue.start),anim1=S.animation(s,b-cue.start,cue.end-cue.start);
      for(const box of S.boxes(s,layout,mid)) {
        const p0=transform(box,layout,anim0),p1=transform(box,layout,anim1);
        const tags=`\\an7\\bord0\\shad0\\c${color(box.color)}${motionTags(p0,p1,anim0.scale,anim1.scale,anim0.alpha*box.opacity,anim1.alpha*box.opacity,ms)}\\p1`;
        emit(0,a,b,tags,roundedPath(box.width,box.height,box.radius));
      }
      for(const word of layout.words) {
        const current=S.wordState(s,word,mid);if(!current.visible)continue;
        const v0=S.wordState(s,word,a+1e-7),v1=S.wordState(s,word,b-1e-7);
        const center={x:word.x+word.width/2,y:word.y+word.height/2};
        const p0=transform(center,layout,anim0),p1=transform(center,layout,anim1);
        // ASS sizes use the font's full ascent/descent, whereas CSS sizes use
        // its em square. Convert their scale so the requested pixel size agrees.
        const fontScale=(word.ascent+word.descent)/s.size;
        const motion=motionTags(p0,p1,anim0.scale*v0.scale*fontScale,anim1.scale*v1.scale*fontScale,anim0.alpha*v0.alpha,anim1.alpha*v1.alpha,ms);
        const text=escape(word.word);
        // Each fragment retains its word duration in centiseconds. Both karaoke
        // colours are equal here: explicit timestamp intervals clear the active
        // highlight at word.end (including silence), unlike cumulative ASS \k.
        const karaoke=s.wordAnimation==='None'?'':`\\k${Math.max(0,Math.round((word.end-word.start)*100))}`;
        if(s.shadowEnabled) {
          if(s.shadowOffsetX || s.shadowOffsetY) {
            // A shadow-only event isolates blur from the sharp foreground.
            // Animate only shadow alpha; hidden face/border must stay hidden.
            const shadowMotion=motion.replace(/\\alpha/g,'\\4a');
            const shadow=`\\shad${n(Math.hypot(s.shadowOffsetX,s.shadowOffsetY))}\\xshad${n(s.shadowOffsetX)}\\yshad${n(s.shadowOffsetY)}`;
            emit(1,a,b,`${base}\\an5${shadowMotion}\\b${current.bold?1:0}\\u${current.underline?1:0}${shadow}\\1a&HFF&\\3a&HFF&\\blur${n(s.shadowBlur/2)}`,text);
          } else {
            // libass disables a native shadow at (0,0); a blurred silhouette
            // supports that useful soft-glow case without changing its offset.
            emit(1,a,b,`${base}\\an5${motion}\\b${current.bold?1:0}\\u${current.underline?1:0}\\c${color(s.shadowColor)}\\3c${color(s.shadowColor)}\\blur${n(s.shadowBlur/2)}`,text);
          }
        }
        emit(2,a,b,`${base}\\an5${motion}\\b${current.bold?1:0}\\u${current.underline?1:0}\\c${color(current.color)}\\2c${color(current.color)}${karaoke}`,text);
      }
    }
  }
  return lines.join('\r\n');
}
module.exports={generate,time,color,escape,roundedPath};
