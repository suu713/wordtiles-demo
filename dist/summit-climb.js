import {createSummitProgress,summitAdvance,SUMMIT_STEPS} from './core/summit-progress.js?v=1';
import {SUMMIT_DURATION,SUMMIT_TIMING,summitFrame,summitPoint,summitCoin} from './summit-motion.js?v=1';
import {summitArtMarkup,summitCoinMarkup} from './summit-art.js?v=1';

const wordsFor=session=>(session?.initial?.targets||[]).map(target=>typeof target==='string'?target:target.word);

// The reward is committed once. Replaying or closing its presentation cannot award it again.
export class SummitClimb {
  constructor({progress,view,isVisible=()=>true,reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true,onIdle=()=>{},id=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`}={}){
    Object.assign(this,{progress,view,isVisible,reducedMotion,onIdle,id});
    this.observed=new WeakSet();this.shown=new WeakSet();this.active=null;this.stopped=false;
  }
  sync(session){
    if(this.active?.session&&this.active.session!==session)this.cancel();
    if(!session||this.observed.has(session))return;
    this.observed.add(session);if(session.status==='won')this.shown.add(session);
  }
  play(session){
    this.sync(session);if(this.isRunning(session))return true;
    const words=wordsFor(session);
    if(this.stopped||!session||session.status!=='won'||!words.length||!words.every(word=>session.completed.has(word))||this.shown.has(session))return false;
    this.shown.add(session);if(!this.isVisible())return false;
    const award=this.progress.award(this.id());if(!award||this.reducedMotion())return false;
    const record={session,award,preview:false};this.active=record;
    try{this.view.show(award,{preview:false});}catch(error){this.cancel();console.warn('Summit presentation could not start.',error);return false;}
    return true;
  }
  preview(){
    if(this.stopped||this.active?.session)return false;
    this.cancel();this.active={session:null,award:summitAdvance(this.progress.snapshot()),preview:true};
    this.view.show(this.active.award,{preview:true});return true;
  }
  advancePreview(){
    if(!this.active?.preview)return false;
    const previous=this.active.award;
    this.active.award=summitAdvance({totalSteps:previous.totalSteps,coins:previous.coinsAfter});
    this.view.show(this.active.award,{preview:true});return true;
  }
  replay(){if(this.active)this.view.show(this.active.award,{preview:this.active.preview});}
  finish(){
    const record=this.active;if(!record)return;
    this.active=null;this.view.hide();if(record.session)this.onIdle(record.session);
  }
  isRunning(session){return !!this.active?.session&&this.active.session===session;}
  cancel(){if(!this.active)return;this.active=null;this.view.hide();}
  prepareDataReset(){this.stopped=true;this.cancel();}
}

export function mountSummitClimb({storage,isVisible,onIdle,beforePreview=()=>{}}={}){
  const progress=createSummitProgress(storage),dialog=document.createElement('dialog');
  dialog.id='summit-dialog';dialog.className='summit-dialog';dialog.setAttribute('aria-labelledby','summit-title');dialog.setAttribute('aria-describedby','summit-status');
  dialog.innerHTML=`<div class="summit-backdrop"></div><div class="summit-aura"></div>
    <header class="summit-topbar"><button id="summit-close" class="summit-disc" type="button" aria-label="关闭登山展示">×</button><span id="summit-mode">本关登高</span>
      <div class="summit-wallet" aria-label="登山金币"><img src="./art/yanqi/jinbi@2x.png" alt=""><div><small>登山金币</small><strong id="summit-coins">0</strong></div></div></header>
    <div class="summit-heading"><span>ALPS · SUMMIT TRAIL</span><h2 id="summit-title">Summit Trail</h2><p id="summit-subtitle">再向高处，前进一步</p></div>
    <div class="summit-stage">${summitArtMarkup()}<i class="summit-spark spark-a"></i><i class="summit-spark spark-b"></i><i class="summit-spark spark-c"></i></div>
    <div class="summit-particles" aria-hidden="true">${Array.from({length:SUMMIT_TIMING.coins},()=>`<svg class="summit-flying-coin" viewBox="-22 -25 44 48">${summitCoinMarkup}</svg>`).join('')}</div>
    <div class="summit-caption"><p id="summit-route-count">已走过 <strong>0</strong> / 12 段山路</p><p id="summit-next-camp">下一站 · 云杉营地</p>
      <div class="summit-progress" role="progressbar" aria-label="本座山峰攀登进度" aria-valuemin="0" aria-valuemax="12" aria-valuenow="0"><span></span>${[3,6,9,12].map(step=>`<i style="--camp-position:${step/12*100}%" data-step="${step}"></i>`).join('')}</div></div>
    <p id="summit-status" class="summit-status" role="status" aria-live="polite"></p>
    <footer class="summit-footer"><button id="summit-next-preview" class="summit-primary" type="button">再爬一段</button><button id="summit-continue" class="summit-continue" type="button">点击继续</button></footer>
    <button id="summit-replay" class="summit-replay" type="button" aria-label="重播本段登山动画"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9a8 8 0 1 1-1 7M5 3v6h6"/></svg></button>`;
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector),wallet=$('#summit-coins'),actor=$('.summit-walker-position'),facing=$('.summit-walker-facing');
  const trace=$('.summit-route-progress'),glow=$('.summit-reward-glow'),reward=$('.summit-reward-label'),coins=[...dialog.querySelectorAll('.summit-flying-coin')];
  let raf=null,version=0,activeAward=null,start=0,geometry=null,lastArrived=0,announced=false,walletAnimation=null;
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function stop(){++version;if(raf!==null)cancelAnimationFrame(raf);raf=null;walletAnimation?.cancel();walletAnimation=null;}
  function measure(){
    if(!dialog.open||!activeAward)return;
    const bounds=dialog.getBoundingClientRect(),stage=$('.summit-art').getBoundingClientRect(),end=$('.summit-wallet img').getBoundingClientRect();
    const p=summitPoint(activeAward.toStep/SUMMIT_STEPS),sx=dialog.clientWidth/bounds.width,sy=dialog.clientHeight/bounds.height;
    geometry={from:{x:(stage.left+stage.width*p.x/600-bounds.left)*sx,y:(stage.top+stage.height*p.y/520-bounds.top)*sy},
      to:{x:(end.left+end.width/2-bounds.left)*sx,y:(end.top+end.height/2-bounds.top)*sy}};
  }
  function render(elapsed){
    const frame=summitFrame(elapsed,activeAward),{point}=frame;
    actor.setAttribute('transform',`translate(${point.x} ${point.y})`);facing.setAttribute('transform',`scale(${point.facing} 1)`);
    dialog.classList.toggle('is-walking',frame.walking);dialog.classList.toggle('is-arrived',frame.arrivedAtCamp);dialog.classList.toggle('is-peak',activeAward.peak&&frame.arrivedAtCamp);
    trace.style.strokeDashoffset=String(1-frame.fraction);
    const displayedStep=frame.arrivedAtCamp?activeAward.toStep:activeAward.fromStep;
    $('#summit-route-count strong').textContent=String(displayedStep);
    const track=$('.summit-progress');track.setAttribute('aria-valuenow',String(displayedStep));track.querySelector('span').style.width=frame.fraction*100+'%';
    for(const camp of dialog.querySelectorAll('[data-step]'))camp.classList.toggle('reached',Number(camp.dataset.step)<=frame.fraction*SUMMIT_STEPS+.001);
    wallet.textContent=frame.displayCoins.toLocaleString();
    if(frame.arrived!==lastArrived){lastArrived=frame.arrived;walletAnimation?.cancel();walletAnimation=$('.summit-wallet').animate([{transform:'scale(1)'},{transform:'scale(1.12)',offset:.35},{transform:'scale(1)'}],{duration:190,easing:'ease-out'});}
    const rewardAt=SUMMIT_TIMING.intro+SUMMIT_TIMING.walk+SUMMIT_TIMING.rewardPause,age=elapsed-rewardAt;
    glow.setAttribute('transform',`translate(${point.x} ${point.y-9})`);glow.style.opacity=age>=0?String(Math.max(0,1-age/850)):0;
    reward.setAttribute('x',String(point.x));reward.setAttribute('y',String(point.y-48-Math.max(0,age)*.03));reward.style.opacity=age>=0?String(Math.min(1,age/130)*Math.max(0,1-age/1150)):0;
    for(const [i,coin]of coins.entries()){
      const sample=summitCoin(geometry.from,geometry.to,frame.arrivals[i],i);coin.style.opacity=String(sample.opacity);
      coin.style.transform=`translate3d(${sample.x-18}px,${sample.y-20}px,0) rotate(${sample.angle}deg) scale(${sample.scale})`;
    }
    if(frame.done&&!announced){
      announced=true;$('#summit-next-preview').disabled=false;
      $('#summit-status').textContent=activeAward.peak?'已抵达山顶，登山金币 +15':'本段攀登完成，登山金币 +15';
      $('#summit-next-camp').textContent=activeAward.peak?'下一座山峰，等你出发':activeAward.toStep<3?'下一站 · 云杉营地':activeAward.toStep<6?'下一站 · 云海营地':activeAward.toStep<9?'下一站 · 雪线营地':'下一站 · 云端之巅';
    }
    return frame.done;
  }
  const view={
    show(award,{preview}){
      stop();activeAward=award;lastArrived=0;announced=false;dialog.classList.remove('summit-entering','is-arrived','is-peak','is-walking');dialog.classList.toggle('is-preview',preview);
      $('#summit-mode').textContent=preview?'动效预览':'本关登高';$('#summit-title').textContent=award.peak?'To the Summit!':'Summit Trail';
      $('#summit-subtitle').textContent=award.peak?'山顶的风景，为每一步而来':'再向高处，前进一步';
      $('#summit-continue').textContent=preview?'关闭预览':'点击继续';$('#summit-next-preview').hidden=!preview;$('#summit-next-preview').disabled=true;
      $('#summit-status').textContent='';$('#summit-next-camp').textContent=`本次攀登 +1 · 第 ${Math.floor((award.totalSteps-1)/SUMMIT_STEPS)+1} 座山峰`;
      if(!dialog.open)dialog.showModal();measure();void dialog.offsetWidth;dialog.classList.add('summit-entering');
      render(reduced()?SUMMIT_DURATION:0);
      if(reduced())return;
      const current=version;start=performance.now();
      const draw=now=>{if(current!==version||!dialog.open)return;const done=render(now-start);raf=done?null:requestAnimationFrame(draw);};
      raf=requestAnimationFrame(draw);
    },
    hide(){stop();dialog.classList.remove('is-walking','summit-entering');if(dialog.open)dialog.close();activeAward=null;},
  };
  const effect=new SummitClimb({progress,view,isVisible,onIdle,reducedMotion:reduced});
  $('#summit-close').onclick=()=>effect.finish();$('#summit-continue').onclick=()=>effect.finish();$('#summit-replay').onclick=()=>effect.replay();$('#summit-next-preview').onclick=()=>effect.advancePreview();
  dialog.addEventListener('cancel',event=>{event.preventDefault();effect.finish();});
  dialog.addEventListener('close',()=>{if(effect.active)effect.cancel();});
  document.getElementById('summit-preview').addEventListener('click',()=>{beforePreview();effect.preview();});
  window.addEventListener('resize',measure);
  return effect;
}
