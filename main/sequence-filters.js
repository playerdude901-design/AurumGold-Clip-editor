/* Pure filter planning shared by export and tests. Later tracks cover earlier ones. */
function sequenceVideoFilters(sequence, width, height, fps, trimIn, trimOut) {
  const filters = [], duration = trimOut-trimIn;
  const clips = sequence.videoTracks.filter(t=>t.visible).flatMap(t=>sequence.clips.filter(c=>c.type==='video' && c.trackId===t.id && c.startTime < trimOut && c.startTime+c.duration > trimIn));
  filters.push(`color=c=black:s=${width}x${height}:r=${fps}:d=${duration}[seq0]`);
  if(clips.length) filters.push(`[0:v]split=${clips.length}${clips.map((_,i)=>`[raw${i}]`).join('')}`);
  clips.forEach((c,i)=> {
    const speed=c.speed || 1, start=Math.max(trimIn,c.startTime), end=Math.min(trimOut,c.startTime+c.duration);
    const sourceStart=(c.trimIn || 0)+(start-c.startTime)*speed;
    filters.push(`[raw${i}]trim=start=${sourceStart}:end=${sourceStart+(end-start)*speed},setpts=(PTS-STARTPTS)/${speed}+${start-trimIn}/TB[part${i}]`);
    filters.push(`[seq${i}][part${i}]overlay=eof_action=pass:repeatlast=0:enable='between(t,${start-trimIn},${end-trimIn})'[seq${i+1}]`);
  });
  return {filters, label:`seq${clips.length}`};
}
function audioSlices(tracks, start, end) {
  return tracks.filter(c=>!c.muted && (c.volume ?? 1)>0).flatMap(c=> {
    const speed=c.speed || 1, at=c.offset ?? c.startTime ?? 0;
    const duration=c.duration ?? ((c.trimOut-(c.trimIn || 0))/speed);
    const from=Math.max(start,at), to=Math.min(end,at+duration);
    return to>from ? [{...c, sourceStart:(c.trimIn || 0)+(from-at)*speed, sourceDuration:(to-from)*speed, delay:from-start, speed}] : [];
  });
}
function tempoFilters(speed) {
  const filters=[];
  while(speed>2){filters.push('atempo=2');speed/=2;}
  while(speed<0.5){filters.push('atempo=0.5');speed/=0.5;}
  filters.push(`atempo=${speed}`);return filters.join(',');
}
module.exports={sequenceVideoFilters,audioSlices,tempoFilters};
