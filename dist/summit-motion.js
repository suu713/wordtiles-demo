import {SUMMIT_STEPS} from './core/summit-progress.js?v=1';

export const SUMMIT_TIMING=Object.freeze({intro:360,walk:1460,rewardPause:130,coinStep:65,coinFlight:760,coins:9,rest:260});
export const SUMMIT_DURATION=SUMMIT_TIMING.intro+SUMMIT_TIMING.walk+SUMMIT_TIMING.rewardPause+(SUMMIT_TIMING.coins-1)*SUMMIT_TIMING.coinStep+SUMMIT_TIMING.coinFlight+SUMMIT_TIMING.rest;
export const SUMMIT_ROUTE='M110 445 C180 431 424 382 458 343 C480 316 258 310 206 262 C177 235 343 219 357 193 C369 170 310 146 302 104';
const curves=[[[110,445],[180,431],[424,382],[458,343]],[[458,343],[480,316],[258,310],[206,262]],[[206,262],[177,235],[343,219],[357,193]],[[357,193],[369,170],[310,146],[302,104]]];
const clamp=t=>Math.max(0,Math.min(1,t));
const cubic=(p,t)=>{const u=1-t;return {x:u*u*u*p[0][0]+3*u*u*t*p[1][0]+3*u*t*t*p[2][0]+t*t*t*p[3][0],y:u*u*u*p[0][1]+3*u*u*t*p[1][1]+3*u*t*t*p[2][1]+t*t*t*p[3][1]};};
const route=[];let length=0;
for(const curve of curves)for(let i=route.length?1:0;i<=64;i++){
  const p=cubic(curve,i/64),last=route.at(-1);if(last)length+=Math.hypot(p.x-last.x,p.y-last.y);route.push({...p,length});
}
export function summitPoint(progress){
  const distance=clamp(progress)*length;let i=1;while(i<route.length-1&&route[i].length<distance)i++;
  const a=route[i-1],b=route[i],t=(distance-a.length)/(b.length-a.length);
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,facing:b.x>=a.x?1:-1};
}
export function summitFrame(elapsed,award){
  const walking=clamp((elapsed-SUMMIT_TIMING.intro)/SUMMIT_TIMING.walk),ease=walking*walking*(3-2*walking);
  const fraction=(award.fromStep+(award.toStep-award.fromStep)*ease)/SUMMIT_STEPS;
  const rewardAt=SUMMIT_TIMING.intro+SUMMIT_TIMING.walk+SUMMIT_TIMING.rewardPause;
  const arrivals=Array.from({length:SUMMIT_TIMING.coins},(_,i)=>clamp((elapsed-rewardAt-i*SUMMIT_TIMING.coinStep)/SUMMIT_TIMING.coinFlight));
  const arrived=arrivals.filter(t=>t===1).length;
  return {fraction,point:summitPoint(fraction),walking:walking>0&&walking<1,arrivals,
    rewardStarted:elapsed>=rewardAt,arrived,displayCoins:award.coinsBefore+Math.floor(award.reward*arrived/SUMMIT_TIMING.coins),
    arrivedAtCamp:walking===1,done:elapsed>=SUMMIT_DURATION};
}
export function summitCoin(start,end,progress,index=0){
  const t=clamp(progress),u=1-t,bend=45+index*3;
  const a={x:start.x-bend,y:start.y-60-index*2},b={x:end.x-22,y:end.y+85};
  return {x:u*u*u*start.x+3*u*u*t*a.x+3*u*t*t*b.x+t*t*t*end.x,
    y:u*u*u*start.y+3*u*u*t*a.y+3*u*t*t*b.y+t*t*t*end.y,
    scale:1+.18*Math.sin(Math.PI*t)-.48*t,angle:Math.sin(t*Math.PI)*18*(index%2?1:-1),opacity:t===0||t===1?0:Math.min(1,t*12,(1-t)*12)};
}
