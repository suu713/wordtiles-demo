import {createDailyCheckin,CHECKIN_KEY} from './core/daily-checkin.js?v=2';

export const CHECKIN_MOTION=Object.freeze({chargeMs:1000,colorMs:850,colorDelayMs:160,featherMs:800,featherDelayMs:580,bookMs:900,bookDelayMs:1440,numberDelayMs:1900,weekDelayMs:2170,stampDelayMs:2380,buttonDelayMs:2490,totalMs:3160});
const ART='./art/checkin/';
const picture=(path,className)=>`<img class="${className}" src="${ART+path}" alt="" draggable="false" aria-hidden="true">`;
const repeatIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6"/></svg>';

export function mountDailyCheckin({storage,onPlay=()=>{},canPlay=()=>true,beforeOpen=()=>{}}={}){
  const progress=createDailyCheckin(storage),entry=document.getElementById('lobby-checkin');
  const dialog=document.createElement('dialog');dialog.id='checkin-dialog';dialog.className='checkin-dialog';dialog.setAttribute('aria-label','每日签到');
  dialog.innerHTML=`<div class="checkin-stage" data-phase="unlit">
    <button id="checkin-close" class="checkin-close" type="button" aria-label="返回大厅"><img src="./art/yanqi/btn_fanhui@2x.png" alt=""></button>
    <button id="checkin-replay" class="checkin-replay" type="button" aria-label="重播点亮动效" title="重播点亮" hidden>${repeatIcon}</button>
    <div class="checkin-unlit-art" aria-hidden="true">${picture('unlit/guang@2x.png','checkin-orbit')}${picture('unlit/andi@2x.png','checkin-shadow')}</div>
    <button id="checkin-light" class="checkin-light" type="button" aria-label="点亮羽毛，完成今日签到"><span>Light the spark!</span></button>
    <div class="checkin-feather" aria-hidden="true"><div class="checkin-feather-sway"><div class="checkin-feather-charge">${picture('unlit/weidianliang@2x.png','checkin-feather-white')}${picture('lit/bi@2x.png','checkin-feather-purple')}</div></div></div>
    <div class="checkin-finished" aria-hidden="true" inert>
      <div class="checkin-book-art" aria-hidden="true">
        ${picture('lit/guang@2x.png','checkin-rays')}${picture('lit/dd@2x.png','checkin-dust')}<div class="checkin-book-anchor"><div class="checkin-book-sway">${picture('lit/shu@2x.png','checkin-book')}</div></div>
        ${picture('lit/yumao1@2x(1).png','checkin-petal checkin-petal-left')}${picture('lit/yumao1@2x.png','checkin-petal checkin-petal-right')}
        ${picture('lit/xx1@2x.png','checkin-star checkin-star-one')}${picture('lit/xx2@2x.png','checkin-star checkin-star-two')}${picture('lit/xx3@2x.png','checkin-star checkin-star-three')}
      </div>
      <div class="checkin-streak"><strong id="checkin-streak-number">0</strong></div>
      <div class="checkin-streak-label">${picture('lit/xian@2x.png','checkin-streak-line')}<span>Day Streak</span></div>
      <div class="checkin-week-card"><ol id="checkin-week" class="checkin-week" aria-label="本周签到记录"></ol></div>
      <button id="checkin-play" class="checkin-play" type="button">Play Now</button>
    </div>
    <p id="checkin-status" class="sr-only" role="status" aria-live="polite"></p><p id="checkin-storage-note" class="checkin-storage-note" hidden>签到仅在本次浏览中保留</p>
  </div>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id),stage=dialog.querySelector('.checkin-stage'),finished=dialog.querySelector('.checkin-finished');
  for(const [name,value]of Object.entries(CHECKIN_MOTION))stage.style.setProperty('--'+name,value+'ms');
  let busy=false,stopped=false,timer=null,dateTimer=null,request=0,playing=false,transitionDay=null;
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Start decoding before the entry is used. A failed image never records a check-in.
  const artReady=Promise.all([...dialog.querySelectorAll('img')].map(image=>image.decode()));
  void artReady.catch(()=>{});
  function refreshEntry(){const state=progress.snapshot();entry.dataset.signed=String(state.signed);entry.querySelector('span').textContent=state.signed?'已签到':'每日签到';entry.setAttribute('aria-label',state.signed?`每日签到，已连续签到${state.streak}天`:'每日签到，点亮今日羽毛');}
  function renderWeek(state){
    $('checkin-streak-number').textContent=String(state.streak);
    $('checkin-week').dataset.order=state.weekMode;
    $('checkin-week').setAttribute('aria-label',state.weekMode==='today-first'?'签到记录，从今天开始顺排七天':'本周签到记录，周一至周日');
    $('checkin-week').replaceChildren(...state.week.map(day=>{
      const cell=document.createElement('li');cell.dataset.today=String(day.today);cell.dataset.signed=String(day.signed);cell.setAttribute('aria-label',`${day.date}，${day.signed?'已签到':day.today?'今日未签到':'未签到'}${day.gift?'，礼物日':''}`);
      if(day.today)cell.setAttribute('aria-current','date');
      const label=document.createElement('span');label.className='checkin-weekday';label.textContent=day.label;
      const circle=document.createElement('span');circle.className='checkin-day';
      circle.innerHTML=picture(day.signed?'lit/wancheng@2x.png':'lit/yuandi1@2x.png','checkin-day-base')+(!day.signed&&day.gift?picture('lit/libao@2x.png','checkin-gift'):'');
      cell.append(label,circle);return cell;
    }));
  }
  function phase(value){
    stage.dataset.phase=value;
    finished.inert=value!=='lit';finished.setAttribute('aria-hidden',String(value==='unlit'));
    $('checkin-light').hidden=value==='lit';$('checkin-light').disabled=value!=='unlit';$('checkin-light').setAttribute('aria-hidden',String(value!=='unlit'));
    $('checkin-replay').hidden=value==='unlit';$('checkin-replay').disabled=value!=='lit';
    $('checkin-play').disabled=!canPlay();
  }
  function cancel(){request++;clearTimeout(timer);timer=null;busy=false;}
  function settle(){
    clearTimeout(timer);timer=null;busy=false;
    const state=progress.snapshot();refreshEntry();renderWeek(state);phase(state.signed?'lit':'unlit');
    $('checkin-status').textContent=state.today!==transitionDay?'新的一天，可以点亮今日羽毛':`已连续签到 ${state.streak} 天`;
  }
  function update(){refreshEntry();if(!dialog.open||busy)return;const state=progress.snapshot();renderWeek(state);phase(state.signed?'lit':'unlit');}
  function armMidnight(){
    clearTimeout(dateTimer);const now=new Date(),midnight=new Date(now);midnight.setHours(24,0,0,30);
    dateTimer=setTimeout(()=>{update();armMidnight();},Math.max(1,midnight-now));
  }
  async function open(){
    if(stopped||dialog.open)return;
    beforeOpen();progress.reload();refreshEntry();renderWeek(progress.snapshot());phase(progress.snapshot().signed?'lit':'unlit');$('checkin-status').textContent='';$('checkin-storage-note').hidden=true;
    dialog.showModal();armMidnight();
    // Decode failure is surfaced before the interactive action can grant today's check-in.
    try{await artReady;}catch{if(dialog.open)$('checkin-status').textContent='签到图片加载失败，请刷新后重试';}
  }
  async function light(replay=false){
    if(busy||stopped||!dialog.open)return;
    busy=true;const token=++request;$('checkin-light').disabled=true;$('checkin-replay').disabled=true;
    try{await artReady;}catch{if(token===request){busy=false;update();$('checkin-status').textContent='签到图片加载失败，请刷新后重试';}return;}
    if(token!==request||!dialog.open||stopped)return;
    const result=replay?progress.snapshot():progress.checkIn();
    if(!replay&&!result.added){busy=false;update();return;}
    transitionDay=result.today;refreshEntry();renderWeek(result);$('checkin-storage-note').hidden=replay||result.saved!==false;
    stage.dataset.phase='unlit';void stage.offsetWidth;phase('lighting');
    $('checkin-status').textContent=replay?'正在重播点亮':'今日签到成功';
    if(reduced()){settle();return;}
    timer=setTimeout(()=>{if(token===request&&dialog.open)settle();},CHECKIN_MOTION.totalMs);
  }
  entry.addEventListener('click',open);
  $('checkin-light').addEventListener('click',()=>light());$('checkin-replay').addEventListener('click',()=>light(true));
  $('checkin-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{cancel();clearTimeout(dateTimer);dateTimer=null;update();entry.focus({preventScroll:true});});
  $('checkin-play').addEventListener('click',async()=>{
    if(playing||busy||!canPlay())return;playing=true;$('checkin-play').disabled=true;
    dialog.close();try{await onPlay();}finally{playing=false;}
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(busy)settle();progress.reload();update();if(dialog.open)armMidnight();}});
  window.addEventListener('storage',event=>{if(event.storageArea===storage&&(event.key===CHECKIN_KEY||event.key===null)){progress.reload();if(busy){cancel();}update();}});
  const motion=matchMedia('(prefers-reduced-motion: reduce)');motion.addEventListener('change',()=>{if(motion.matches&&busy)settle();});
  refreshEntry();
  return {update,prepareDataReset(){stopped=true;cancel();clearTimeout(dateTimer);if(dialog.open)dialog.close();}};
}
