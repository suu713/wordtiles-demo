// Each polygon is a real piece of the tile face, including its letter.
export function createTilePieces(divisions=4){
  const count=Math.max(2,Math.min(5,divisions)),step=100/count,random=randomFor(0x71e5^count);
  const grid=Array.from({length:count+1},(_,row)=>Array.from({length:count+1},(_,column)=>[
    column===0?0:column===count?100:Math.round(column*step+(random()-.5)*step*.26),
    row===0?0:row===count?100:Math.round(row*step+(random()-.5)*step*.26),
  ]));
  const pieces=[];
  for(let row=0;row<count;row++)for(let column=0;column<count;column++){
    const a=grid[row][column],b=grid[row][column+1],c=grid[row+1][column+1],d=grid[row+1][column];
    pieces.push(...((row+column)%2?[[a,b,d],[b,c,d]]:[[a,b,c],[a,c,d]]));
  }
  return pieces;
}
export const TILE_PIECES=createTilePieces();
export const SHATTER_TIMING=Object.freeze({minLife:1000,maxLife:1500,wave:140,settle:90});
export const SHATTER_DURATION=SHATTER_TIMING.maxLife+SHATTER_TIMING.wave+SHATTER_TIMING.settle;

function randomFor(seed){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}

export function createShardMotion(points,width,height,random=Math.random){
  const cx=points.reduce((sum,p)=>sum+p[0],0)/points.length-50,cy=points.reduce((sum,p)=>sum+p[1],0)/points.length-50;
  const angle=(Math.hypot(cx,cy)<8?random()*Math.PI*2:Math.atan2(cy,cx))+(random()-.5)*.4;
  const speed=width*(.3+random()*.34);
  return {vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,gravity:height*1.4,
    angularVelocity:(random()<.5?-1:1)*(90+random()*270),
    lifetime:SHATTER_TIMING.minLife+Math.round(random()*(SHATTER_TIMING.maxLife-SHATTER_TIMING.minLife))};
}

// Pixel/second velocities and constant gravity, evaluated from elapsed time.
// This keeps the trajectory identical at different frame rates, without easing.
export function sampleShardMotion(motion,ageMs){
  const age=Math.max(0,Math.min(ageMs,motion.lifetime)),seconds=age/1000;
  const fadeStart=motion.lifetime*.82;
  return {x:motion.vx*seconds,y:motion.vy*seconds+.5*motion.gravity*seconds*seconds,
    angle:motion.angularVelocity*seconds,opacity:age<=fadeStart?1:Math.max(0,(motion.lifetime-age)/(motion.lifetime-fadeStart))};
}

