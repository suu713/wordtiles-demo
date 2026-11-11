// Shards contain only a cropped piece of the material bitmap. Live letters and
// remaining-use badges never enter this rendering layer.
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

export const SHATTER_PROFILES=Object.freeze(Object.fromEntries(Object.entries({
  original:{speed:1,gravity:1,spin:1,drag:0,endScale:1,round:0,deform:0,alpha:1},
  stone:{speed:.78,gravity:1.45,spin:.35,drag:.1,endScale:.75,round:0,deform:0,alpha:1},
  sand:{speed:.55,gravity:1.35,spin:.2,drag:2.8,endScale:.25,round:0,deform:0,alpha:1},
  ice:{speed:1.12,gravity:1.05,spin:1.45,drag:.12,endScale:.65,round:0,deform:0,alpha:.92},
  biscuit:{speed:.72,gravity:1.2,spin:.8,drag:.9,endScale:.45,round:6,deform:0,alpha:1},
  jelly:{speed:.9,gravity:.58,spin:.75,drag:.9,endScale:.7,round:32,deform:.22,alpha:1},
  wood:{speed:1.02,gravity:1.15,spin:.8,drag:.3,endScale:.7,round:0,deform:0,alpha:1},
}).map(([id,profile])=>[id,Object.freeze({id,...profile})])));
export const shatterProfile=material=>SHATTER_PROFILES[material]||SHATTER_PROFILES.original;

function createMaterialGrid(columns,rows,triangles=false,jitter=.25){
  const random=randomFor(0x7e57^columns^rows*31),grid=Array.from({length:rows+1},(_,row)=>Array.from({length:columns+1},(_,column)=>[
    column===0?0:column===columns?100:(column+(random()-.5)*jitter)*100/columns,
    row===0?0:row===rows?100:(row+(random()-.5)*jitter)*100/rows,
  ])),pieces=[];
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const a=grid[row][column],b=grid[row][column+1],c=grid[row+1][column+1],d=grid[row+1][column];
    if(triangles)pieces.push(...((row+column)%2?[[a,b,d],[b,c,d]]:[[a,b,c],[a,c,d]]));
    else pieces.push([a,b,c,d]);
  }
  return pieces;
}

export function createMaterialPieces(material,divisions=4){
  const n=Math.max(2,Math.min(5,divisions));
  switch(material){
    case 'stone':return createTilePieces(Math.max(2,n-1));
    case 'sand':return createMaterialGrid(n+3,n+3);
    case 'ice':return createMaterialGrid(Math.max(2,Math.floor(n*.6)),n+2,true);
    case 'biscuit':return createTilePieces(Math.min(5,n+1));
    case 'jelly':return createMaterialGrid(Math.max(2,n-1),Math.max(2,n-1),false,0);
    case 'wood':return createMaterialGrid(2,n+3);
    default:return createTilePieces(n);
  }
}

function randomFor(seed){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}

export function createShardMotion(points,width,height,random=Math.random,material='original'){
  const profile=shatterProfile(material);
  const cx=points.reduce((sum,p)=>sum+p[0],0)/points.length-50,cy=points.reduce((sum,p)=>sum+p[1],0)/points.length-50;
  const angle=(Math.hypot(cx,cy)<8?random()*Math.PI*2:Math.atan2(cy,cx))+(random()-.5)*.4;
  const speed=width*(.3+random()*.34)*profile.speed;
  return {vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,gravity:height*1.4*profile.gravity,
    angularVelocity:(random()<.5?-1:1)*(90+random()*270)*profile.spin,
    drag:profile.drag,endScale:profile.endScale,deform:profile.deform,alpha:profile.alpha,
    lifetime:SHATTER_TIMING.minLife+Math.round(random()*(SHATTER_TIMING.maxLife-SHATTER_TIMING.minLife))};
}

// Pixel/second velocities and constant gravity, evaluated from elapsed time.
// This keeps the trajectory identical at different frame rates, without easing.
export function sampleShardMotion(motion,ageMs){
  const age=Math.max(0,Math.min(ageMs,motion.lifetime)),seconds=age/1000;
  const fadeStart=motion.lifetime*.82,drag=motion.drag||0,progress=age/motion.lifetime;
  // Analytical drag under constant gravity keeps the motion independent of FPS.
  const travel=drag?(1-Math.exp(-drag*seconds))/drag:seconds;
  const scale=1-(1-(motion.endScale??1))*progress**.7;
  const squash=(motion.deform||0)*Math.sin(progress*Math.PI*6)*Math.exp(-progress*3);
  return {x:motion.vx*travel,y:drag?(motion.vy-motion.gravity/drag)*travel+motion.gravity/drag*seconds:motion.vy*seconds+.5*motion.gravity*seconds*seconds,
    angle:motion.angularVelocity*seconds,opacity:(motion.alpha??1)*(age<=fadeStart?1:Math.max(0,(motion.lifetime-age)/(motion.lifetime-fadeStart))),
    scaleX:scale*(1+squash),scaleY:scale/(1+squash)};
}

