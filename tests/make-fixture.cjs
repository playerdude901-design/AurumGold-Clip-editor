const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const out=path.join(__dirname,'../test-output');fs.mkdirSync(out,{recursive:true});
const source=path.join(out,'source.mp4');
const result=spawnSync(require('ffmpeg-static'),['-y','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source],{encoding:'utf8'});
if(result.status)throw new Error(result.stderr);console.log('Created test video');