export function buildShatterLayer(slots,panel){
  const bounds=panel.getBoundingClientRect(),width=panel.clientWidth,height=panel.clientHeight;
  if(!bounds.width||!bounds.height||!width||!height)return null;
  if(!slots.length)return null;
  const layer=document.createElement('div');layer.className='board-shatter-layer';layer.setAttribute('aria-hidden','true');
  const fragment=document.createDocumentFragment(),particles=[];
  slots.forEach((slot,index)=>{
    const rect=slot.getBoundingClientRect(),style=getComputedStyle(slot),glyph=slot.querySelector('.tile-letter'),glyphStyle=getComputedStyle(glyph);
    const x=(rect.left-bounds.left)/bounds.width*width,y=(rect.top-bounds.top)/bounds.height*height;
    const tileWidth=rect.width/bounds.width*width,tileHeight=rect.height/bounds.height*height;
    const random=randomFor(0x57a77e^Math.imul(Number(slot.dataset.cell??index)+1,2654435761));
    const delay=Math.floor(random()*SHATTER_TIMING.wave);
    // Keep chip size comparable to the old, much smaller target-tile fragments.
    const pieces=createTilePieces(Math.max(2,Math.min(5,Math.ceil(tileWidth/(width*.047)))));
    pieces.forEach(points=>{
      const shard=document.createElement('span');shard.className='tile-shard';
      shard.dataset.shardCell=slot.dataset.cell;
      const letter=document.createElement('span');letter.textContent=glyph.textContent;
      Object.assign(letter.style,{font:glyphStyle.font,color:glyphStyle.color,textShadow:glyphStyle.textShadow,transform:glyphStyle.transform});shard.append(letter);
      Object.assign(shard.style,{left:`${x}px`,top:`${y}px`,width:`${tileWidth}px`,height:`${tileHeight}px`,backgroundImage:style.backgroundImage,clipPath:`polygon(${points.map(point=>point.join('% ')+'%').join(',')})`,transformOrigin:`${points.reduce((sum,p)=>sum+p[0],0)/points.length}% ${points.reduce((sum,p)=>sum+p[1],0)/points.length}%`});
      particles.push({element:shard,delay,...createShardMotion(points,width,height,random)});
      fragment.append(shard);
    });
    for(let spark=0;spark<2;spark++){
      const dust=document.createElement('i');dust.className='tile-shatter-dust';
      dust.style.left=`${x+tileWidth*.5}px`;dust.style.top=`${y+tileHeight*.5}px`;
      dust.style.opacity='0';
      particles.push({element:dust,delay,...createShardMotion([[50,50]],width,height,random)});
      fragment.append(dust);
    }
  });
  layer.append(fragment);return {layer,particles};
}

export class BoardShatter {
  constructor({isVisible=()=>true,reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true,createLayer=buildShatterLayer,setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=timer=>globalThis.clearTimeout(timer),requestFrame=fn=>globalThis.requestAnimationFrame(fn),cancelFrame=id=>globalThis.cancelAnimationFrame(id),now=()=>globalThis.performance.now()}={}){
    this.isVisible=isVisible;this.reducedMotion=reducedMotion;this.createLayer=createLayer;this.setTimer=setTimer;this.clearTimer=clearTimer;
    this.requestFrame=requestFrame;this.cancelFrame=cancelFrame;this.now=now;
    this.session=null;this.counts=[];this.active=new Set();
  }
  isRunning(session){return this.session===session&&this.active.size>0;}
  // Capture the old tile faces before render clears the newly exhausted cells.
  sync(session,tiles,panel){
    if(this.session!==session){this.cancel();this.session=session;this.counts=session?[...session.counts]:[];return false;}
    if(!session)return false;
    const exhausted=tiles.filter((tile,index)=>this.counts[index]>0&&session.counts[index]===0);
    this.counts=[...session.counts];
    if(!exhausted.length||session.status==='anomaly'||!this.isVisible()||this.reducedMotion())return false;
    const effect=this.createLayer(exhausted,panel);if(!effect)return false;
    const {layer,particles}=effect;
    const record={session,layer,particles,timer:null,frame:null,startedAt:this.now()};this.active.add(record);
    panel.append(layer);
    record.frame=this.requestFrame(time=>this.draw(record,time));
    record.timer=this.setTimer(()=>this.finish(record),SHATTER_DURATION);
    return true;
  }
  draw(record,time){
    if(!this.active.has(record))return;
    let alive=false;
    for(const particle of record.particles){
      if(particle.dead)continue;
      const age=time-record.startedAt-particle.delay;
      if(age>=particle.lifetime){particle.element.remove();particle.dead=true;continue;}
      alive=true;if(age<0)continue;
      const state=sampleShardMotion(particle,age);
      particle.element.style.transform=`translate(${state.x}px,${state.y}px) rotate(${state.angle}deg)`;
      particle.element.style.opacity=String(state.opacity);
    }
    record.frame=alive?this.requestFrame(next=>this.draw(record,next)):null;
  }
  finish(record){if(!this.active.delete(record))return;this.clearTimer(record.timer);this.cancelFrame(record.frame);record.layer.remove();}
  cancel(){for(const record of [...this.active])this.finish(record);}
}