export function buildShatterLayer(slots,panel){
  const bounds=panel.getBoundingClientRect(),width=panel.clientWidth,height=panel.clientHeight;
  if(!bounds.width||!bounds.height||!width||!height)return null;
  if(!slots.length)return null;
  const defaultMaterial=panel.ownerDocument.documentElement.dataset.tileMaterial;
  const layer=document.createElement('div');layer.className='board-shatter-layer';layer.setAttribute('aria-hidden','true');layer.dataset.material=defaultMaterial||'original';
  const fragment=document.createDocumentFragment(),particles=[];
  slots.forEach((slot,index)=>{
    const profile=shatterProfile(slot.dataset.shatterMaterial||defaultMaterial);
    const rect=slot.getBoundingClientRect(),style=getComputedStyle(slot);
    const x=(rect.left-bounds.left)/bounds.width*width,y=(rect.top-bounds.top)/bounds.height*height;
    const tileWidth=rect.width/bounds.width*width,tileHeight=rect.height/bounds.height*height;
    const random=randomFor(0x57a77e^Math.imul(Number(slot.dataset.cell??index)+1,2654435761));
    const delay=Math.floor(random()*SHATTER_TIMING.wave);
    // Keep chip size comparable to the old, much smaller target-tile fragments.
    const pieces=createMaterialPieces(profile.id,Math.ceil(tileWidth/(width*.047)));
    pieces.forEach(points=>{
      const shard=document.createElement('span');shard.className='tile-shard';
      shard.dataset.shardCell=slot.dataset.cell;shard.dataset.material=profile.id;
      const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]),left=Math.min(...xs),top=Math.min(...ys),w=Math.max(...xs)-left,h=Math.max(...ys)-top;
      const polygon=points.map(([px,py])=>`${(px-left)/w*100}% ${(py-top)/h*100}%`).join(',');
      Object.assign(shard.style,{left:`${x+left/100*tileWidth}px`,top:`${y+top/100*tileHeight}px`,width:`${w/100*tileWidth}px`,height:`${h/100*tileHeight}px`,
        backgroundImage:style.backgroundImage,backgroundSize:`${tileWidth}px ${tileHeight}px`,backgroundPosition:`${-left/100*tileWidth}px ${-top/100*tileHeight}px`,
        clipPath:`polygon(${polygon})`,borderRadius:profile.round+'%',transformOrigin:'50% 50%',opacity:'0'});
      particles.push({element:shard,delay,...createShardMotion(points,width,height,random,profile.id)});
      fragment.append(shard);
    });
  });
  layer.append(fragment);return {layer,particles};
}

export class BoardShatter {
  constructor({isVisible=()=>true,reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true,createLayer=buildShatterLayer,setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=timer=>globalThis.clearTimeout(timer),requestFrame=fn=>globalThis.requestAnimationFrame(fn),cancelFrame=id=>globalThis.cancelAnimationFrame(id),now=()=>globalThis.performance.now(),onIdle=()=>{}}={}){
    this.isVisible=isVisible;this.reducedMotion=reducedMotion;this.createLayer=createLayer;this.setTimer=setTimer;this.clearTimer=clearTimer;
    this.requestFrame=requestFrame;this.cancelFrame=cancelFrame;this.now=now;
    this.session=null;this.counts=[];this.active=new Set();this.onIdle=onIdle;
  }
  isRunning(session){return this.session===session&&this.active.size>0;}
  // Capture the old tile faces before render clears the newly exhausted cells.
  sync(session,tiles,panel){
    if(this.session!==session){this.cancel();this.session=session;this.counts=session?[...session.counts]:[];return false;}
    if(!session)return false;
    const exhausted=tiles.filter((tile,index)=>this.counts[index]>0&&session.counts[index]===0);
    this.counts=[...session.counts];
    if(!exhausted.length||session.status==='anomaly'||!this.isVisible()||this.reducedMotion())return false;
    return this.burst(exhausted,panel,session);
  }
  burst(slots,panel,session=this.session){
    if(!slots.length||!this.isVisible()||this.reducedMotion())return false;
    if(this.session!==session){this.cancel();this.session=session;}
    const effect=this.createLayer(slots,panel);if(!effect)return false;
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
      particle.element.style.transform=`translate(${state.x}px,${state.y}px) rotate(${state.angle}deg) scale(${state.scaleX},${state.scaleY})`;
      particle.element.style.opacity=String(state.opacity);
    }
    record.frame=alive?this.requestFrame(next=>this.draw(record,next)):null;
  }
  finish(record,notify=true){if(!this.active.delete(record))return;this.clearTimer(record.timer);this.cancelFrame(record.frame);record.layer.remove();if(notify&&this.active.size===0)this.onIdle(record.session);}
  cancel(){for(const record of [...this.active])this.finish(record,false);}
}
