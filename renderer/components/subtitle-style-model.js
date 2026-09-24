/* Shared, serializable subtitle model. Coordinates always use 1080 × 1920. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SubtitleStyle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const fonts = ['Arial', 'Impact', 'Montserrat', 'Bebas Neue', 'Oswald', 'Roboto', 'Anton'];
  const entries = ['None', 'Fade In', 'Pop In', 'Pop In Bounce', 'Slide Up', 'Slide Down', 'Slide Left', 'Slide Right', 'Zoom In', 'Typewriter', 'Fade + Slide Up'];
  const exits = ['None', 'Fade Out', 'Pop Out', 'Slide Down', 'Slide Up'];
  const words = ['None', 'Color highlight', 'Bold highlight', 'Scale highlight', 'Underline', 'Box highlight', 'Fade per word', 'Pop per word'];
  const defaults = Object.freeze({
    font: 'Montserrat', size: 72, color: '#FFFFFF', bold: true, italic: false, uppercase: false,
    outlineEnabled: true, outlineColor: '#000000', outlineWidth: 3,
    shadowEnabled: false, shadowColor: '#000000', shadowBlur: 6, shadowOffsetX: 2, shadowOffsetY: 2,
    animation: 'Pop In', entryDuration: 250, exitEnabled: false, exitAnimation: 'None', exitDuration: 200,
    wordAnimation: 'Color highlight', highlightColor: '#FFD700', inactiveColor: '#FFFFFF',
    verticalPosition: 'bottom', horizontalPosition: 'center', marginV: 120, marginH: 0, anchor: 2, maxWidth: 90,
    bgEnabled: false, bgType: 'Per word', bgColor: '#000000', bgOpacity: 0.6, bgRadius: 6, bgPadding: 12
  });
  const ranges = {size:[40,140], outlineWidth:[0,8], shadowBlur:[0,20], shadowOffsetX:[-10,10], shadowOffsetY:[-10,10], entryDuration:[100,600], exitDuration:[100,600], marginV:[-200,200], marginH:[-300,300], anchor:[1,9], maxWidth:[40,100], bgOpacity:[0,1], bgRadius:[0,20], bgPadding:[0,30]};
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  function normalize(input = {}) {
    input = input || {};
    const legacy = {...input};
    for (const [old, key] of Object.entries({fontName:'font',fontSize:'size',textColor:'color',bgBox:'bgEnabled'})) {
      if (legacy[key] == null && input[old] != null) legacy[key] = input[old];
    }
    if (legacy.inactiveColor == null) legacy.inactiveColor = legacy.color ?? defaults.color;
    if (legacy.wordAnimation == null && input.highlightEnabled != null) legacy.wordAnimation = input.highlightEnabled ? 'Color highlight' : 'None';
    if (legacy.shadowEnabled == null && input.shadowWidth != null) {
      legacy.shadowEnabled = input.shadowWidth > 0;
      legacy.shadowOffsetX = legacy.shadowOffsetY = input.shadowWidth;
    }
    const s = {...defaults};
    for (const key of Object.keys(s)) if (legacy[key] != null) s[key] = legacy[key];
    for (const [key, [min,max]] of Object.entries(ranges)) s[key] = clamp(Number.isFinite(Number(s[key])) ? Number(s[key]) : defaults[key], min, max);
    s.anchor = Math.round(s.anchor);
    for (const key of Object.keys(defaults)) {
      if (typeof defaults[key] === 'boolean') s[key] = !!s[key];
      if (/color$/i.test(key)) s[key] = /^#[a-f\d]{6}$/i.test(s[key]) ? s[key].toUpperCase() : defaults[key];
    }
    for (const [key, options] of Object.entries({font:fonts, animation:entries, exitAnimation:exits, wordAnimation:words, verticalPosition:['top','center','bottom'], horizontalPosition:['left','center','right'], bgType:['Per word','Per line','Per block']})) {
      if (!options.includes(s[key])) s[key] = defaults[key];
    }
    return s;
  }
  const presets = [
    {name:'TikTok Bold',style:normalize({font:'Impact',size:80,bold:true,wordAnimation:'None',bgEnabled:true,bgType:'Per word',bgOpacity:.6,animation:'Pop In'})},
    {name:'Subtítulo Limpio',style:normalize({font:'Arial',size:64,bold:false,outlineEnabled:false,shadowEnabled:true,shadowBlur:6,wordAnimation:'None',animation:'Fade In',entryDuration:200})},
    {name:'Karaoke Neon',style:normalize({font:'Montserrat',size:72,bold:true,highlightColor:'#00FFFF',animation:'Slide Up',entryDuration:220})},
    {name:'Cinematic',style:normalize({font:'Bebas Neue',size:90,bold:false,wordAnimation:'None',bgEnabled:false,animation:'Fade + Slide Up',entryDuration:200})}
  ];
  function cueWords(cue, s) {
    const tokens = String(cue.text || '').match(/\S+/g) || [];
    const original = cue.words || [];
    const match = original.length === tokens.length && original.every((w,i) => String(w.word).trim() === tokens[i]);
    // Export In/Out and split clips can retain only some timestamped words while
    // keeping the original cue text. Match that subsequence instead of inventing
    // new timings for words that were outside the selected range.
    const mapped = new Map(); let cursor = 0;
    for (const w of original) {
      const found = tokens.indexOf(String(w.word).trim(),cursor);
      if(found<0){mapped.clear();break;}mapped.set(found,w);cursor=found+1;
    }
    const partial = !match && original.length>0 && mapped.size===original.length;
    const first = partial ? Math.min(...mapped.keys()) : 0;
    const duration = Math.max(0, cue.end - cue.start);
    return tokens.map((word,i) => {
      const source=match ? original[i] : partial ? mapped.get(i) : null;
      return {word:s.uppercase ? word.toUpperCase() : word,
        start:source && Number.isFinite(source.start) ? clamp(source.start,cue.start,cue.end) : partial ? (i<first?cue.start:cue.end) : cue.start+duration*i/tokens.length,
        end:source && Number.isFinite(source.end) ? clamp(source.end,cue.start,cue.end) : partial ? (i<first?cue.start:cue.end) : cue.start+duration*(i+1)/tokens.length};
    });
  }
  function position(s) {
    return {
      x: (s.horizontalPosition === 'left' ? 60 : s.horizontalPosition === 'right' ? 1020 : 540) + (s.horizontalPosition === 'right' ? -s.marginH : s.marginH),
      y: (s.verticalPosition === 'top' ? 60+s.marginV : s.verticalPosition === 'center' ? 960+s.marginV : 1920-s.marginV)
    };
  }
  function fontCSS(s, bold = s.bold) { return `${s.italic ? 'italic ' : ''}${bold ? '700' : '400'} ${s.size}px "${s.font}"`; }
  function layout(cue, s, measure) {
    const tokens = cueWords(cue,s), space = measure(' ',s).width;
    const max = 1080*s.maxWidth/100, lineHeight = s.size*1.22;
    const lines = [{words:[],width:0}];
    let index = 0;
    // Explicit newlines and long single words wrap without losing word timestamps.
    const chunks = String(cue.text || '').split(/(\s+)/).filter(Boolean);
    let forceLine = false;
    for (const chunk of chunks) {
      if (/^\s+$/.test(chunk)) { if (/\n/.test(chunk)) forceLine = true; continue; }
      const token = tokens[index++]; if (!token) continue;
      const parts = []; let part = '';
      for (const char of token.word) {
        if (part && measure(part+char,s).width > max) { parts.push(part); part = ''; }
        part += char;
      }
      if (part) parts.push(part);
      parts.forEach((text, partIndex) => {
        const metrics = measure(text,s), width = metrics.width;
        let line = lines.at(-1);
        if (line.words.length && (forceLine || partIndex > 0 || line.width+space+width > max)) { line = {words:[],width:0}; lines.push(line); }
        const x = line.width + (line.words.length ? space : 0);
        line.words.push({...token,word:text,index:index-1,x,width,ascent:metrics.ascent ?? s.size*.8,descent:metrics.descent ?? s.size*.2});
        line.width = x+width; forceLine = false;
      });
    }
    const width = Math.max(0,...lines.map(l=>l.width)), height = lines.length*lineHeight;
    const anchorX = ((s.anchor-1)%3)/2, anchorY = 1-Math.floor((s.anchor-1)/3)/2;
    const pos = position(s), left = pos.x-width*anchorX, top = pos.y-height*anchorY;
    const items = [];
    lines.forEach((line,i) => {
      line.x = left+(width-line.width)*anchorX; line.y = top+i*lineHeight; line.height = lineHeight;
      line.words.forEach(w=> { w.x += line.x; w.y = line.y; w.height = lineHeight; items.push(w); });
    });
    return {x:left,y:top,width,height,lineHeight,position:pos,lines,words:items};
  }
  function animation(s, elapsed, duration) {
    const p = clamp(elapsed/(s.entryDuration/1000),0,1), a = {x:0,y:0,scale:1,alpha:1};
    const lerp = (x,y,t)=>x+(y-x)*t;
    if (s.animation === 'Fade In' || s.animation === 'Fade + Slide Up') a.alpha = p;
    if (s.animation === 'Zoom In') a.scale = p;
    if (s.animation === 'Pop In') a.scale = p < .6 ? lerp(1,1.15,p/.6) : lerp(1.15,1,(p-.6)/.4);
    if (s.animation === 'Pop In Bounce') a.scale = p < 120/260 ? lerp(1,1.2,p/(120/260)) : p < 200/260 ? lerp(1.2,.95,(p-120/260)/(80/260)) : lerp(.95,1,(p-200/260)/(60/260));
    if (s.animation === 'Slide Up') a.y = 40*(1-p);
    if (s.animation === 'Fade + Slide Up') a.y = 30*(1-p);
    if (s.animation === 'Slide Down') a.y = -40*(1-p);
    if (s.animation === 'Slide Left') a.x = 60*(1-p);
    if (s.animation === 'Slide Right') a.x = -60*(1-p);
    if (s.exitEnabled) {
      const q = clamp((elapsed-duration+s.exitDuration/1000)/(s.exitDuration/1000),0,1);
      if (s.exitAnimation === 'Fade Out') a.alpha *= 1-q;
      if (s.exitAnimation === 'Pop Out') a.scale *= 1-q;
      if (s.exitAnimation === 'Slide Down') a.y += 40*q;
      if (s.exitAnimation === 'Slide Up') a.y -= 40*q;
    }
    return a;
  }
  function wordState(s,w,time) {
    const active = time >= w.start && time < w.end;
    const reveal = s.animation === 'Typewriter' || ['Fade per word','Pop per word'].includes(s.wordAnimation);
    const p = clamp((time-w.start)/.18,0,1);
    return {active, visible:!reveal || time>=w.start,
      color:s.wordAnimation === 'None' ? s.color : active && s.wordAnimation === 'Color highlight' ? s.highlightColor : s.inactiveColor,
      bold:s.bold || (active && s.wordAnimation === 'Bold highlight'), underline:active && s.wordAnimation === 'Underline',
      scale:s.wordAnimation === 'Pop per word' ? (p<.6 ? p/.6*1.12 : 1.12-(p-.6)/.4*.12) : active && s.wordAnimation === 'Scale highlight' ? 1.05 : 1,
      alpha:s.wordAnimation === 'Fade per word' ? p : 1};
  }
  function boxes(s,l,time) {
    const list = [];
    if (s.bgEnabled) {
      const items = s.bgType === 'Per block' ? [l] : s.bgType === 'Per line' ? l.lines : l.words.filter(w=>wordState(s,w,time).visible);
      for (const r of items) list.push({...r,color:s.bgColor,opacity:s.bgOpacity});
    }
    if (s.wordAnimation === 'Box highlight') for (const w of l.words) if (wordState(s,w,time).active) list.push({...w,color:s.highlightColor,opacity:1});
    return list.map(r=>({x:r.x-s.bgPadding,y:r.y-s.bgPadding,width:r.width+2*s.bgPadding,height:r.height+2*s.bgPadding,color:r.color,opacity:r.opacity,radius:s.bgRadius}));
  }
  return {fonts,entries,exits,words,defaults,presets,ranges,normalize,clamp,cueWords,position,fontCSS,layout,animation,wordState,boxes};
});
