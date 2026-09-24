const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ag-speech-ui-')));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{preload:path.join(root,'main/preload.js'),contextIsolation:true,nodeIntegration:false,webSecurity:false,offscreen:true,backgroundThrottling:false}});
 require('../main/ipc-handlers').register(win);
 ipcMain.removeHandler('dialog:selectFolder');ipcMain.handle('dialog:selectFolder',()=>out);
 win.webContents.on('console-message',(_,level,message)=>{if(message.includes('AG-Transcribe')||level>=3)console.log(message);});
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),run=s=>win.webContents.executeJavaScript(s);
 const deadline=setTimeout(()=>app.exit(1),180000);
 try {
  await win.loadFile(path.join(root,'renderer/index.html'));await wait(500);
  await run(`EventBus.emit('twitch:download-complete',${JSON.stringify(path.join(out,'speech.mp4'))})`);
  for(let i=0;i<100;i++){if(await run(`!document.getElementById('btn-transcribe-audio').disabled`))break;await wait(100);}
  await run(`document.getElementById('transcribe-lang-select').value='en';document.getElementById('btn-transcribe-audio').click();`);
  for(let i=0;i<1500;i++){if(await run(`document.getElementById('subtitle-editor-overlay').style.display==='flex'`))break;await wait(100);}
  assert.equal(await run(`document.querySelector('.transcription-error')===null`),true);
  assert(await run(`document.querySelectorAll('.sub-block-card').length>0`));
  const text=await run(`[...document.querySelectorAll('.sub-block-text')].map(e=>e.textContent).join(' ')`);
  assert(/hello/i.test(text));console.log('Real UI transcript:',text);
  fs.writeFileSync(path.join(out,'transcription-editor.png'),(await win.webContents.capturePage()).toPNG());
  await run(`document.getElementById('sub-editor-confirm').click();window.editorLayout.select('export');document.querySelector('.radio-card[data-value="720p"]').click();document.getElementById('export-filename').value='speech-subtitled';document.getElementById('btn-select-folder').click();`);await wait(100);
  await run(`document.getElementById('btn-start-export').click();`);
  for(let i=0;i<600;i++){if(await run(`document.getElementById('export-done').style.display==='flex'`))break;await wait(100);}
  assert.equal(await run(`document.getElementById('export-done').style.display`),'flex');
  console.log('Real IPC transcription → apply → FFmpeg export passed');
 }catch(e){console.error(e);process.exitCode=1;}
 finally{clearTimeout(deadline);win.destroy();app.exit(process.exitCode || 0);}
});
