const SVG_NS='http://www.w3.org/2000/svg',STEP_MS=300,HOLD_MS=500;

export function playBoardFireworks({source,length,isCurrent,onProgress,onFinish}){
  let frame=null,began=null,finished=false;
  function finish(){if(finished)return;finished=true;cancelAnimationFrame(frame);source.classList.remove('fireworks-launch');onFinish();}
  function tick(now){
    if(!isCurrent()){finish();return;}
    began??=now;
    const elapsed=now-began,steps=elapsed/STEP_MS,count=Math.min(length,1+Math.floor(steps));
    onProgress(count,count<length?steps%1:0);
    if(elapsed<(length-1)*STEP_MS+HOLD_MS)frame=requestAnimationFrame(tick);else finish();
  }
  source.classList.add('fireworks-launch');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){frame=requestAnimationFrame(()=>{if(isCurrent())onProgress(length,0);finish();});}
  else frame=requestAnimationFrame(tick);
  return {cancel:finish};
}

export function drawBoardFireworks(svg,guide,pointForCell){
  const group=document.createElementNS(SVG_NS,'g');group.classList.add('fireworks-board-path');
  group.dataset.word=guide.word;group.dataset.revealed=String(guide.count);svg.append(group);
  for(let index=1;index<guide.path.length;index++){
    const progress=index<guide.count?1:index===guide.count?guide.progress:0;if(progress<=0)continue;
    const from=pointForCell(guide.path[index-1]),to=pointForCell(guide.path[index]),dx=to.x-from.x,dy=to.y-from.y,distance=Math.hypot(dx,dy);
    if(!distance)continue;
    const ux=dx/distance,uy=dy/distance,pad=Math.min(distance*.25,Math.min(from.size,to.size)*.19),span=(distance-2*pad)*progress;
    const start={x:from.x+ux*pad,y:from.y+uy*pad},tip={x:start.x+ux*span,y:start.y+uy*span};
    const line=document.createElementNS(SVG_NS,'line');line.classList.add('fireworks-board-line');
    line.setAttribute('x1',String(start.x));line.setAttribute('y1',String(start.y));line.setAttribute('x2',String(tip.x));line.setAttribute('y2',String(tip.y));
    line.dataset.from=String(guide.path[index-1]);line.dataset.to=String(guide.path[index]);group.append(line);
    const size=Math.max(3,Math.min(7,distance*.14));if(span<size*1.6)continue;
    const base={x:tip.x-ux*size,y:tip.y-uy*size},arrow=document.createElementNS(SVG_NS,'path');arrow.classList.add('fireworks-board-arrow');
    arrow.dataset.from=String(guide.path[index-1]);arrow.dataset.to=String(guide.path[index]);
    arrow.setAttribute('d',`M ${base.x-uy*size*.6} ${base.y+ux*size*.6} L ${tip.x} ${tip.y} L ${base.x+uy*size*.6} ${base.y-ux*size*.6}`);group.append(arrow);
  }
}
