const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const S=require('../renderer/components/subtitle-style-model'),ASS=require('../main/subtitle-ass');
const cue=(style={})=>({id:'one',text:'hola mundo',start:1,end:3,words:[{word:'hola',start:1.2,end:1.5},{word:'mundo',start:2.1,end:2.6}],style:S.normalize(style)});
test('Legacy styles migrate; zeros, negative margins and independent objects survive',()=>{
 const s=S.normalize({fontName:'Arial',fontSize:80,textColor:'#abcdef',highlightEnabled:false,outlineWidth:0,bgOpacity:0,marginH:-120,marginV:0});
 assert.equal(s.font,'Arial');assert.equal(s.size,80);assert.equal(s.color,'#ABCDEF');assert.equal(s.wordAnimation,'None');assert.equal(s.outlineWidth,0);assert.equal(s.bgOpacity,0);assert.equal(s.marginV,0);assert.equal(s.marginH,-120);
 const a=S.normalize(s),b=S.normalize(s);a.color='#123456';assert.equal(b.color,'#ABCDEF');assert.equal(S.normalize({size:999}).size,140);
});
test('Word timing preserves leading silence and gaps, uppercase leaves source intact',()=>{
 const c=cue({uppercase:true});const words=S.cueWords(c,c.style);assert.equal(words[0].word,'HOLA');assert.equal(c.text,'hola mundo');assert.equal(words[0].start,1.2);
 assert(!S.wordState(c.style,words[0],1.1).active);assert(!S.wordState(c.style,words[0],1.7).active);assert(S.wordState(c.style,words[1],2.2).active);
 assert(!S.wordState({...c.style,animation:'Typewriter'},words[1],2).visible);
});
test('Layout wraps long words/newlines and honors nine independent anchors',()=>{
 for(let anchor=1;anchor<=9;anchor++) {
  const c=cue({anchor,maxWidth:40}),s=c.style,l=S.layout({...c,text:'extraordinarylongword\nsecond line'},s,t=>({width:t.length*60}));
  assert(l.lines.length>=4);assert(l.lines.every(line=>line.width<=432));
  assert.equal(l.x+l.width*((anchor-1)%3)/2,l.position.x);
  assert.equal(l.y+l.height*(1-Math.floor((anchor-1)/3)/2),l.position.y);
 }
});
test('Clipped export keeps retained timestamps without re-highlighting excluded words',()=>{
 const c={text:'uno dos tres',start:0,end:1,words:[{word:'dos',start:.2,end:.5}]};
 const w=S.cueWords(c,S.normalize());assert.equal(w[0].start,0);assert.equal(w[0].end,0);assert.equal(w[1].start,.2);assert.equal(w[1].end,.5);assert.equal(w[2].start,1);
});
test('Every animation has finite endpoints; karaoke fades and pops begin at word.start',()=>{
 for(const animation of S.entries)for(const exitAnimation of S.exits) {
  const s=S.normalize({animation,exitEnabled:true,exitAnimation});
  for(const t of [0,.12,.25,.9,1])assert(Object.values(S.animation(s,t,1)).every(Number.isFinite));
 }
 const w=cue().words[0];assert.equal(S.wordState(S.normalize({wordAnimation:'Fade per word'}),w,w.start).alpha,0);
 assert.equal(S.wordState(S.normalize({wordAnimation:'Pop per word'}),w,w.start).scale,0);
});
test('ASS has individual font/color tags, fixed resolution, correct centiseconds and escaped text',()=>{
 const first=cue({font:'Arial',color:'#FF0000',uppercase:true,wordAnimation:'None',animation:'Fade In',entryDuration:200});
 const second={...cue({font:'Impact',size:90,color:'#00FF00',wordAnimation:'None',animation:'None'}),start:4,end:6,text:'{\\pos(0,0)} test'};
 const ass=ASS.generate([first,second]);assert(ass.includes('PlayResX: 1080'));assert(ass.includes('PlayResY: 1920'));
 assert(ass.includes('\\fnArial\\fs72'));assert(ass.includes('\\fnImpact\\fs90'));assert(ass.includes('\\c&H0000FF&'));assert(ass.includes('\\c&H00FF00&'));assert(ass.includes('\\fad(200,0)'));assert(ass.includes('HOLA'));assert(!ass.includes('}hola'));
 assert(!ass.includes('{\\pos(0,0)}'));assert.equal(ASS.time(59.999),'0:01:00.00');
 const karaoke=ASS.generate([cue()]);assert(karaoke.includes('\\k30'));assert(karaoke.includes('\\k50'));
});
test('Rounded boxes use vector paths, all effects generate valid nonoverlapping position tags',()=>{
 for(const animation of S.entries)for(const wordAnimation of S.words) {
  const c=cue({animation,wordAnimation,bgEnabled:true,bgRadius:20,shadowEnabled:true,exitEnabled:true,exitAnimation:'Slide Down'});
  const ass=ASS.generate([c]);assert(ass.includes('\\p1'));assert(ass.includes(' b '));assert(!/NaN|undefined|Infinity/.test(ass));
  for(const line of ass.split('\r\n').filter(l=>l.startsWith('Dialogue:')))assert.equal((line.match(/\\(?:pos|move)\(/g)||[]).length,1);
 }
});
test('Styles survive existing track sync, duplicate, split, serialize and restore',()=>{
 const scope={window:{},EventBus:{emit(){}},structuredClone,crypto,SubtitleStyle:S};vm.createContext(scope);
 for(const file of ['track-manager.js','timeline-tracks.js','subtitle-style-store.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/components',file),'utf8'),scope);
 const result=vm.runInContext(`(()=>{
  const state={subtitles:[{id:'one',text:'hola mundo',start:0,end:2,words:[],style:SubtitleStyle.normalize({font:'Impact',size:98})}],subtitleStyle:SubtitleStyle.normalize(),videoFps:30};
  const manager=new TimelineTracks(state);state.timeline={trackManager:manager};SubtitleStyleStore.attach(state);
  const copy=manager.duplicateClip('one');manager.splitClip('one',1);const data=structuredClone(manager.serialize());
  state.subtitleStyle=SubtitleStyle.normalize({font:'Arial'});manager.restore(data);
  return state.subtitles.map(c=>({font:c.style.font,size:c.style.size}));
 })()`,scope);
 assert.equal(result.length,3);for(const c of result){assert.equal(c.font,'Impact');assert.equal(c.size,98);}
});
