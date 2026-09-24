'use strict';
const {execFile}=require('child_process');
const {promisify}=require('util');
const run=promisify(execFile);
async function list() {
  if(process.platform==='win32') {
    const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command','Add-Type -AssemblyName System.Drawing; $agFonts = New-Object System.Drawing.Text.InstalledFontCollection; @($agFonts.Families | ForEach-Object { $_.Name }) | ConvertTo-Json -Compress'],{windowsHide:true,timeout:15000,maxBuffer:4*1024*1024});
    return JSON.parse(stdout.replace(/^\uFEFF/,''));
  }
  const {stdout}=await run('fc-list',['--format','%{family}\n'],{timeout:15000,maxBuffer:4*1024*1024});
  return [...new Set(stdout.split(/[\n,]/).map(s=>s.trim()).filter(Boolean))];
}
async function verify(blocks,defaults) {
  const S=require('../renderer/components/subtitle-style-model');
  const installed=await list();
  const missing=[...new Set(blocks.filter(b=>String(b.text||'').trim()).map(b=>S.normalize(b.style||defaults).font))].filter(f=>!installed.includes(f));
  if(missing.length)throw new Error(`Fuentes no instaladas: ${missing.join(', ')}. Instálalas o selecciona otra fuente antes de aplicar.`);
  return installed;
}
module.exports={list,verify};
