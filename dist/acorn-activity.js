import {ACORN_MODES,AcornRound,createAcornCollection} from './core/acorn-activity.js?v=2';

export const acornIcon=`<svg viewBox="0 0 64 72" aria-hidden="true"><path d="M30 18C27 8 33 4 39 5" fill="none" stroke="#664125" stroke-width="5" stroke-linecap="round"/><path d="M17 29C12 42 21 61 32 67c11-6 20-25 15-38Z" fill="#cf8d43" stroke="#855024" stroke-width="2"/><path d="M25 35c-3 11 0 18 4 22" fill="none" stroke="#ffe1a0" stroke-width="4" stroke-linecap="round"/><path d="M10 30c0-13 11-20 22-20s22 7 22 20c-8 7-36 7-44 0Z" fill="#80522c" stroke="#59371f" stroke-width="2"/><path d="m17 20 6 6 7-9 7 10 8-8M16 28l7-2 8 7 7-6 10 1" fill="none" stroke="#c89455" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const modeFor=id=>ACORN_MODES.find(mode=>mode.id===id)||ACORN_MODES[0];
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountAcornActivity({storage,onStart,onExit,onIdle,isVisible=()=>!document.hidden}={}){
  const root=document.getElementById('game-screen'),panel=document.querySelector('.play-panel'),title=document.getElementById('rules-button');
  const collection=createAcornCollection(storage),rounds=new WeakMap();let active=null,request=0,stopped=false;
  const pending=new Map(),settled=new Set(),effects=new Set();let shown=0,roundId='';
  const entry=document.createElement('button');entry.id='acorn-entry';entry.className='acorn-entry';entry.type='button';entry.disabled=true;entry.setAttribute('aria-haspopup','dialog');entry.setAttribute('aria-controls','acorn-picker');entry.innerHTML=acornIcon+'<span>橡果收集</span><small>3 种玩法</small>';document.querySelector('.lobby-panel').append(entry);
  const hud=document.createElement('div');hud.className='acorn-game-hud';hud.hidden=true;hud.innerHTML=`<span class="acorn-hud-icon">${acornIcon}</span><span><small>本关橡果</small><strong id="acorn-round-count">0 / 2</strong></span>`;panel.append(hud);
  const switcher=document.createElement('button');switcher.id='acorn-mode-switch';switcher.className='acorn-mode-switch';switcher.type='button';switcher.hidden=true;switcher.setAttribute('aria-haspopup','dialog');panel.append(switcher);
  const layer=document.createElement('div');layer.className='acorn-fx-layer';layer.setAttribute('aria-hidden','true');panel.append(layer);
  const picker=document.createElement('dialog');picker.id='acorn-picker';picker.className='acorn-dialog acorn-picker';picker.setAttribute('aria-labelledby','acorn-picker-title');
  picker.innerHTML=`<button class="acorn-dialog-close" type="button" aria-label="关闭橡果活动">×</button><div class="acorn-picker-hero">${acornIcon}<span>ACORN HUNT</span><h2 id="acorn-picker-title">橡果收集</h2><p>连出单词，收集橡果，把秋天装进口袋。</p></div><div class="acorn-total">已收集 <strong id="acorn-total">0</strong> 枚橡果</div><div class="acorn-mode-list">${ACORN_MODES.map(mode=>`<button type="button" data-acorn-start="${mode.id}" class="acorn-mode-card"><span class="acorn-mode-sample" data-sample="${mode.id}" aria-hidden="true">${Array.from({length:4},(_,i)=>`<i class="${mode.id==='targets'||mode.id==='sparse'&&i!==1?'sample-plain':'sample-wood'}">${i===1?acornIcon:'ABCD'[i]}</i>`).join('')}</span><span class="acorn-mode-copy"><small>FORM ${mode.number}</small><strong>${mode.name}</strong><span>${mode.detail}</span></span><b aria-hidden="true">›</b></button>`).join('')}</div><p class="acorn-picker-note">每关有 2–3 枚橡果，完成关卡继续收集</p><p id="acorn-picker-status" role="status" aria-live="polite"></p>`;
  document.body.append(picker);
  const complete=document.createElement('dialog');complete.id='acorn-complete';complete.className='acorn-dialog acorn-complete';complete.setAttribute('aria-labelledby','acorn-complete-title');
  complete.innerHTML=`<button class="acorn-dialog-close" type="button" aria-label="返回活动大厅">×</button><div class="acorn-complete-art">${acornIcon.repeat(3)}</div><span class="acorn-eyebrow">A LITTLE AUTUMN TREASURE</span><h2 id="acorn-complete-title">橡果收集完成！</h2><p id="acorn-complete-gain"></p><div class="acorn-complete-total">我的橡果<strong>0</strong></div><div class="acorn-complete-actions"><button id="acorn-next" type="button">下一关</button><button id="acorn-change" type="button">切换玩法</button></div><p id="acorn-complete-status" role="status" aria-live="polite"></p>`;
  document.body.append(complete);
  function owns(session){return active?.session===session;}
  function notify(session){if(owns(session)&&isVisible())onIdle?.(session);}
  function paintHUD(){if(!active)return;hud.querySelector('strong').textContent=`${shown} / ${active.goal}`;hud.setAttribute('aria-label',`本关已收集 ${shown} 枚橡果，共 ${active.goal} 枚`);switcher.textContent=`${modeFor(active.mode).number} · ${modeFor(active.mode).name} · 第 ${active.number} 关 ▾`;}
  function finishEffect(record,notifyIdle=true){if(!effects.delete(record))return;clearTimeout(record.timer);record.animation?.cancel();record.node.remove();if(notifyIdle)notify(record.session);}
  function cancelEffects(){for(const record of [...effects])finishEffect(record,false);}
  function fly(slot,session){
    if(!slot||!owns(session))return;
    if(reduced()||!isVisible()){shown++;paintHUD();return;}
    const bounds=panel.getBoundingClientRect(),source=slot.getBoundingClientRect(),dest=hud.querySelector('.acorn-hud-icon').getBoundingClientRect();
    if(!bounds.width||!source.width){shown++;paintHUD();return;}
    const sx=panel.clientWidth/bounds.width,sy=panel.clientHeight/bounds.height,size=panel.clientWidth*.1;
    const start={x:(source.left+source.width/2-bounds.left)*sx-size/2,y:(source.top+source.height/2-bounds.top)*sy-size/2},end={x:(dest.left+dest.width/2-bounds.left)*sx-size/2,y:(dest.top+dest.height/2-bounds.top)*sy-size/2};
    const node=document.createElement('span');node.className='acorn-flying';node.innerHTML=acornIcon;node.style.width=node.style.height=size+'px';layer.append(node);
    const poses=[{transform:`translate(${start.x}px,${start.y}px) scale(.35)`,opacity:0,offset:0},{transform:`translate(${start.x}px,${start.y-10}px) scale(1.2)`,opacity:1,offset:.2},{transform:`translate(${start.x}px,${start.y-10}px) scale(1)`,opacity:1,offset:.35}];
    for(let i=1;i<=8;i++){const t=i/8,u=1-t,x=u*u*start.x+2*u*t*(start.x-45)+t*t*end.x,y=u*u*(start.y-10)+2*u*t*(end.y+10)+t*t*end.y;poses.push({transform:`translate(${x}px,${y}px) scale(${1-.4*t}) rotate(${-14*Math.sin(t*Math.PI)}deg)`,opacity:i===8?0:1,offset:.35+.65*t});}
    const record={session,node,animation:node.animate(poses,{delay:130,duration:1140,easing:'linear',fill:'both'}),timer:null};effects.add(record);
    record.timer=setTimeout(()=>{if(!effects.has(record))return;shown++;paintHUD();hud.animate([{scale:'1'},{scale:'1.12'},{scale:'1'}],{duration:220});finishEffect(record);},1280);
  }
  function paintTile(slot,wood){slot.classList.toggle('acorn-wood',wood);slot.classList.toggle('acorn-plain',!wood);slot.dataset.shatterMaterial=wood?'wood':'original';}
  function settleTarget(session,word,target,immediate=false){
    if(!owns(session)||active.mode!=='targets'||settled.has(word)||!session.completed.has(word))return;
    const item=pending.get(word);if(!item)return;pending.delete(word);settled.add(word);
    const slots=[...target.querySelectorAll('.target-letter')];
    if(item.position!==undefined){if(immediate){shown++;paintHUD();}else{const slot=slots[item.position];fly(slot.querySelector('.acorn-target-icon')||slot,session);}}
    for(const slot of slots)slot.querySelector('.acorn-target-icon')?.remove();
  }
  function beforeRender(session,tiles){
    if(!owns(session))return;
    tiles.forEach((tile,i)=>paintTile(tile,active.boardWood.has(i)));
    const found=active.observe();if(found.keys.length)collection.collect(roundId,found.keys);
    for(const item of found.targets)pending.set(item.word,item);
    for(const item of found.board)fly(tiles[item.cell],session);
  }
  function syncTargets(session,targets,effectsRunning){
    if(!owns(session))return;
    for(const [word,target]of targets){
      for(const [position,slot]of [...target.querySelectorAll('.target-letter')].entries()){
        paintTile(slot,active.mode==='all');slot.classList.toggle('acorn-target-slot',active.mode==='targets');
        const visible=active.mode==='targets'&&active.targetAcorns.get(word)===position&&!settled.has(word),icon=slot.querySelector('.acorn-target-icon');
        if(visible&&!icon){const item=document.createElement('span');item.className='acorn-target-icon';item.innerHTML=acornIcon;slot.append(item);}
        else if(!visible)icon?.remove();
      }
      if(pending.has(word)&&!effectsRunning(word))settleTarget(session,word,target,reduced()||!isVisible());
    }
    paintHUD();
  }
  function bind(session,options){
    cancelEffects();pending.clear();settled.clear();
    if(!options){active=null;delete root.dataset.acornMode;hud.hidden=switcher.hidden=true;title.textContent='Word Tile';return;}
    active=rounds.get(session)||new AcornRound(session,options.mode,options.number);rounds.set(session,active);
    roundId=crypto.randomUUID();shown=active.collected.size;root.dataset.acornMode=active.mode;hud.hidden=switcher.hidden=false;title.textContent='橡果收集';paintHUD();
  }
  function openPicker(){if(stopped)return;picker.querySelector('#acorn-total').textContent=collection.read();picker.querySelector('#acorn-picker-status').textContent='';if(!picker.open)picker.showModal();}
  async function launch(mode,number=1){
    if(stopped)return;const token=++request;const status=(complete.open?complete:picker).querySelector('[role="status"]');status.textContent='正在准备活动关卡…';
    for(const button of picker.querySelectorAll('[data-acorn-start]'))button.disabled=true;complete.querySelector('#acorn-next').disabled=true;
    try{const ok=await onStart(mode,number,()=>token===request&&!stopped);if(token!==request)return;if(!ok)throw Error('关卡暂时无法载入，请重试');picker.close();complete.close();}
    catch(error){if(token===request)status.textContent=error.message;}
    finally{for(const button of picker.querySelectorAll('[data-acorn-start]'))button.disabled=false;complete.querySelector('#acorn-next').disabled=false;}
  }
  entry.onclick=openPicker;switcher.onclick=openPicker;picker.querySelector('.acorn-dialog-close').onclick=()=>{++request;picker.close();};picker.addEventListener('cancel',()=>{++request;});
  picker.addEventListener('close',()=>{if(active?.session.status==='won'&&!complete.open&&isVisible())showCompletion(active.session);});
  picker.addEventListener('click',event=>{const button=event.target.closest('[data-acorn-start]');if(button)void launch(button.dataset.acornStart);});
  complete.querySelector('#acorn-next').onclick=()=>void launch(active.mode,active.number+1);complete.querySelector('#acorn-change').onclick=()=>{complete.close();openPicker();};complete.querySelector('.acorn-dialog-close').onclick=()=>onExit();complete.addEventListener('cancel',event=>{event.preventDefault();onExit();});
  function showCompletion(session){
    if(!owns(session))return false;
    shown=active.collected.size;paintHUD();complete.querySelector('#acorn-complete-title').textContent='橡果收集完成！';complete.querySelector('#acorn-complete-gain').textContent=`${modeFor(active.mode).name} · 第 ${active.number} 关，收集 ${shown} / ${active.goal} 枚橡果`;
    complete.querySelector('.acorn-complete-total strong').textContent=collection.read();complete.querySelector('#acorn-complete-status').textContent='';if(!complete.open)complete.showModal();return true;
  }
  function suspend(){cancelEffects();if(!active)return;for(const [word]of pending){const target=[...panel.querySelectorAll('.target')].find(item=>item.dataset.word===word);if(target)settleTarget(active.session,word,target,true);}shown=active.collected.size;paintHUD();}
  function leave(){++request;cancelEffects();picker.close();complete.close();bind(null,null);for(const node of panel.querySelectorAll('.acorn-wood,.acorn-plain,.acorn-target-slot')){node.classList.remove('acorn-wood','acorn-plain','acorn-target-slot');delete node.dataset.shatterMaterial;}for(const icon of panel.querySelectorAll('.acorn-target-icon'))icon.remove();}
  return {owns,bind,beforeRender,syncTargets,onWordSettled:settleTarget,showCompletion,openPicker,leave,suspend,isRunning:session=>owns(session)&&(pending.size>0||effects.size>0),setReady:ready=>{entry.disabled=!ready;},prepareDataReset(){stopped=true;leave();}};
}
