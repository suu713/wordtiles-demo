import {createEventProgress,EVENTS_KEY,WEEKLY_STAGES,eventDate} from './core/event-progress.js?v=27';
import {SessionMetrics} from './core/playtest-metrics.js?v=15';
import {WORD_BANK_ORIGIN} from './core/dictionary-banks.js?v=1';
import {dailyPuzzleRecordId,createDailyPuzzle} from './core/daily-puzzle.js?v=1';

const paths={
  wheel:'M16 3a13 13 0 1 0 13 13A13 13 0 0 0 16 3Zm0 0v9m0 8v9M3 16h9m8 0h9M6.8 6.8l6.4 6.4m5.6 5.6 6.4 6.4M6.8 25.2l6.4-6.4m5.6-5.6 6.4-6.4M16 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  pine:'M16 5C11 5 7 12 7 19s4 10 9 10 9-3 9-10S21 5 16 5Zm0 0V2m-5 7 5 4 5-4M8 14l4 4 4-5 4 5 4-4M7 20l5 4 4-6 4 6 5-4m-13 4 4 5 4-5',
  gem:'m7 6-5 9 14 15 14-15-5-9H7Zm-5 9h28M7 6l9 24 9-24M10 15l6-9 6 9',
  coin:'M16 3a13 13 0 1 0 0 26 13 13 0 0 0 0-26Zm0 4a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm2 5h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3m2-10v12',
  gift:'M4 13h24v6H4Zm2 6v10h20V19M16 13v16m0-16c-9 0-11-7-7-8 5-2 7 8 7 8Zm0 0c9 0 11-7 7-8-5-2-7 8-7 8Z',
  clock:'M16 3a13 13 0 1 0 0 26 13 13 0 0 0 0-26Zm0 6v8l5 3',
  star:'m16 3 3.8 8.7 9.5.9-7.2 6.3 2.1 9.3-8.2-4.9-8.2 4.9 2.1-9.3L2.5 12.6l9.5-.9L16 3Z',
  sparkle:'M16 3c0 9-4 13-13 13 9 0 13 4 13 13 0-9 4-13 13-13-9 0-13-4-13-13Z',
  arrow:'M5 16h21M18 8l8 8-8 8',
  check:'M7 16l6 6L26 8',
  hint:'M11 24v-3a10 10 0 1 1 10 0v3m-10 0h10m-9 4h8M13 13l3 3 3-3m-3 3v8',
};
const icon=(name,classes='')=>`<svg class="event-icon ${classes}" viewBox="0 0 32 32" aria-hidden="true"><path d="${paths[name]||paths.star}"/></svg>`;
const landscape=`<svg class="weekly-landscape" viewBox="0 0 390 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="event-sky" x2="0" y2="1"><stop stop-color="#dbe9ed"/><stop offset="1" stop-color="#eff5f2"/></linearGradient></defs><path fill="url(#event-sky)" d="M0 0h390v190H0Z"/><circle cx="289" cy="30" r="15" fill="#f8f8ed"/><path d="m0 112 62-68 32 27 59-63 55 73 48-44 65 60 34-29 35 42v80H0Z" fill="#b0c9cc"/><path d="m61 44 20 17-10 1-9-7-15 8Zm92-36 26 34-13-4-12-12-12 11-16 5Zm103 29 23 22-15-4-8-9-13 9-12 1Z" fill="#f5faf8"/><path d="m0 124 58-23 65 23 75-30 73 24 64-32 55 23v81H0Z" fill="#c2d7d1"/><path d="M0 145q92-35 192 1t198-11v55H0Z" fill="#e5eeE6"/><g fill="#71958a"><path d="m27 80-14 27h9l-16 25h16v20h9v-20h16l-16-25h9Zm310-9-17 32h11l-19 28h19v21h10v-21h19l-19-28h11Z"/><path d="m55 113-9 17h6l-11 17h11v13h6v-13h11l-11-17h6Z" opacity=".6"/></g><path d="M232 140q-38 3-60 26t-44 24" stroke="#f9fcf9" stroke-width="9" fill="none" opacity=".9"/></svg>`;

