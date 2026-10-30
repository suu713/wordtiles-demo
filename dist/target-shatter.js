// Each polygon is a real piece of the tile face, including its letter.
export const TILE_PIECES=[
  [[0,0],[52,0],[46,38],[18,47],[0,32]],
  [[52,0],[100,0],[100,35],[74,48],[46,38]],
  [[0,32],[18,47],[36,65],[0,78]],
  [[18,47],[46,38],[74,48],[62,76],[36,65]],
  [[74,48],[100,35],[100,100],[78,100],[62,76]],
  [[0,78],[36,65],[45,100],[0,100]],
  [[36,65],[62,76],[78,100],[45,100]],
];
export const SHATTER_TIMING=Object.freeze({flight:880,wave:140,settle:90});
export const SHATTER_DURATION=SHATTER_TIMING.flight+SHATTER_TIMING.wave+SHATTER_TIMING.settle;

function randomFor(seed){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}

export function buildShatterLayer(container,panel){
  const bounds=panel.getBoundingClientRect(),width=panel.clientWidth,height=panel.clientHeight;
  if(!bounds.width||!bounds.height||!width||!height)return null;
  const slots=[...container.querySelectorAll('.target-letter')];if(!slots.length)return null;
  const layer=document.createElement('div');layer.className='target-shatter-layer';layer.setAttribute('aria-hidden','true');
  const fragment=document.createDocumentFragment();
  slots.forEach((slot,index)=>{
    const rect=slot.getBoundingClientRect(),style=getComputedStyle(slot);
    const x=(rect.left-bounds.left)/bounds.width*width,y=(rect.top-bounds.top)/bounds.height*height;
    const tileWidth=rect.width/bounds.width*width,tileHeight=rect.height/bounds.height*height;
    const random=randomFor(0x57a77e^Math.imul(index+1,2654435761));
    const delay=Math.floor(random()*SHATTER_TIMING.wave);
    TILE_PIECES.forEach(points=>{
      const shard=document.createElement('span');shard.className='tile-shard';
      shard.textContent=slot.querySelector('.target-glyph')?.textContent||slot.textContent;
      Object.assign(shard.style,{left:`${x}px`,top:`${y}px`,width:`${tileWidth}px`,height:`${tileHeight}px`,backgroundImage:style.backgroundImage,font:style.font,color:style.color,clipPath:`polygon(${points.map(point=>point.join('% ')+'%').join(',')})`,transformOrigin:`${points.reduce((sum,p)=>sum+p[0],0)/points.length}% ${points.reduce((sum,p)=>sum+p[1],0)/points.length}%`});
      shard.style.setProperty('--shard-x',`${(random()-.68)*width*.95}px`);
      shard.style.setProperty('--shard-y',`${height*(.5+random()*.48)}px`);
      shard.style.setProperty('--shard-lift',`${-(12+random()*28)}px`);
      shard.style.setProperty('--shard-turn',`${(random()-.5)*340}deg`);
      shard.style.setProperty('--shard-delay',`${delay}ms`);
      shard.style.setProperty('--shard-duration',`${SHATTER_TIMING.flight}ms`);
      fragment.append(shard);
    });
    for(let spark=0;spark<2;spark++){
      const dust=document.createElement('i');dust.className='tile-shatter-dust';
      dust.style.left=`${x+tileWidth*.5}px`;dust.style.top=`${y+tileHeight*.5}px`;
      dust.style.setProperty('--shard-x',`${(random()-.65)*width*.8}px`);
      dust.style.setProperty('--shard-y',`${height*(.4+random()*.5)}px`);
      dust.style.setProperty('--shard-lift',`${-(10+random()*20)}px`);
      dust.style.setProperty('--shard-turn',`${random()*360}deg`);
      dust.style.setProperty('--shard-delay',`${delay}ms`);
      dust.style.setProperty('--shard-duration',`${SHATTER_TIMING.flight}ms`);
      fragment.append(dust);
    }
  });
  layer.append(fragment);return layer;
}

export class TargetShatter {
  constructor({onDone=()=>{},isVisible=()=>true,reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true,createLayer=buildShatterLayer,setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=timer=>globalThis.clearTimeout(timer)}={}){
    this.onDone=onDone;this.isVisible=isVisible;this.reducedMotion=reducedMotion;this.createLayer=createLayer;this.setTimer=setTimer;this.clearTimer=clearTimer;
    this.seen=new WeakSet();this.active=null;this.clearedContainer=null;
  }
  isRunning(session){return !!this.active&&this.active.session===session;}
  play(session,container,panel){
    if(!session||session.status!=='won'||this.seen.has(session))return false;
    this.seen.add(session);
    if(!this.isVisible()||this.reducedMotion())return false;
    this.cancel();
    const layer=this.createLayer(container,panel);if(!layer)return false;
    const record={session,layer,container,timer:null};this.active=record;this.clearedContainer=container;
    panel.append(layer);container.classList.add('targets-cleared');
    record.timer=this.setTimer(()=>{
      if(this.active!==record)return;
      layer.remove();this.active=null;this.onDone(session);
    },SHATTER_DURATION);
    return true;
  }
  cancel(){
    if(this.active){this.clearTimer(this.active.timer);this.active.layer.remove();this.active=null;}
    this.clearedContainer?.classList.remove('targets-cleared');this.clearedContainer=null;
  }
}
