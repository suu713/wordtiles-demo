import {createBankDictionary,BANK_NAMES} from './core/dictionary-banks.js?v=23';
import {BATCH_SIZES,normalizeBatchPlan,previewBatchPlan} from './core/batch-plan.js?v=28';
import {planTargetLengths} from './core/target-composition.js?v=28';
import {clone} from './core/rules.js?v=21';
import {QUALITY_TEMPLATE} from './core/quality-config.js?v=39';

export function mountBatchGenerationDialog({getSettings,getSequenceContext,onStart,onCancel}) {
  const dialog=document.createElement('dialog');dialog.id='bulk-generation-dialog';dialog.className='batch-generation-dialog';
  dialog.setAttribute('aria-labelledby','bulk-dialog-title');
  dialog.innerHTML=`<div class="bulk-dialog-heading"><div><span class="bulk-eyebrow">关卡编排</span><h2 id="bulk-dialog-title">批量生成</h2></div><button id="bulk-close" type="button" aria-label="关闭批量生成">×</button></div>
  <div class="bulk-dialog-body"><p class="bulk-intro">目标词按上下左右连线铺入棋盘，格子次数由实际路径叠加。每关重搜全部目标路径并校验全部完成状态，通过后才插入关序。</p>
  <div class="bulk-config-grid">
    <label>起始关号<input id="bulk-start-number" type="number" min="1" max="1000000" value="2"></label>
    <label>生成多少关<input id="bulk-generation-count" type="number" min="1" max="10000" value="50"></label>
    <label>放在哪里<select id="bulk-placement"><option value="after">插在当前关后面</option><option value="before">插在当前关前面</option><option value="end">追加到当前词库末尾</option></select></label>
    <label>关卡词库<select id="bulk-dictionary-source"><option value="wt-workbook" selected>WT词库.xlsx</option></select></label>
    <label hidden>生成算法<select id="bulk-generation-engine"><option value="flexible">可调棋盘回溯</option></select></label>
    <label id="bulk-zen-field" hidden>Zen 词库范围<select id="bulk-zen-bank"><option value="all">主线 T1 + T3</option><option value="main-en-us_t1">主线 T1</option><option value="main-en-us_t3">主线 T3</option></select></label>
  </div><p id="bulk-origin-note" class="bulk-note"></p>
  <div class="bulk-section-heading"><h3>难度与目标词数</h3><label class="bulk-check"><input id="bulk-curve-enabled" type="checkbox" checked>按难度曲线编排</label></div>
  <div class="bulk-config-grid">
    <label>起点难度 · 0～100<input id="bulk-difficulty-start" type="number" min="0" max="100" value="5"></label>
    <label>终点难度 · 0～100<input id="bulk-difficulty-end" type="number" min="0" max="100" value="80"></label>
    <label>爬升用多少关<input id="bulk-ramp-levels" type="number" min="1" max="10000" value="60"></label>
    <label>每几关一个峰值<input id="bulk-peak-every" type="number" min="0" max="1000" value="10"><small>填 0 关闭周期峰值</small></label>
    <label>峰后回落幅度 · 0～60<input id="bulk-peak-drop" type="number" min="0" max="60" value="20"></label>
    <label>一格最多用几次<input id="bulk-max-uses" type="number" min="1" max="9" value="9"></label>
    <label>目标词数策略<select id="bulk-target-mode"><option value="fixed">每关固定目标词数</option><option value="curve">随难度从起点渐变到终点</option></select></label>
    <label><span id="bulk-target-label">起点目标词数</span><input id="bulk-target-count" type="number" min="1" max="16" value="4"></label>
    <label id="bulk-target-end-field">终点目标词数<input id="bulk-target-end" type="number" min="1" max="16" value="11"></label>
    <label>三字词比例 · %<input id="bulk-three-percent" type="number" min="0" max="100" value="30"></label>
    <label>四字词比例 · %<input id="bulk-four-percent" type="number" min="0" max="100" value="30"></label>
  </div>
  <fieldset class="bulk-size-field"><legend>允许的棋盘尺寸 <span>可多选</span></legend><div id="bulk-size-options" class="bulk-size-options"></div></fieldset>
  <section class="bulk-curve-preview"><div class="bulk-curve-label"><strong id="bulk-curve-title">难度曲线预览</strong><span>峰值后回落，再逐步爬升</span></div><svg id="bulk-curve" viewBox="0 0 800 122" role="img" aria-label="计划难度曲线"></svg><p id="bulk-plan-summary"></p></section>
  <details class="bulk-advanced"><summary>词长、熟悉度近似与相邻关避重</summary><div class="bulk-config-grid">
    <label>最短目标词长<input id="bulk-min-length" type="number" min="3" max="8" value="3"></label>
    <label>最长目标词长<input id="bulk-max-length" type="number" min="3" max="8" value="8"></label>
    <label>相邻多少关不重复目标词<input id="bulk-repeat-window" type="number" min="0" max="100" value="10"></label>
    <label>简单关最低熟悉度近似分<input id="bulk-zipf-easy" type="number" min="0" max="8" step="0.1" value="4.4"></label>
    <label>难关最低熟悉度近似分<input id="bulk-zipf-hard" type="number" min="0" max="8" step="0.1" value="2.8"></label>
    <label>每关最多低频目标词<input id="bulk-rare-limit" type="number" min="0" max="16" value="1"></label>
  </div><p class="bulk-note">分数由工作簿“生僻程度”1～5 映射，仅作熟悉度近似，不是外部词频；每关低于 3.5 的词数受上限约束。</p></details>
  <p id="bulk-model-note" class="bulk-note">难度值控制目标数量、词长、熟悉度近似门槛和路径拐弯。预览显示计划配置，每关的实际结构与试玩数据可在生成后查看。</p>
  <p id="bulk-validation" class="bulk-validation" role="status"></p><progress id="bulk-modal-progress" value="0" max="1" aria-label="批量生成进度"></progress><p id="bulk-modal-status" class="bulk-note" role="status"></p>
  </div><div class="bulk-dialog-footer"><div class="bulk-footer-feedback"><span id="bulk-random-note">每关独立随机生成</span><progress id="bulk-pinned-progress" max="1" value="0" hidden aria-label="生成完成关数"></progress></div><button id="bulk-cancel" type="button" disabled>中止</button><button id="bulk-close-footer" type="button">关闭</button><button id="bulk-generate" type="button" class="bulk-primary">开始生成</button></div>`;
  document.body.append(dialog);
  const $=id=>document.getElementById(id),num=id=>Number($(id).value);
  let busy=false,initialized=false,autoNumber=true;
  function dictionaryForSettings(){
    return createBankDictionary([3,4,5,6,7,8],'wt-workbook');
  }
  function read(){
    const settings=getSettings(),engine='flexible',dictionary=dictionaryForSettings(),count=num('bulk-generation-count');
    const enabled=$('bulk-curve-enabled').checked;
    const sizes=!enabled?[{cols:settings.config.cols,rows:settings.config.rows}]:[...$('bulk-size-options').querySelectorAll('input:checked')].map(i=>({cols:Number(i.dataset.cols),rows:Number(i.dataset.rows)}));
    const plan=normalizeBatchPlan({startNumber:num('bulk-start-number'),placement:$('bulk-placement').value,
      curve:{enabled,start:num('bulk-difficulty-start'),end:num('bulk-difficulty-end'),rampLevels:num('bulk-ramp-levels'),peakEvery:num('bulk-peak-every'),drop:num('bulk-peak-drop')},
      targetMode:!enabled?'fixed':$('bulk-target-mode').value,fixedTargets:num('bulk-target-count'),startTargets:num('bulk-target-count'),endTargets:num('bulk-target-end'),
      maxUses:num('bulk-max-uses'),sizes,minLength:num('bulk-min-length'),maxLength:num('bulk-max-length'),repeatWindow:num('bulk-repeat-window'),
      minZipfEasy:num('bulk-zipf-easy'),minZipfHard:num('bulk-zipf-hard'),maxRareTargets:num('bulk-rare-limit'),composition:{three:$('bulk-three-percent').value,four:$('bulk-four-percent').value}},count);
    const config={...clone(settings.config),maxUses:plan.maxUses};
    if(!enabled&&settings.qualityTemplate&&plan.fixedTargets===5&&plan.maxUses===3&&plan.composition?.three===60&&plan.composition?.four===20){Object.assign(config,clone(QUALITY_TEMPLATE));delete plan.composition;}
    else if(!enabled)config.wordLengths=planTargetLengths({...config,targetCount:plan.fixedTargets,composition:plan.composition},[...new Set(dictionary.words.map(w=>w.length))].filter(n=>n>=plan.minLength&&n<=plan.maxLength),()=>.5);
    const context=getSequenceContext(dictionary.metadata.origin,plan.placement);
    if(context.previousNumber!==null&&plan.startNumber<=context.previousNumber)throw new Error(`起始关号须大于前一关 #${context.previousNumber}`);
    return {count,engine,dictionary,config,budget:settings.budget,plan,context,quality:settings.quality};
  }
  function renderSizes(settings){
    const choices=[...BATCH_SIZES];if(!choices.some(([c,r])=>c===settings.config.cols&&r===settings.config.rows))choices.push([settings.config.cols,settings.config.rows]);
    $('bulk-size-options').replaceChildren(...choices.map(([cols,rows])=>{const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.dataset.cols=cols;i.dataset.rows=rows;i.value=`${cols}x${rows}`;i.checked=(cols===settings.config.cols&&rows===settings.config.rows)||['3x3','4x2','4x3','5x3'].includes(i.value);l.append(i,document.createTextNode(`${cols} × ${rows}`));return l;}));
  }
  function updateNumber(){if(!autoNumber)return;try{const d=dictionaryForSettings(),c=getSequenceContext(d.metadata.origin,$('bulk-placement').value);$('bulk-start-number').value=c.previousNumber===null?1:c.previousNumber+1;}catch{}}
  function drawCurve(points){
    const ns='http://www.w3.org/2000/svg',svg=$('bulk-curve');svg.replaceChildren();
    const element=(name,attrs)=>{const e=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
    for(const degree of [0,50,100]){const y=100-degree*.8;svg.append(element('line',{x1:32,x2:784,y1:y,y2:y,stroke:'#d6d9c8','stroke-dasharray':degree===0?'0':'4 5'}));const t=element('text',{x:23,y:y+4,'text-anchor':'end',fill:'#817767','font-size':10});t.textContent=degree;svg.append(t);}
    const xy=points.map(p=>({x:32+(p.index/Math.max(1,points.at(-1).index))*752,y:100-p.degree*.8,p}));
    svg.append(element('path',{d:`M32 100 ${xy.map(t=>`L${t.x.toFixed(1)} ${t.y.toFixed(1)}`).join(' ')} L784 100 Z`,fill:'#cddbc47a'}));
    svg.append(element('polyline',{points:xy.map(t=>`${t.x.toFixed(1)},${t.y.toFixed(1)}`).join(' '),fill:'none',stroke:'#51775b','stroke-width':2,'stroke-linejoin':'round'}));
    for(const t of xy){const c=element('circle',{cx:t.x,cy:t.y,r:points.length<=60?2.7:1.6,fill:'#51775b'}),title=element('title',{});title.textContent=`第 ${t.p.number} 关：难度 ${t.p.degree}，${t.p.targets} 个目标词`;c.append(title);svg.append(c);}
    for(const [x,p,anchor]of [[32,points[0],'start'],[784,points.at(-1),'end']]){const t=element('text',{x,y:118,fill:'#817767','font-size':10,'text-anchor':anchor});t.textContent=`第 ${p.number} 关`;svg.append(t);}
  }
  function update(){
    const curve=$('bulk-curve-enabled').checked;
    const fixed=$('bulk-target-mode').value==='fixed'||!curve;
    $('bulk-target-label').textContent=fixed?'每关目标词数':'起点目标词数';$('bulk-target-end-field').hidden=fixed;
    for(const id of ['bulk-difficulty-start','bulk-difficulty-end','bulk-ramp-levels','bulk-peak-every','bulk-peak-drop','bulk-min-length','bulk-max-length','bulk-zipf-easy','bulk-zipf-hard','bulk-rare-limit'])$(id).disabled=busy||!curve;
    for(const id of ['bulk-target-mode','bulk-target-count','bulk-target-end','bulk-max-uses'])$(id).disabled=busy||(id==='bulk-target-mode'&&!curve);
    for(const i of $('bulk-size-options').querySelectorAll('input'))i.disabled=busy||!curve;
    $('bulk-zen-field').hidden=true;$('bulk-curve').hidden=!curve;
    $('bulk-model-note').textContent='目标词从 WT词库.xlsx 必答词中选取。三字、四字比例按目标词总数计算，其余从本词库可用词长中随机补齐。';
    try{
      const job=read();$('bulk-origin-note').textContent=`${BANK_NAMES[job.dictionary.metadata.origin]} · ${job.dictionary.words.length.toLocaleString()} 个候选词 · 只使用这一来源`;
      if(curve){const p=previewBatchPlan(job.plan,job.count,job.dictionary,job.engine);drawCurve(p.points);const a=p.first,b=p.last;const describe=s=>`${s.targetCount} 个目标，最长 ${Math.max(...s.config.wordLengths)} 字`; $('bulk-plan-summary').textContent=`第 ${job.plan.startNumber}～${job.plan.startNumber+job.count-1} 关：起点 ${describe(a)}；本批终点 ${describe(b)}。${job.plan.curve.peakEvery?`每 ${job.plan.curve.peakEvery} 关一个峰值，峰后回落 ${job.plan.curve.drop}。`:'不设周期峰值。'}`;}
      else $('bulk-plan-summary').textContent=`使用当前 ${job.config.cols} × ${job.config.rows} 棋盘，每关 ${job.config.wordLengths.length} 个目标，词长 ${job.config.wordLengths.join('/')}。`;
      $('bulk-curve-title').textContent=curve?'难度曲线预览':'按当前棋盘和词长生成';$('bulk-validation').textContent='';$('bulk-generate').disabled=busy;
    }catch(e){$('bulk-validation').textContent=e.message;$('bulk-generate').disabled=true;}
  }
  dialog.addEventListener('input',e=>{if(e.target.id==='bulk-start-number')autoNumber=false;update();});
  dialog.addEventListener('change',e=>{if(['bulk-dictionary-source','bulk-placement'].includes(e.target.id)){autoNumber=true;updateNumber();}update();});
  for(const id of ['bulk-close','bulk-close-footer'])$(id).onclick=()=>dialog.close();
  $('bulk-cancel').onclick=onCancel;
  $('bulk-generate').onclick=()=>{try{onStart(read());}catch(e){$('bulk-validation').textContent=e.message;}};
  return {
    open(){if(!initialized){const s=getSettings();$('bulk-dictionary-source').value='wt-workbook';$('bulk-zen-bank').value='all';$('bulk-target-count').value=s.config.wordLengths.length;$('bulk-three-percent').value=s.composition?.three??30;$('bulk-four-percent').value=s.composition?.four??30;renderSizes(s);initialized=true;}$('bulk-dictionary-source').value='wt-workbook';updateNumber();update();if(!dialog.open)dialog.showModal();},
    setBusy(value){busy=value;for(const el of dialog.querySelectorAll('input,select'))el.disabled=value;$('bulk-cancel').disabled=!value;update();},
    progress(generated,requested,message){$('bulk-modal-progress').max=requested;$('bulk-modal-progress').value=generated;$('bulk-modal-status').textContent=message;$('bulk-random-note').textContent=`已生成 ${generated} / ${requested} 关`;$('bulk-pinned-progress').max=requested;$('bulk-pinned-progress').value=generated;$('bulk-pinned-progress').hidden=false;},
    close(){dialog.close();},get isOpen(){return dialog.open;},refresh:update
  };
}
