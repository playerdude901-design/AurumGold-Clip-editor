const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const SubtitleEngine = require('./subtitle-engine');
const run = (exe, args) => new Promise((resolve, reject) => execFile(exe, args, {windowsHide:true, timeout:14*60*1000, maxBuffer:8*1024*1024}, (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(stdout)));

async function transcribe(audioPath, options) {
  const errors = [];
  const language = ['es','en','auto'].includes(options.language) ? options.language : 'auto';
  const engine = new SubtitleEngine();
  try {
    const root = path.dirname(require.resolve('nodejs-whisper/package.json')).replace(/app\.asar([/\\])/g,'app.asar.unpacked$1');
    const cpp = path.join(root,'cpp','whisper.cpp');
    const modelRootPath = process.env.AG_WHISPER_MODELS || path.join(cpp,'models');
    if (!fs.existsSync(path.join(modelRootPath,'ggml-base.bin'))) throw new Error('Falta ggml-base.bin para nodejs-whisper.');
    const exe = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
    if (!['build/bin','build/bin/Release','build/bin/Debug','build',''].some(dir=>fs.existsSync(path.join(cpp,dir,exe)))) throw new Error('Falta whisper-cli compilado.');
    const {nodewhisper} = require(path.join(root,'dist','index.js'));
    await nodewhisper(audioPath, {modelName:'base',modelRootPath,whisperOptions:{outputInJson:true,wordTimestamps:true,language}});
    const words = engine._findAndParseWhisperOutput(audioPath);
    if (words === null) throw new Error('Whisper no generó JSON.');
    return words;
  } catch(e) { errors.push('nodejs-whisper: '+e.message); console.warn(errors.at(-1)); }
  const script = "import json,sys,whisper\nmodel=whisper.load_model('base')\nresult=model.transcribe(sys.argv[1],language=None if sys.argv[3]=='auto' else sys.argv[3],word_timestamps=True,fp16=False)\nwith open(sys.argv[2],'w',encoding='utf-8') as f: json.dump(result,f,ensure_ascii=False)";
  const output = audioPath+'.python.json';
  const runtimeRoot = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA,'AurumGold','whisper-runtime') : '';
  const appPython = path.join(runtimeRoot, process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const localPython = path.join(__dirname,'..','.venv-whisper',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const candidates = process.env.AG_WHISPER_PYTHON ? [[process.env.AG_WHISPER_PYTHON,[]]] : [
    ...(runtimeRoot && fs.existsSync(appPython) ? [[appPython,[]]] : []),
    ...(fs.existsSync(localPython) ? [[localPython,[]]] : []),
    ...(process.platform === 'win32' ? [['py',['-3']],['python',[]]] : [['python3',[]],['python',[]]])
  ];
  for (const [exe,prefix] of candidates) {
    try {
      console.log('[AG-Transcribe] fallback Python:',exe);
      await run(exe,[...prefix,'-c',script,audioPath,output,language]);
      return SubtitleEngine.parseWords(JSON.parse(fs.readFileSync(output,'utf8')));
    } catch(e) {errors.push(exe+': '+e.message.slice(-1200));}
    finally {if(fs.existsSync(output))fs.unlinkSync(output);}
  }
  throw new Error('No se pudo transcribir. Instala openai-whisper en Python (pip install openai-whisper), o configura AG_WHISPER_PYTHON con tu intérprete.\n'+errors.join('\n'));
}
process.once('message', async ({audioPath,options}) => {
  try {process.send({words:await transcribe(audioPath,options)});}
  catch(e) {process.send({error:e.message});}
});
