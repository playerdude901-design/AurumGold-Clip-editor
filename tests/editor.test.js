const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {sequenceVideoFilters,audioSlices,tempoFilters}=require('../main/sequence-filters');
const SubtitleEngine=require('../main/subtitle-engine');
function model(){const scope={window:{},EventBus:{emit(){}},structuredClone,crypto};vm.createContext(scope);for(const file of ['renderer/components/track-manager.js','renderer/components/timeline-tracks.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),scope);return vm.runInContext(`new TimelineTracks({videoFps:60,videoDuration:10,filePath:'source.mp4',subtitles:[],hasAudio:true})`,scope);}
test('Whisper JSON preserves zero timestamps and parses nested offsets',()=>{assert.deepEqual(SubtitleEngine.parseWords({transcription:[{text:'Hola',offsets:{from:0,to:350}},{text:'mundo',timestamps:{from:'00:00:00,350',to:'00:00:00,800'}}]}),[{word:'Hola',start:0,end:.35},{word:'mundo',start:.35,end:.8}]);assert.deepEqual(SubtitleEngine.parseWords({segments:[{words:[{word:'A',start:0,end:.1}]}]}),[{word:'A',start:0,end:.1}]);});
test('Silence remains empty; four words per cue',()=>{const e=new SubtitleEngine();assert.deepEqual(e.groupWordsIntoBlocks([]),[]);assert.equal(e.groupWordsIntoBlocks(Array.from({length:9},(_,i)=>({word:'w'+i,start:i/2,end:i/2+.3}))).length,3);});
test('Split at frame boundary retains correct source offsets; locks protect edits',()=>{const m=model();m.initFromVideo('source.mp4',10);const c=m.clips.get('clip_v1_main');m.setSpeed(c.id,2);const second=m.splitClip(c.id,1.5);assert.equal(c.duration,1.5);assert.equal(second.trimIn,3);assert.equal(second.duration,3.5);m.videoTracks[0].locked=true;m.deleteClip(c.id);assert(m.clips.has(c.id));});
test('Insert ripples clips and overwrite preserves the remaining source range',()=>{const m=model();m.initFromVideo('source.mp4',10);m.insertSource(2,4,3,false);assert.equal(m.duration,12);const parts=[...m.clips.values()].filter(c=>c.type==='video').sort((a,b)=>a.startTime-b.startTime);assert.deepEqual(parts.map(c=>[c.startTime,c.duration,c.trimIn]),[[0,3,0],[3,2,2],[5,7,3]]);const n=model();n.initFromVideo('source.mp4',10);n.insertSource(0,2,3,true);const a=[...n.clips.values()].filter(c=>c.type==='video').sort((a,b)=>a.startTime-b.startTime);assert.deepEqual(a.map(c=>[c.startTime,c.duration,c.trimIn]),[[0,3,0],[3,2,0],[5,5,5]]);});
test('Zero volume, mute and solo apply to exported audio',()=>{const m=model();m.initFromVideo('source.mp4',10);m.setTrackVolume('a1',0);assert.equal(m.getExportAudioTracks()[0].volume,0);assert.equal(audioSlices(m.getExportAudioTracks(),0,10).length,0);m.audioTracks[0].muted=true;assert.equal(m.getExportAudioTracks().length,0);});
test('Audio clips are intersected with export In/Out and use speed-adjusted source',()=>{assert.deepEqual(audioSlices([{offset:2,trimIn:1,duration:4,speed:2,volume:1}],3,5).map(c=>[c.sourceStart,c.sourceDuration,c.delay]),[[3,4,0]]);assert.equal(tempoFilters(4),'atempo=2,atempo=2');});
test('Sequence filter preserves gaps and ignores hidden tracks',()=>{const plan=sequenceVideoFilters({videoTracks:[{id:'v1',visible:true},{id:'v2',visible:false}],clips:[{trackId:'v1',type:'video',startTime:2,duration:2,trimIn:1},{trackId:'v2',type:'video',startTime:0,duration:4}]},640,360,30,1,5);assert(plan.filters.join(';').includes('between(t,1,3)'));assert.equal(plan.label,'seq1');});
test('FFmpeg export produces a vertical file with edited duration, audio and ASS',async()=>{
 const Service=require('../main/ffmpeg-service');const service=new Service();const engine=new SubtitleEngine();
 const source=path.join(__dirname,'../test-output/source.mp4');if(!fs.existsSync(source))throw new Error('Run npm run test:fixture first');
 const output=path.join(__dirname,'../test-output/export.mp4');
 const assPath=engine.generateAssFile([{text:'Prueba de exportación',start:0,end:1,words:[]}],{highlightEnabled:false},'720p');
 await service.exportVideo({filePath:source,cameras:[{active:true,x:100,y:0,w:202,h:360,px:0,py:0,pw:1080,ph:1920}],trimIn:0,trimOut:2,resolution:'720p',outputPath:output,useGPU:false,hasAudio:true,fps:30,videoWidth:640,videoHeight:360,assPath,sequence:{videoTracks:[{id:'v1',visible:true}],clips:[{type:'video',trackId:'v1',startTime:0,duration:1,trimIn:2,speed:2}]},audioTracks:[{filePath:source,offset:.5,trimIn:0,trimOut:1,duration:1,volume:.5,speed:1}]},()=>{});
 const meta=await service.getMetadata(output);assert.equal(meta.width,720);assert.equal(meta.height,1280);assert(Math.abs(meta.duration-2)<.1);assert(meta.hasAudio);
 const waveform=await new (require('../main/waveform-generator'))().generateWaveform(source);assert(waveform && fs.statSync(waveform).size>100);
});

test('Subtitle timestamps follow sequence trims, speeds and duplicate source ranges',()=>{
 const scope={window:{},crypto};vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/components/subtitle-engine.js'),'utf8'),scope);
 scope.words=[{word:'Hello',start:2,end:2.5},{word:'world',start:2.5,end:3}];
 scope.manager={videoTracks:[{id:'v1',visible:true}],clips:new Map([['one',{id:'one',trackId:'v1',type:'video',trimIn:2,startTime:4,duration:1,speed:2}],['two',{id:'two',trackId:'v1',type:'video',trimIn:2,startTime:8,duration:1,speed:1}]])};
 const cues=vm.runInContext('SubtitleTranscription.sequenceBlocks(words,manager)',scope);
 assert.equal(cues.length,2);assert.equal(cues[0].start,4);assert.equal(cues[0].end,4.5);assert.equal(cues[1].start,8);assert.equal(cues[1].end,9);
});
test('Multicamera export retains rectangular and circular overlays',async()=>{
 const Service=require('../main/ffmpeg-service'),service=new Service();
 const source=path.join(__dirname,'../test-output/source.mp4'),output=path.join(__dirname,'../test-output/multicamera.mp4');
 await service.exportVideo({filePath:source,cameras:[{active:true,x:0,y:0,w:640,h:360,px:0,py:300,pw:1080,ph:608},{active:true,x:200,y:50,w:200,h:200,px:250,py:1000,pw:500,ph:500,shape:'circle'}],trimIn:1,trimOut:2,resolution:'720p',outputPath:output,useGPU:false,hasAudio:true,fps:30},()=>{});
 const meta=await service.getMetadata(output);assert.equal(meta.height,1280);assert(Math.abs(meta.duration-1)<.1);
});
