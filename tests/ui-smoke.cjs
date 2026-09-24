const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'test-output');fs.mkdirSync(output,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ag-ui-test-')));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{preload:path.join(root,'main/preload.js'),contextIsolation:true,nodeIntegration:false,webSecurity:false,backgroundThrottling:false,offscreen:true}});
 require('../main/ipc-handlers').register(window);
 const errors=[];window.webContents.on('console-message',(_,level,message)=>{console.log('renderer',level,message);if(level>=3 && !message.includes('ERR_INTERNET') && !message.includes('ERR_NAME') && !message.includes('ERR_CERT'))errors.push(message);});
 setTimeout(()=>{console.error('UI timeout');app.exit(1);},30000);
 console.log('Start UI load');
 await window.loadFile(path.join(root,'renderer/index.html'));
 const run=s=>window.webContents.executeJavaScript(s);
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 try {
 await wait(1800);
 const initial=await run(`({tabs:document.querySelectorAll('[role=tab]').length,height:document.getElementById('timeline-area').getBoundingClientRect().height,source:document.getElementById('source-wrapper').getBoundingClientRect().toJSON(),inspector:document.querySelector('.editor-inspector').getBoundingClientRect().toJSON()})`);
 assert.equal(initial.tabs,4);assert.equal(initial.height,280);assert(initial.source.width>300);
 console.log('Loading test video');
 await run(`EventBus.emit('twitch:download-complete',${JSON.stringify(path.join(output,'source.mp4'))})`);
 for(let i=0;i<50;i++){if(await run(`document.querySelectorAll('.tl-clip-video').length`))break;await wait(100);}
 assert.equal(await run(`document.querySelectorAll('.tl-clip-video').length`),1);
 assert.equal(await run(`document.querySelectorAll('.tl-clip-audio').length`),1);
 await run(`document.getElementById('tl-resizer').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientY:620,button:0}));document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientY:520}));document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));`);
 await wait(100);assert.equal(await run(`document.getElementById('timeline-area').getBoundingClientRect().height`),380);
 await run(`document.getElementById('tl-btn-add-sub-cue').click(); document.getElementById('btn-open-sub-editor').click();`);
 assert.equal(await run(`document.querySelectorAll('.tl-clip-sub').length`),1);
 assert.equal(await run(`document.getElementById('subtitle-editor-overlay').style.display`),'flex');
 await run(`document.getElementById('sub-editor-confirm').click();window.editorLayout.select('cameras');`);
 await wait(400);
 fs.writeFileSync(path.join(output,'workspace.png'),(await window.webContents.capturePage()).toPNG());
 await run(`document.getElementById('tool-razor').click();const c=document.querySelector('.tl-clip-video'),r=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,clientX:r.left+r.width/2,clientY:r.top+10}));`);
 assert.equal(await run(`document.querySelectorAll('.tl-clip-video').length`),2);
 await run(`EventBus.emit('history:undo');`);
 assert.equal(await run(`document.querySelectorAll('.tl-clip-video').length`),1);
 await run(`EventBus.emit('history:redo');`);
 assert.equal(await run(`document.querySelectorAll('.tl-clip-video').length`),2);
 await run(`document.getElementById('tool-select').click();`);
 // Empty successful transcriptions must still open the editor.
 const {ipcMain}=require('electron');ipcMain.removeHandler('subtitles:transcribe');
 ipcMain.handle('subtitles:transcribe',()=>({success:true,blocks:[],words:[]}));
 await run(`document.getElementById('btn-transcribe-audio').click();`);await wait(200);
 assert.equal(await run(`document.getElementById('subtitle-editor-overlay').style.display`),'flex');
 assert.equal(await run(`document.querySelectorAll('#sub-block-list .sub-block-card').length`),0);
 fs.writeFileSync(path.join(output,'subtitle-empty.png'),(await window.webContents.capturePage()).toPNG());
 await run(`document.getElementById('sub-editor-close').click();`);
 ipcMain.removeHandler('subtitles:transcribe');ipcMain.handle('subtitles:transcribe',()=>({success:false,error:'Prueba: motor no disponible'}));
 await run(`document.getElementById('btn-transcribe-audio').click();`);await wait(200);
 assert(await run(`document.querySelector('.transcription-error').textContent.includes('motor no disponible')`));
 await run(`document.getElementById('sub-editor-close').click();window.editorLayout.select('export');`);await wait(100);
 fs.writeFileSync(path.join(output,'export-panel.png'),(await window.webContents.capturePage()).toPNG());
 // Restore the saved two-part timeline and the resized layout on reload.
 await window.reload();await wait(1400);
 assert.equal(await run(`document.querySelectorAll('.tl-clip-video').length`),2);
 assert.equal(await run(`document.getElementById('timeline-area').getBoundingClientRect().height`),380);
 const unexpected=errors.filter(e=>!e.includes('[AG-Transcribe] error'));
 assert.deepEqual(unexpected,[]);
 console.log('UI smoke passed',JSON.stringify(initial));
 }catch(e){console.error(e);console.error(errors);process.exitCode=1;fs.writeFileSync(path.join(output,'failure.png'),(await window.webContents.capturePage()).toPNG());}
 finally{window.destroy();app.exit(process.exitCode || 0);}
});
