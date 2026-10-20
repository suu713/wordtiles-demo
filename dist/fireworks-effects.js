const SVG_NS='http://www.w3.org/2000/svg';
const FLIGHT_MS=650,LETTER_MS=150;

// The caller owns revealed letters; this effect only controls their presentation.
export function launchWordFireworks({source,getTarget,isCurrent,onLetter,onFinish}){
  const layer=document.createElement('div');layer.className='word-fireworks-layer';layer.setAttribute('aria-hidden','true');
  document.body.append(layer);
  const timers=new Set();let frame=null,finished=false;
  const later=(fn,delay)=>{const id=setTimeout(()=>{timers.delete(id);if(!finished)fn();},delay);timers.add(id);};
  function finish(){
    if(finished)return;finished=true;cancelAnimationFrame(frame);for(const id of timers)clearTimeout(id);timers.clear();
    layer.remove();source.classList.remove('fireworks-launch');onFinish();
  }
  function currentTarget(){const target=getTarget();return isCurrent()&&target?.isConnected&&!target.classList.contains('completed')?target:null;}
  function burst(x,y,size=1){
    const ring=document.createElement('i');ring.className='word-fireworks-ring';ring.style.left=x+'px';ring.style.top=y+'px';layer.append(ring);
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4,spark=document.createElement('i');spark.className='word-fireworks-spark';
      spark.style.left=x+'px';spark.style.top=y+'px';spark.style.setProperty('--spark-x',Math.cos(angle)*25*size+'px');spark.style.setProperty('--spark-y',Math.sin(angle)*25*size+'px');
      layer.append(spark);
    }
    later(()=>{ring.remove();for(const spark of layer.querySelectorAll('.word-fireworks-spark'))if(spark.style.left===x+'px'&&spark.style.top===y+'px')spark.remove();},650);
  }
  function lightWord(){
    const target=currentTarget();if(!target){finish();return;}
    const slots=target.querySelectorAll('.target-letter');layer.classList.add('landed');target.classList.add('fireworks-word-lit');
    slots.forEach((_,index)=>later(()=>{
      const live=currentTarget();if(!live){finish();return;}
      const slot=live.querySelectorAll('.target-letter')[index];if(!slot){finish();return;}
      onLetter(index);slot.classList.add('fireworks-letter-lit');live.classList.add('fireworks-word-lit');
      const box=slot.getBoundingClientRect();burst(box.x+box.width/2,box.y+box.height/2,index===0?1:.55);
    },index*LETTER_MS));
    later(finish,Math.max(0,slots.length-1)*LETTER_MS+750);
  }
  function start(){
    const target=currentTarget();if(!target){finish();return;}
    target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){
      target.querySelectorAll('.target-letter').forEach((_,index)=>onLetter(index));finish();return;
    }
    const origin=(source.querySelector('svg')||source).getBoundingClientRect(),destination=target.querySelector('.target-letter')?.getBoundingClientRect();
    if(!destination){finish();return;}
    const sx=origin.x+origin.width/2,sy=origin.y+origin.height/2,tx=destination.x+destination.width/2,ty=destination.y+destination.height/2;
    const svg=document.createElementNS(SVG_NS,'svg');svg.classList.add('word-fireworks-flight');svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    const path=document.createElementNS(SVG_NS,'path');path.classList.add('word-fireworks-trail');
    path.setAttribute('d',`M ${sx} ${sy} C ${Math.min(innerWidth-14,sx+46)} ${sy-100}, ${tx+40} ${ty+100}, ${tx} ${ty}`);
    const head=document.createElementNS(SVG_NS,'g');head.classList.add('word-fireworks-rocket');
    head.setAttribute('transform',`translate(${sx} ${sy})`);
    for(const [radius,className] of [[9,'fireworks-halo'],[3.5,'fireworks-core']]){const circle=document.createElementNS(SVG_NS,'circle');circle.setAttribute('r',String(radius));circle.setAttribute('class',className);head.append(circle);}
    svg.append(path,head);layer.append(svg);source.classList.add('fireworks-launch');
    const length=path.getTotalLength();path.style.strokeDasharray=String(length);path.style.strokeDashoffset=String(length);
    let began=null;
    function fly(now){
      if(!currentTarget()){finish();return;}
      began??=now;const progress=Math.min(1,(now-began)/FLIGHT_MS),distance=length*(1-(1-progress)**1.35),point=path.getPointAtLength(distance);
      head.setAttribute('transform',`translate(${point.x} ${point.y})`);path.style.strokeDashoffset=String(length-distance);
      if(progress<1)frame=requestAnimationFrame(fly);else{head.remove();lightWord();}
    }
    frame=requestAnimationFrame(fly);
  }
  frame=requestAnimationFrame(start);
  return {cancel:finish};
}
