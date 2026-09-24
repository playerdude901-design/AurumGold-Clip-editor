const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const {promisify}=require('util'),exec=promisify(require('child_process').execFile);
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ag-subtitle-styles-')));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.join(root,'main/preload.js'),contextIsolation:true,nodeIntegration:false,webSecurity:false,offscreen:true,backgroundThrottling:false}});
 require('../main/ipc-handlers').register(win);
 const run=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const errors=[];win.webContents.on('console-message',(_,level,message)=>{if(level>=3 && !/ERR_CERT|ERR_NAME|ERR_INTERNET/.test(message))errors.push(message);});
 const deadline=setTimeout(()=>app.exit(1),120000);
 try {
  await win.loadFile(path.join(root,'renderer/index.html'));await wait(800);
  await run(`EventBus.emit('twitch:download-complete',${JSON.stringify(path.join(out,'source.mp4'))})`);
  for(let i=0;i<100;i++){if(await run(`!document.getElementById('btn-open-sub-editor').disabled`))break;await wait(100);}
  await run(`const originalOpen=SubtitleEditor.prototype.open;SubtitleEditor.prototype.open=function(...args){window.testEditor=this;return originalOpen.apply(this,args);};document.getElementById('btn-open-sub-editor').click();
    window.e=testEditor;e.open(Array.from({length:3},(_,i)=>({id:'cue'+i,start:i,end:i+.9,text:'hola mundo '+i,words:[],style:SubtitleStyle.normalize({font:'Arial',size:64+i*10,animation:'None',wordAnimation:'None'})})),e.onConfirmCallback,e.onCancelCallback);`);
  assert.equal(await run(`document.getElementById('sub-editing-state').textContent`),'Estilo por defecto');
  await run(`document.querySelector('[data-id="cue1"]').click();`);
  assert.equal(await run(`e.currentStyle().size`),74);
  assert.equal(await run(`document.getElementById('sub-editing-state').textContent`),'Editando: bloque 2');
  await run(`document.querySelector('[data-id="cue0"]').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));`);
  assert.equal(await run(`e.currentStyle().size`),74);assert.equal(await run(`e.selected.size`),2);
  await run(`const size=document.querySelector('input[type="number"][data-style="size"]');size.value='112';size.dispatchEvent(new Event('input',{bubbles:true}));`);
  assert.deepEqual(await run(`e.blocks.map(b=>b.style.size)`),[112,112,84]);
  assert.equal(await run(`document.getElementById('sub-editing-state').textContent`),'Editando: 2 bloques');
  await run(`e.elBlockList.click();e.patch({size:50,font:'Arial'});`);
  assert.deepEqual(await run(`e.blocks.map(b=>b.style.size)`),[112,112,84]);
  await run(`document.getElementById('sub-btn-add-block').click()`);assert.equal(await run(`e.blocks.at(-1).style.size`),50);
  await run(`e.elBlockList.focus();e.elBlockList.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true}));`);
  assert.equal(await run(`e.selected.size`),4);
  await run(`const hex=document.querySelector('input[type="text"][data-style="color"]');hex.value='#12ABEF';hex.dispatchEvent(new Event('input',{bubbles:true}));`);
  assert(await run(`e.blocks.every(b=>b.style.color==='#12ABEF')`));
  await run(`e.properties.presetName.value='Prueba selección';document.getElementById('sub-save-preset').click();`);
  assert(await run(`SubtitleStyleStore.load().some(p=>p.name==='Prueba selección'&&p.style.color==='#12ABEF')`));
  await run(`e.patch({color:'#FF0000'});e.properties.presetSelect.dispatchEvent(new Event('change'));`);
  assert(await run(`e.blocks.every(b=>b.style.color==='#12ABEF')`));
  await run(`document.getElementById('sub-delete-preset').click();`);assert.equal(await run(`SubtitleStyleStore.load().length`),4);
  await run(`e.patch({outlineWidth:0,bgEnabled:true,bgOpacity:0,marginH:-30,marginV:0});`);
  assert(await run(`e.blocks.every(b=>b.style.outlineWidth===0 && b.style.bgOpacity===0 && b.style.marginV===0 && b.style.marginH===-30)`));
  // Return to a legible preset for visual verification.
  await run(`e.patch({...SubtitleStyle.presets[0].style,font:'Arial'});`);
  await wait(250);fs.writeFileSync(path.join(out,'subtitle-styles-panel.png'),(await win.webContents.capturePage()).toPNG());
  await run(`e.apply()`);assert.equal(await run(`e.isOpen`),false);
  assert(await run(`e.state.subtitles.every(b=>b.style.font==='Arial')`));
  const saved=await run(`e.state.timeline.trackManager.serialize()`);assert(saved.clips.filter(c=>c.type==='sub').every(c=>c.style.font==='Arial'));
  await run(`e.state.timeline.trackManager.duplicateClip(e.state.subtitles[0].id);`);
  assert.equal(await run(`e.state.subtitles.length`),5);
  assert(await run(`e.state.subtitles.every(b=>b.style.font==='Arial')`));
  await run(`EventBus.emit('history:undo')`);assert.equal(await run(`e.state.subtitles.length`),4);
  await run(`EventBus.emit('history:redo')`);assert.equal(await run(`e.state.subtitles.length`),5);
  // Real ASS generation through IPC, exercising all word effects and rounded boxes.
  const availableFonts=await run(`window.electronAPI.subtitleFonts()`);
  console.log('Installed subtitle fonts:',availableFonts.fonts.filter(f=>['Arial','Impact','Montserrat','Bebas Neue','Oswald','Roboto','Anton'].includes(f)).join(', '));
  const missing=['Arial','Impact','Montserrat','Bebas Neue','Oswald','Roboto','Anton'].find(f=>!availableFonts.fonts.includes(f));
  if(missing){const rejected=await run(`window.electronAPI.generateAss({blocks:[{text:'test',start:0,end:1,style:{font:${JSON.stringify(missing)}}}],styleConfig:{}})`);assert.equal(rejected.success,false);assert(rejected.error.includes(missing));}
  const generated=await run(`(async()=>{
    const blocks=SubtitleStyle.words.map((wordAnimation,i)=>({id:'gallery'+i,start:i*2,end:i*2+2,text:'hola mundo con estilo',words:['hola','mundo','con','estilo'].map((word,j)=>({word,start:i*2+.2+j*.4,end:i*2+.5+j*.4})),style:SubtitleStyle.normalize({font:'Arial',size:90,bold:false,wordAnimation,animation:SubtitleStyle.entries[i+1],entryDuration:250,exitEnabled:true,exitAnimation:SubtitleStyle.exits[i%5],verticalPosition:'center',marginV:0,anchor:5,maxWidth:70,bgEnabled:true,bgType:['Per word','Per line','Per block'][i%3],bgRadius:20,shadowEnabled:true,highlightColor:'#00FFFF'})}));
    blocks.forEach(b=>{b.style.bgColor='#573778';b.style.bgOpacity=.8;});
    window.gallery=blocks;return window.electronAPI.generateAss({blocks,styleConfig:{},resolution:'720p'});
  })()`);
  assert(generated.success,generated.error);fs.copyFileSync(generated.assPath,path.join(out,'subtitle-styles-gallery.ass'));
  const imageData=await run(`(()=>{const c=document.createElement('canvas');c.width=540;c.height=960;const x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,540,960);SubtitleVisual.draw(x,gallery[1],{},2.7,540,960);return c.toDataURL().split(',')[1];})()`);
  fs.writeFileSync(path.join(out,'subtitle-native-preview.png'),Buffer.from(imageData,'base64'));
  const ffmpeg=require('ffmpeg-static');
  await exec(ffmpeg,['-y','-f','lavfi','-i','color=c=black:s=540x960:r=30:d=16','-vf','ass=subtitle-styles-gallery.ass','-an','-c:v','libx264','-preset','ultrafast','-crf','20','subtitle-styles-gallery.mp4'],{cwd:out,windowsHide:true,timeout:60000,maxBuffer:4*1024*1024});
  await exec(ffmpeg,['-y','-ss','2.7','-i','subtitle-styles-gallery.mp4','-frames:v','1','subtitle-ass-preview.png'],{cwd:out,windowsHide:true,timeout:15000});
  // Fresh DOM/session reads the persisted styles and presets.
  await win.reload();await wait(1500);await run(`document.getElementById('btn-open-sub-editor').click()`);
  assert.equal(await run(`document.querySelectorAll('.sub-block-card').length`),5);
  assert.equal(await run(`document.querySelector('#sub-load-preset').options.length`),5);
  assert.deepEqual(errors,[]);console.log('Subtitle styles UI, native preview, persistence, history and real libass render passed');
 }catch(e){console.error(e);console.error(errors);process.exitCode=1;fs.writeFileSync(path.join(out,'subtitle-styles-failure.png'),(await win.webContents.capturePage()).toPNG());}
 finally{clearTimeout(deadline);win.destroy();app.exit(process.exitCode||0);}
});