function panel(id,title,subtitle,body,footer){return `<dialog id="${id}" class="event-dialog" aria-labelledby="${id}-title"><header class="event-header"><div><h2 id="${id}-title">${title}</h2><p>${subtitle}</p></div><button class="event-close" type="button" aria-label="关闭${title}" data-event-close>×</button></header><div class="event-scroll">${body}</div><footer class="event-footer">${footer}</footer></dialog>`;}

export function mountEventViews({storage,onMainPlay,onCollect,onPersonalProgress}){
  const progress=createEventProgress(storage),$=id=>document.getElementById(id);
  let spinning=false,spinTimer=null,rotation=0,stopped=false,expandedRewards=false,displayedDay=eventDate();
  let month=new Date(),selectedDay=eventDate(),dailySession=null,dailyMetrics=null,dailyRecordSession=null,dailyKey='',dailyRawId=null;
  let gemCells=[],pickedGems=new Set(),dailyPaths=[],selection=[],pointerId=null,highlight=[],dailyPlaying=false,loading=false,loadRequest=0,dailySeed=null;
  const observed=new WeakMap();
  const root=document.createElement('div');root.id='event-views';
  root.innerHTML=panel('fortune-dialog','幸运转盘','每日 1 次免费',`
    <div class="event-wallet">${icon('coin')}<strong data-event-wallet>0</strong><span>活动金币</span></div>
    <div class="wheel-stage"><svg class="wheel-pointer" viewBox="0 0 24 33" aria-hidden="true"><path d="M2 3Q12-3 22 3L12 31Z" fill="#9c8059" stroke="#faf1de" stroke-width="2"/></svg><div class="wheel-rim"><svg id="fortune-wheel" class="wheel-disc" viewBox="0 0 300 300" role="img" aria-label="六格金币转盘"></svg><div class="wheel-center">${icon('sparkle')}</div></div></div>
    <p class="wheel-note">${icon('sparkle')}中奖格，下次奖励翻倍</p>
    <div class="wheel-prize" id="fortune-result" role="status" aria-live="polite"><span>转动转盘，领取金币</span></div>
    <div id="fortune-chances" class="wheel-chances" aria-label="今日剩余转盘次数"></div>
    <details class="event-rules"><summary>玩法说明</summary><p>每天 1 次免费转盘，另有 5 次体验加转。转盘停下即获得金币，中奖格的奖励翻倍。次日重置次数与转盘奖励。</p></details><p class="event-storage" data-event-storage hidden>当前进度无法保存</p>`,
    `<button id="fortune-spin" class="event-primary" type="button">免费转一次 ${icon('arrow')}</button><p id="fortune-reset">每天 00:00 更新</p>`)
  +panel('collect-event-dialog','每周活动','收集松果，沿途解锁奖励',`
    <div class="weekly-banner">${landscape}<h3>松林漫游</h3><p>ALPS · FOREST WALK</p></div>
    <div class="event-period"><span id="collect-event-range"></span><span>${icon('clock')}<span id="collect-event-countdown"></span></span></div>
    <div class="weekly-progress-card"><div class="weekly-progress-top"><span>${icon('pine')}收集松果</span><strong><span id="collect-event-count">0</span><small id="collect-event-goal"> / 15</small></strong></div><div class="event-progress-track" role="progressbar" id="collect-event-progress" aria-label="本档松果收集进度" aria-valuemin="0" aria-valuemax="15" aria-valuenow="0"><span class="event-progress-fill"></span></div><div class="weekly-progress-caption"><span id="collect-event-stage">第 1 档</span><span id="collect-event-needed">再收集 15 枚</span></div></div>
    <div class="weekly-reward-heading"><h3>沿途奖励</h3><button id="collect-event-all" type="button" aria-expanded="false">全部 16 档 ⌄</button></div><ol id="collect-event-rewards" class="weekly-rewards"></ol>
    <p id="collect-event-status" class="event-status" role="status" aria-live="polite"></p>
    <details class="event-rules"><summary>玩法说明</summary><p>手动试玩中，每完成一个目标词，收集 1 枚松果。达到本档数量即可领取金币，剩余松果带入下一档。末档可重复领取，每周一重置收集进度。</p></details><p class="event-storage" data-event-storage hidden>当前进度无法保存</p>`,
    `<button id="collect-event-action" class="event-primary" type="button">去收集 ${icon('arrow')}</button><p id="collect-event-footer">完成目标词收集松果</p>`)
  +panel('daily-puzzle-dialog','每日谜题','每天一题，收集宝石',`
    <div id="daily-home" class="daily-home"><div class="daily-heading-line"><span id="daily-today-label"></span><span id="daily-month-total"></span></div><div class="daily-gem-hero">${icon('sparkle','gem-spark')}${icon('gem')}${icon('sparkle','gem-spark')}</div><h3 class="daily-hero-title" id="daily-hero-title">今日谜题</h3><p class="daily-hero-caption" id="daily-hero-caption">连出单词，点亮今天</p>
      <section class="daily-calendar" aria-label="每日谜题月历"><div class="daily-month-nav"><button id="daily-month-prev" type="button" aria-label="上个月的每日谜题">‹</button><h3 id="daily-month-title"></h3><button id="daily-month-next" type="button" aria-label="下个月的每日谜题">›</button></div><div class="daily-weekdays" aria-hidden="true"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div id="daily-calendar-grid" class="daily-calendar-grid" role="group" aria-label="每日谜题日期"></div><div class="daily-calendar-legend"><span>每日 00:00 更新</span><span>✓ 已完成</span></div></section>
    </div>
    <div id="daily-play" class="daily-play" hidden><div class="daily-play-top"><button id="daily-back-calendar" type="button">‹ 日历</button><span id="daily-play-progress"></span><span id="daily-play-gems"></span></div><div id="daily-play-targets" class="daily-play-targets" aria-label="每日谜题目标词"></div><p id="daily-play-word" class="daily-play-word" aria-live="polite"></p><div id="daily-board" class="daily-board" role="group" aria-label="每日谜题字母棋盘"></div><div id="daily-play-tools" class="daily-play-tools"><button id="daily-cancel-path" type="button">清除连线</button><button id="daily-hint" type="button">${icon('hint')}提示</button></div><div id="daily-complete" class="daily-complete" hidden>${icon('check')}<h3>今日谜题已完成</h3><p id="daily-complete-caption"></p></div></div>
    <div class="daily-gem-progress">${icon('gem')}<div class="daily-gem-details"><div><span>宝石收集</span><strong id="daily-gem-count">0 / 50</strong></div><div id="daily-gem-progress" class="event-progress-track" role="progressbar" aria-label="宝石奖励进度" aria-valuemin="0" aria-valuemax="50" aria-valuenow="0"><span class="event-progress-fill"></span></div></div><button id="daily-claim-gems" class="daily-gem-reward" type="button" disabled aria-label="收集50枚宝石领取40金币">${icon('coin')}<span id="daily-gem-reward-label">+40</span></button></div>
    <p id="daily-status" class="event-status" role="status" aria-live="polite"></p><details id="daily-rules" class="event-rules"><summary>玩法说明</summary><p>连接上下左右相邻的字母组成目标词，同次连线不能重复经过同一格。可拖动连词，也可逐格点击后提交。成功连线经过宝石格即可收集宝石，累计 50 枚领取 40 金币。</p></details><p class="event-storage" data-event-storage hidden>当前进度无法保存</p>`,
    `<button id="daily-action" class="event-primary" type="button">开始今日谜题 ${icon('arrow')}</button><p id="daily-footer-note">由 WT词库.xlsx 生成</p>`);
  document.body.append(root);
  for(const dialog of root.querySelectorAll('dialog')){
    dialog.querySelector('[data-event-close]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{if(dialog.id==='daily-puzzle-dialog')pauseDaily();});
  }
  function refresh(){if(stopped)return;const state=progress.snapshot();root.querySelectorAll('[data-event-wallet]').forEach(node=>node.textContent=state.coins.toLocaleString());root.querySelectorAll('[data-event-storage]').forEach(node=>node.hidden=progress.persistent);renderWheel();renderWeekly();renderCalendar();renderGems();}
  function renderWheel(){
    if(spinning)return;const {wheel}=progress.snapshot(),colors=['#d9e6dd','#f6f0df','#dbe8eb','#f6f0df','#c1d4c6','#f6f0df'];
    $('fortune-wheel').innerHTML=wheel.rewards.map((coins,i)=>{const a=(i*60-120)*Math.PI/180,b=a+Math.PI/3,x1=150+147*Math.cos(a),y1=150+147*Math.sin(a),x2=150+147*Math.cos(b),y2=150+147*Math.sin(b);return `<g><path class="wheel-slice" d="M150 150L${x1} ${y1}A147 147 0 0 1 ${x2} ${y2}Z" fill="${colors[i]}"/><g transform="rotate(${i*60} 150 150)"><circle class="wheel-coin" cx="150" cy="44" r="9"/><path class="wheel-coin" d="M150 38v12m3-10h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-4"/><text x="150" y="82" font-size="22">${coins}</text></g></g>`;}).join('');
    const remaining=Math.max(0,6-wheel.spins);$('fortune-chances').innerHTML=Array.from({length:6},(_,i)=>`<i class="${i<wheel.spins?'used':''}" aria-hidden="true"></i>`).join('')+`<span>剩余 ${remaining} 次</span>`;
    $('fortune-spin').disabled=remaining===0;$('fortune-spin').innerHTML=(wheel.spins===0?'免费转一次':remaining?`体验加转 · ${remaining} 次`:'今日次数已用完')+(remaining?icon('arrow'):'');
    if(wheel.last&& !$('fortune-result').dataset.justWon)$('fortune-result').innerHTML=`<span>上次获得</span><strong>+${wheel.last.coins}</strong>${icon('coin')}`;
  }
  $('fortune-spin').addEventListener('click',()=>{
    if(spinning||stopped)return;const prize=progress.spin();if(!prize)return;spinning=true;$('fortune-spin').disabled=true;$('fortune-spin').textContent='好运转动中…';$('fortune-result').innerHTML='<span>好运转动中…</span>';$('fortune-result').dataset.justWon='true';
    const stop=(360-prize.slice*60)%360,current=((rotation%360)+360)%360;rotation+=360*5+(stop-current+360)%360;$('fortune-wheel').style.setProperty('--wheel-rotation',`${rotation}deg`);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    spinTimer=setTimeout(()=>{if(stopped)return;spinning=false;$('fortune-result').innerHTML=`<span>获得</span><strong>+${prize.coins}</strong>${icon('coin')}`;refresh();},reduced?50:3650);
  });
  function renderWeekly(){
    const state=progress.snapshot(),current=progress.weeklyStatus(),{start,end}=state.week;const last=new Date(end);last.setDate(last.getDate()-1);
    $('collect-event-range').textContent=`${start.getMonth()+1}.${start.getDate()} — ${last.getMonth()+1}.${last.getDate()}`;
    const remaining=Math.max(0,end-new Date()),days=Math.floor(remaining/86400000),hours=Math.floor(remaining/3600000)%24;$('collect-event-countdown').textContent=days?`剩余 ${days}天 ${hours}时`:`剩余 ${hours}时`;
    $('collect-event-count').textContent=current.progress;$('collect-event-goal').textContent=` / ${current.stage.target}`;$('collect-event-stage').textContent=`第 ${current.number} 档${current.number>16?' · 循环':''}`;$('collect-event-needed').textContent=current.progress>=current.stage.target?'奖励可领取':`再收集 ${current.stage.target-current.progress} 枚`;
    $('collect-event-progress').setAttribute('aria-valuemax',current.stage.target);$('collect-event-progress').setAttribute('aria-valuenow',Math.min(current.progress,current.stage.target));$('collect-event-progress').style.setProperty('--event-progress',`${Math.min(100,current.progress/current.stage.target*100)}%`);
    $('collect-event-all').textContent=expandedRewards?'收起 ⌃':'全部 16 档 ⌄';$('collect-event-all').setAttribute('aria-expanded',String(expandedRewards));
    const first=expandedRewards?0:Math.min(current.claimed,12),lastIndex=expandedRewards?16:first+4;
    $('collect-event-rewards').innerHTML=WEEKLY_STAGES.slice(first,lastIndex).map((stage,offset)=>{const index=first+offset,isCurrent=index===Math.min(current.claimed,15),claimed=index<current.claimed;return `<li class="weekly-reward" data-state="${claimed?'claimed':isCurrent?'current':'locked'}"><span class="weekly-reward-icon">${icon(claimed?'check':index===15?'gift':'gift')}</span><div class="weekly-reward-copy"><strong>第 ${index+1} 档${index===15?' · 循环奖励':''}</strong><small>${claimed?'已领取':isCurrent?`收集 ${stage.target} 枚松果`:`${stage.target} 枚松果`}</small></div><span class="weekly-reward-amount">${icon('coin')} ${stage.coins}</span></li>`;}).join('');
    const claimable=current.progress>=current.stage.target;$('collect-event-action').innerHTML=claimable?`领取 ${current.stage.coins} 金币 ${icon('gift')}`:`去收集 ${icon('arrow')}`;$('collect-event-footer').textContent=claimable?'剩余松果自动计入下一档':'完成目标词收集松果';
  }
  $('collect-event-all').addEventListener('click',()=>{expandedRewards=!expandedRewards;renderWeekly();});
  $('collect-event-action').addEventListener('click',async()=>{
    const current=progress.weeklyStatus();if(current.progress>=current.stage.target){const coins=progress.claimWeekly();if(coins!==null)$('collect-event-status').textContent=`已领取 ${coins} 金币`;refresh();}
    else{$('collect-event-dialog').close();await onMainPlay();}
  });
  function renderCalendar(){
    const now=new Date(),today=eventDate(now),state=progress.snapshot(),year=month.getFullYear(),m=month.getMonth(),prefix=`${year}-${String(m+1).padStart(2,'0')}`;
    $('daily-today-label').textContent=`${now.getMonth()+1} 月 ${now.getDate()} 日 · 周${'日一二三四五六'[now.getDay()]}`;
    $('daily-month-total').textContent=`本月完成 ${Object.entries(state.daily).filter(([key,value])=>key.startsWith(prefix)&&value.levelId===dailyPuzzleRecordId(key)&&value.finished).length} 天`;
    $('daily-month-title').textContent=`${year} 年 ${m+1} 月`;$('daily-month-next').disabled=year===now.getFullYear()&&m===now.getMonth();
    const gap=(new Date(year,m,1).getDay()+6)%7,days=new Date(year,m+1,0).getDate();
    $('daily-calendar-grid').innerHTML='<span aria-hidden="true"></span>'.repeat(gap)+Array.from({length:days},(_,i)=>{const key=`${prefix}-${String(i+1).padStart(2,'0')}`;return `<button type="button" data-day="${key}" data-today="${key===today}" data-complete="${!!state.daily[key]?.finished}" aria-pressed="${selectedDay===key}" aria-label="${m+1}月${i+1}日${state.daily[key]?.finished?'，已完成':key===today?'，今日谜题':''}" ${key>today?'disabled':''}>${i+1}</button>`;}).join('');
    if(!dailyPlaying){const saved=state.daily[selectedDay],entry=saved?.levelId===dailyPuzzleRecordId(selectedDay)?saved:null;$('daily-hero-title').textContent=selectedDay===today?(entry?.finished?'今日已完成':'今日谜题'):`${Number(selectedDay.slice(5,7))} 月 ${Number(selectedDay.slice(8))} 日`;$('daily-hero-caption').textContent=entry?.finished?'这一日，已经点亮':selectedDay!==today?'当日未完成':'连出单词，点亮今天';$('daily-action').disabled=selectedDay!==today||loading||!!entry?.finished;$('daily-action').innerHTML=loading?'正在准备谜题…':entry?.finished?'已完成':selectedDay!==today?'仅今日谜题开放':`${entry?.paths?.length?'继续今日谜题':'开始今日谜题'} ${icon('arrow')}`;$('daily-footer-note').textContent=entry?.finished?'明天再来解锁新谜题':'由 WT词库.xlsx 生成';}
  }
  function renderGems(){const {gems}=progress.snapshot();$('daily-gem-count').textContent=`${gems} / 50`;$('daily-gem-progress').setAttribute('aria-valuenow',Math.min(gems,50));$('daily-gem-progress').style.setProperty('--event-progress',`${Math.min(100,gems/50*100)}%`);$('daily-claim-gems').disabled=gems<50;$('daily-gem-reward-label').textContent=gems>=50?'领取 +40':'+40';}
  $('daily-claim-gems').addEventListener('click',()=>{if(progress.claimGems()){$('daily-status').textContent='已领取 40 金币';refresh();}});
  function changeMonth(offset){month=new Date(month.getFullYear(),month.getMonth()+offset,1);const today=new Date();if(month.getFullYear()===today.getFullYear()&&month.getMonth()===today.getMonth())selectedDay=eventDate(today);else selectedDay=eventDate(month);renderCalendar();}
  $('daily-month-prev').addEventListener('click',()=>changeMonth(-1));$('daily-month-next').addEventListener('click',()=>changeMonth(1));
  $('daily-calendar-grid').addEventListener('click',event=>{const button=event.target.closest('[data-day]');if(!button||button.disabled)return;selectedDay=button.dataset.day;renderCalendar();});
  function recordDaily(){if(dailyRecordSession&&dailyMetrics)onPersonalProgress?.(dailyRecordSession,dailyMetrics.snapshot(),true);}
  function pauseDaily(){dailyMetrics?.pause();recordDaily();selection=[];pointerId=null;}
  function showDailyHome(){loadRequest++;loading=false;pauseDaily();dailyPlaying=false;$('daily-puzzle-dialog').dataset.playing='false';$('daily-home').hidden=false;$('daily-play').hidden=true;$('daily-rules').hidden=false;$('daily-status').textContent='';$('daily-puzzle-dialog').querySelector('.event-scroll').scrollTop=0;renderCalendar();renderGems();}
  $('daily-back-calendar').addEventListener('click',showDailyHome);
  async function startDaily(){
    if(loading||stopped)return;loading=true;const request=++loadRequest,day=eventDate();renderCalendar();$('daily-status').textContent='';
    try{
      if(request!==loadRequest||stopped||!$('daily-puzzle-dialog').open)return;
      const date=new Date();if(day!==eventDate(date))throw Error('新一天已开始，请重新打开今日谜题');
      const savedValue=progress.daily(day),saved=savedValue?.levelId===dailyPuzzleRecordId(day)?savedValue:null;if(saved?.finished){loading=false;showDailyHome();return;}
      if(!dailySession||dailyKey!==day){
        const daily=createDailyPuzzle(day,saved?.seed);dailyKey=day;dailyRawId=daily.levelId;dailySeed=daily.seed;dailySession=daily.session;
        dailyPaths=[];for(const path of saved?.paths||[]){const result=dailySession.submit(path);if(result.accepted)dailyPaths.push(path);}
        const candidates=Array.from({length:dailySession.counts.length},(_,i)=>i);
        if(saved)gemCells=saved.gemCells;else{for(let i=candidates.length-1;i>0;i--){const value=new Uint32Array(1);crypto.getRandomValues(value);const j=value[0]%(i+1);[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}gemCells=candidates.slice(0,3);}
        pickedGems=new Set(dailyPaths.flat().filter(cell=>gemCells.includes(cell)));dailyMetrics=new SessionMetrics(dailySession);dailyRecordSession={completed:new Set(),status:'playing'};
        progress.saveDaily({levelId:dailyRawId,seed:dailySeed,gemCells,paths:dailyPaths,gemCount:pickedGems.size,finished:false});
      }
      if(!dailyMetrics.started)dailyMetrics.start();else dailyMetrics.resume();recordDaily();dailyPlaying=true;selection=[];highlight=[];$('daily-puzzle-dialog').dataset.playing='true';$('daily-home').hidden=true;$('daily-play').hidden=false;$('daily-rules').hidden=true;$('daily-footer-note').textContent='拖动连词，或点选字母后提交';renderDailyPlay();renderGems();$('daily-puzzle-dialog').querySelector('.event-scroll').scrollTop=0;
    }catch(error){$('daily-status').textContent=`${error.message}，点击重试。`;}
    finally{if(request===loadRequest){loading=false;if(!dailyPlaying)renderCalendar();}}
  }
  function renderDailyPlay(){
    if(!dailySession)return;const session=dailySession,{rows,cols,letters}=session.initial.board,won=session.status==='won';
    $('daily-play-progress').textContent=`${session.completed.size} / ${session.initial.targets.length} 个词`;$('daily-play-gems').textContent=`◆ ${pickedGems.size} / ${gemCells.length}`;
    $('daily-play-targets').innerHTML=[...session.initial.targets].sort((a,b)=>a.word.length-b.word.length).map(target=>`<span class="daily-target" data-found="${session.completed.has(target.word)}" aria-label="${session.completed.has(target.word)?target.word:`${target.word.length}字母目标词`}">${session.completed.has(target.word)?target.word:'·'.repeat(target.word.length)}</span>`).join('');
    $('daily-board').style.setProperty('--daily-cols',cols);$('daily-board').innerHTML=letters.map((letter,cell)=>`<button class="daily-cell" data-cell="${cell}" data-empty="${session.counts[cell]===0}" data-selected="false" style="grid-column:${cell%cols+1};grid-row:${rows-Math.floor(cell/cols)}" type="button" aria-label="${letter}，剩余 ${session.counts[cell]} 次${gemCells.includes(cell)&&!pickedGems.has(cell)?'，含宝石':''}" ${!session.counts[cell]?'disabled':''}>${letter}<small>${session.counts[cell]}</small>${gemCells.includes(cell)&&!pickedGems.has(cell)?icon('gem'):''}</button>`).join('');
    $('daily-play-tools').hidden=won;$('daily-board').hidden=won;$('daily-play-word').hidden=won;$('daily-complete').hidden=!won;
    $('daily-action').disabled=false;$('daily-action').innerHTML=won?`返回日历 ${icon('arrow')}`:'提交单词';$('daily-complete-caption').textContent=`收集 ${pickedGems.size} 枚宝石 · 明天继续`;
    drawSelection();requestAnimationFrame(fitDailyBoard);
  }
  function fitDailyBoard(){if(!dailyPlaying||!dailySession)return;const {rows,cols}=dailySession.initial.board,scroll=$('daily-puzzle-dialog').querySelector('.event-scroll'),outer=node=>{const style=getComputedStyle(node);return node.offsetHeight+parseFloat(style.marginTop)+parseFloat(style.marginBottom);};const available=scroll.clientHeight-outer($('daily-play').querySelector('.daily-play-top'))-outer($('daily-play-targets'))-outer($('daily-play-word'))-outer($('daily-play-tools'))-36;const width=Math.min(315,scroll.clientWidth-48,Math.max(32,(available-7*(rows-1))/rows)*cols+7*(cols-1));$('daily-board').style.width=`${width}px`;}
  window.addEventListener('resize',()=>requestAnimationFrame(fitDailyBoard));
  function drawSelection(){if(!dailySession)return;$('daily-play-word').textContent=selection.map(cell=>dailySession.initial.board.letters[cell]).join('')||'· · ·';$('daily-action').disabled=dailySession.status!=='won'&&selection.length<2;for(const cell of $('daily-board').querySelectorAll('[data-cell]'))cell.dataset.selected=String(selection.includes(Number(cell.dataset.cell))||highlight.includes(Number(cell.dataset.cell)));}
  function choose(cell){
    if(!dailySession||dailySession.status==='won'||!dailySession.counts[cell]||dailyKey!==eventDate())return;
    highlight=[];if(selection.at(-1)===cell)return;if(selection.length>1&&selection.at(-2)===cell){selection.pop();drawSelection();return;}
    if(selection.includes(cell))return;
    const cols=dailySession.initial.board.cols,last=selection.at(-1);if(last!==undefined&&Math.abs(last%cols-cell%cols)+Math.abs(Math.floor(last/cols)-Math.floor(cell/cols))!==1)return;
    selection.push(cell);drawSelection();
  }
  function submitDaily(){
    if(stopped||!dailySession||dailySession.status==='won'||!selection.length)return;
    if(dailyKey!==eventDate()){showDailyHome();refresh();$('daily-status').textContent='新一天已开始，请载入今日谜题';return;}
    const path=[...selection],result=dailySession.submit(path);if(result.accepted){dailyRecordSession.completed.add(result.word);dailyRecordSession.status=dailySession.status;}dailyMetrics.submit(path,result);recordDaily();
    if(result.accepted){for(const cell of path)if(gemCells.includes(cell))pickedGems.add(cell);dailyPaths.push(path);onCollect?.(result,'english',WORD_BANK_ORIGIN);progress.saveDaily({levelId:dailyRawId,seed:dailySeed,gemCells,paths:dailyPaths,gemCount:pickedGems.size,finished:dailySession.status==='won'});$('daily-status').textContent=dailySession.status==='won'?'':`找到 ${result.word}`;}
    else if(result.reason==='extra-word'){onCollect?.(result,'english',WORD_BANK_ORIGIN);$('daily-status').textContent=`额外发现 ${result.word}，已收录`;}
    else $('daily-status').textContent=result.reason==='already-completed'?'这个词已经找到了':result.reason==='different-consumption'?'换一条路径试试，可点提示查看':'再试一个单词';
    selection=[];highlight=[];renderDailyPlay();renderGems();refresh();
  }
  const dailyBoard=$('daily-board');let pointerStart=null,pointerMoved=false;
  dailyBoard.addEventListener('pointerdown',event=>{if(event.button!==0)return;const cell=event.target.closest('[data-cell]');if(!cell)return;event.preventDefault();pointerId=event.pointerId;pointerStart=Number(cell.dataset.cell);pointerMoved=false;choose(pointerStart);dailyBoard.setPointerCapture(event.pointerId);});
  dailyBoard.addEventListener('pointermove',event=>{if(event.pointerId!==pointerId)return;const cell=document.elementFromPoint(event.clientX,event.clientY)?.closest('#daily-board [data-cell]');if(cell){if(Number(cell.dataset.cell)!==pointerStart)pointerMoved=true;choose(Number(cell.dataset.cell));}});
  dailyBoard.addEventListener('pointerup',event=>{if(pointerId!==event.pointerId)return;pointerId=null;if(pointerMoved)submitDaily();});
  dailyBoard.addEventListener('pointercancel',()=>{pointerId=null;selection=[];drawSelection();});
  dailyBoard.addEventListener('click',event=>{if(event.detail!==0)return;const cell=event.target.closest('[data-cell]');if(cell)choose(Number(cell.dataset.cell));});
  $('daily-cancel-path').addEventListener('click',()=>{selection=[];highlight=[];drawSelection();});
  $('daily-hint').addEventListener('click',()=>{if(!dailySession||dailySession.status==='won')return;const target=dailySession.initial.targets.find(target=>!dailySession.completed.has(target.word));selection=[];highlight=target.path;dailyMetrics.useHint();recordDaily();drawSelection();$('daily-status').textContent=`试着连接 ${target.word}`;});
  $('daily-action').addEventListener('click',()=>{if(!dailyPlaying)startDaily();else if(dailySession.status==='won')showDailyHome();else submitDaily();});
  const ticker=setInterval(()=>{
    if(stopped)return;const today=eventDate();
    if(today!==displayedDay){displayedDay=today;delete $('fortune-result').dataset.justWon;clearTimeout(spinTimer);spinning=false;$('fortune-result').innerHTML='<span>转动转盘，领取金币</span>';refresh();}
    if(dailyPlaying&&$('daily-puzzle-dialog').open&&!document.hidden)recordDaily();
    if($('collect-event-dialog').open)renderWeekly();
    if(dailyKey&&dailyKey!==today&&$('daily-puzzle-dialog').open){showDailyHome();month=new Date();selectedDay=today;refresh();}
  },1000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseDaily();else if(dailyPlaying&&$('daily-puzzle-dialog').open&&dailySession?.status!=='won')dailyMetrics?.resume();});
  window.addEventListener('pagehide',pauseDaily);
  window.addEventListener('storage',event=>{if(event.key===EVENTS_KEY){if(dailyPlaying){pauseDaily();dailySession=null;showDailyHome();}refresh();}});
  refresh();
  return {
    observe(session,snapshot){if(stopped||!session||snapshot?.timeKind!=='real'||!snapshot.started)return;const count=session.completed?.size??0,prior=observed.get(session);observed.set(session,count);if(prior!==undefined&&count>prior){progress.addWeeklyItems(count-prior);if($('collect-event-dialog').open)renderWeekly();}},
    refresh,
    prepareDataReset(){stopped=true;clearInterval(ticker);clearTimeout(spinTimer);loadRequest++;pauseDaily();for(const dialog of root.querySelectorAll('dialog[open]'))dialog.close();},
  };
}
