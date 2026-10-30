import {DEFAULT_PROFILE,normalizeProfile,summarizeRuns} from './core/playtest.js?v=46';
import {HumanRecorder,RECORD_KEY,PROFILE_KEY,mergeHumanRecords,calibrateEnglish} from './core/playtest-records.js?v=46';
import {ZenSession} from './core/zen-levels.js?v=17';
import {levelMetrics,SessionMetrics,TARGET_LENGTH_RATIO_TITLE,targetLengthRatio} from './core/playtest-metrics.js?v=46';
import {MachinePlaytestResults} from './core/machine-playtest-results.js?v=40';
import {spatialLevelMetrics} from './core/spatial-perception.js?v=46';
import {exportAnalysisXlsx,exportAnalysisJson,downloadFile,XLSX_MIME} from './core/playtest-export.js?v=48';
import {LANGUAGE_NAMES} from './core/source-levels.js?v=15';
import {BANK_NAMES} from './core/dictionary-banks.js?v=23';
import {LevelSequence,levelFingerprint,openSequenceStorage} from './core/level-sequence.js?v=38';
import {createAlgorithmSession,refreshWorkbookEntry} from './core/algorithm-v1-adapter.js?v=38';
import {mountBatchGenerationDialog} from './batch-generation-ui.js?v=39';
import {mountLevelEditor} from './level-edit-ui.js?v=21';
import {ENGLISH_FREQUENCY} from './core/playtest-frequency.js?v=34';
import {selectSimulationRange,SimulationTotals} from './core/playtest-batch.js?v=48';
import {mountLevelQuality} from './quality-ui.js?v=39';
import {wtSourceCatalogue,wtSourceBank,originalOrder} from './core/wt-source-library.js?v=40';
import {convertWTLevel} from './core/wt-source-session.js?v=40';
import {MAX_PLAYTEST_UPLOAD_BYTES} from './core/playtest-import.js?v=47';
import {settlementArtMarkup} from './settlement-art.js?v=4';

const $=id=>document.getElementById(id),fmt=n=>n==null?'不适用':Number(n).toFixed(1),pct=n=>n==null?'—':(n*100).toFixed(1)+'%';
const BANKS=[{key:'main-en-us_t1',label:'主线 T1',file:'main-en-us_t1.json',count:1000},{key:'main-en-us_t3',label:'主线 T3',file:'main-en-us_t3.json',count:1000}];
async function json(url){const response=await fetch(url);if(!response.ok)throw new Error('数据读取失败');return response.json();}
function options(select,items){select.replaceChildren(...items.map(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;}));}
function metric(label,value,help=''){const row=document.createElement('div');row.className='metric-row';const title=document.createElement('span'),number=document.createElement('strong');title.textContent=label;number.textContent=value;row.append(title,number);if(help)row.title=help;return row;}

export function mountPlaytestLab(hooks) {
  const editor=$('editor-panel'),workspace=document.querySelector('.workspace'),shell=$('game-screen'),heading=editor.querySelector('.editor-heading');
  const header=document.createElement('header');header.className='workbench-header';header.append(heading);shell.prepend(header);
  const home=document.createElement('button');home.id='workbench-home';home.className='workbench-home';home.type='button';home.textContent='返回大厅';home.onclick=()=>hooks.showLobby();header.append(home);
  heading.querySelector('.algorithm-field').hidden=true;$('editor-close').hidden=true;
  const nav=document.createElement('nav');nav.className='lab-tabs';nav.setAttribute('aria-label','编辑器工作区');nav.innerHTML='<button type="button" data-lab-tab="edit" aria-pressed="true">编辑关卡</button><button type="button" data-lab-tab="simulate" aria-pressed="false">模拟试玩</button><button type="button" data-lab-tab="batch" aria-pressed="false">反跑关卡</button>';header.append(nav);
  const sourceControl=document.createElement('div');sourceControl.className='workbench-source';sourceControl.innerHTML='<label>当前试玩<select id="play-source"><option value="web">WT词库.xlsx 生成关卡</option><option value="wordtiles">WT 1.4.0 英文原包</option></select></label><label id="play-bank-field" hidden>主线<select id="play-bank"><option value="main-en-us_t1">T1</option><option value="main-en-us_t3">T3</option></select></label><button id="info-open" type="button">关卡信息</button><button id="controls-open" type="button">配置</button><span id="source-change-status" role="status"></span>';header.append(sourceControl);
  const information=document.createElement('aside');information.id='level-info-panel';information.className='level-info-panel';information.setAttribute('aria-label','关卡信息');information.innerHTML='<div class="info-heading"><h2>关卡信息</h2><button id="info-close" type="button" aria-label="关闭关卡信息">×</button></div><div id="level-size-card" class="level-size-card"></div><h3>词汇组成 · 目标 / 额外</h3><div id="word-length-metrics" class="metric-cards"></div><div id="word-ratio-metrics" class="metric-list"></div><h3>路径与格子</h3><div id="path-metrics" class="metric-list"></div><p id="path-metric-note" class="metric-note"></p>';workspace.prepend(information);
  const perception=document.createElement('section');perception.className='perception-section';perception.innerHTML='<h3>排布识别</h3><div id="perception-metrics" class="metric-list"></div><details><summary>逐词排布与推进校正</summary><div class="lab-table-scroll"><table class="lab-results"><thead><tr><th>目标词</th><th>拐弯</th><th>反向步</th><th>外圈格</th><th>原识别估计</th><th>校正后识别估计</th><th>分差</th><th>半数外露覆盖</th><th>半数外露回合</th><th>同字干扰减少</th></tr></thead><tbody id="perception-words"></tbody></table></div></details><p class="metric-note">原识别估计保留不变。校正分用128次推进模拟，按80%目标词已认识；共享格用尽后才打开，外围生词仍作阻挡，封闭内洞不算外露，同字干扰随格子耗尽重新计算。半数外露回合越小代表越早变得可见；覆盖率表示该词在多少次认识样本中达到过半外露。工程模型尚未经真人校准。</p>';information.append(perception);
  const attemptMetrics=document.createElement('div');attemptMetrics.className='metric-list current-attempt-metrics';
  const errorMetric=metric('本关平均错误尝试次数','未批量试玩','有效机器试玩局的平均无效提交次数，包含正常放弃局，排除异常局。额外词、重复已完成词与真人操作不计。');errorMetric.querySelector('span').id='current-error-label';errorMetric.querySelector('strong').id='current-error-count';
  const attemptSource=metric('统计来源','批量试玩均值');attemptSource.querySelector('strong').id='current-attempt-source';attemptMetrics.append(errorMetric,attemptSource);$('level-size-card').after(attemptMetrics);
  const existing=document.createElement('div');existing.id='editor-edit-workspace';for(const child of [...editor.children])existing.append(child);const configHeading=document.createElement('h2');configHeading.className='config-heading';configHeading.textContent='关卡配置';existing.prepend(configHeading);editor.append(existing);
  const shape=document.createElement('section');shape.id='generation-shape';shape.className='generation-shape';shape.innerHTML='<h3>棋盘与目标</h3><p id="shape-mode-note" class="metric-note" hidden></p>';
  shape.append(document.querySelector('[data-settings-pane="board"] .field-grid'));
  const targetCount=document.createElement('label');targetCount.innerHTML='目标词数量<input id="generation-target-count" type="number" min="1" max="16" step="1" value="5">';shape.querySelector('.field-grid').append(targetCount);shape.querySelector('.field-grid').classList.add('shape-size-grid');
  const lengths=document.createElement('div');lengths.className='shape-lengths';lengths.innerHTML='<div class="shape-ratios"><label>三字词比例<div class="ratio-input"><input id="generation-three-percent" type="number" min="0" max="100" step="1" value="30"><span>%</span></div></label><label>四字词比例<div class="ratio-input"><input id="generation-four-percent" type="number" min="0" max="100" step="1" value="30"><span>%</span></div></label></div><p id="composition-note" class="metric-note">其余词长随机补齐</p><p id="shape-status" class="metric-note" aria-live="polite"></p><div hidden><input id="generation-auto-lengths" type="checkbox" checked><input id="generation-lengths" type="text"></div>';shape.append(lengths);existing.insertBefore(shape,$('generation-section'));
  const engineField=document.createElement('label');engineField.hidden=true;engineField.innerHTML='<select id="generation-engine"><option value="flexible">可调棋盘回溯</option></select>';$('generation-section').insertBefore(engineField,$('generate'));
  const bulk=document.createElement('section');bulk.id='bulk-generation';bulk.className='bulk-generation';bulk.innerHTML='<h3>批量生成关卡</h3><p class="metric-note">设置起始关号、难度曲线、目标词数和多种棋盘规格，再插入对应词库的关序。</p><button id="bulk-open" class="bulk-open-button" type="button">配置批量生成</button><div class="lab-actions"><button id="bulk-stop" type="button" hidden>中止生成</button><button id="bulk-export" type="button" disabled>导出本批 JSON</button></div><progress id="bulk-progress" value="0" max="1" aria-label="批量生成进度"></progress><p id="bulk-status" class="metric-note" role="status">关卡生成后可逐关试玩、编辑和反跑分析。</p>';$('generation-section').after(bulk);
  const nativeBulk=document.createElement('button');nativeBulk.id='wt-bulk-entry';nativeBulk.type='button';nativeBulk.className='native-bulk-entry';nativeBulk.hidden=true;$('source-controls').append(nativeBulk);
  $('level-statistics').hidden=true;existing.querySelector('.seed-field').hidden=true;
  const mobileClose=document.createElement('button');mobileClose.id='workbench-mobile-close';mobileClose.type='button';mobileClose.textContent='关闭配置';editor.prepend(mobileClose);
  const areas=document.createElement('div');areas.className='lab-areas';areas.innerHTML=`
    <section id="lab-zen-settings" class="lab-pane" hidden><h2>Zen 主线配置</h2><p class="lab-description">在上方选择 T1 或 T3，按原始编号载入。原包使用字母池，字母数量与词长随关卡自动适配。</p><label>关卡序号<input id="zen-position" type="number" min="1" max="1000" step="1" value="1"></label><div class="lab-actions"><button id="zen-prev" type="button">上一关</button><button id="zen-load" class="lab-primary" type="button" disabled>载入关卡</button><button id="zen-next" type="button">下一关</button></div><p id="zen-status" role="status">正在读取关卡库…</p><details><summary>本关词汇名单</summary><div id="zen-word-roles"></div></details></section>
    <section id="lab-simulate" class="lab-pane" hidden><h2>模拟试玩</h2>
      <div class="simulation-source-settings"><div class="lab-field-grid"><label>关卡来源<select id="sim-source"><option value="web">WT词库.xlsx 生成关卡</option><option value="wordtiles">WT 1.4.0 英文原包</option></select></label><label id="sim-bank-field" hidden>原包关卡列表<select id="sim-bank"><option value="level_list_0">主线表0</option></select></label></div><p id="sim-source-status" class="metric-note" role="status" aria-live="polite"></p></div>
      <div class="simulation-strategy"><span>试玩策略</span><strong>普通英语休闲玩家</strong></div><label>认识目标词比例（%）<input id="sim-knowledge-percent" type="number" min="0" max="100" step="0.1" value="80"></label><p id="sim-mode-note" class="metric-note"></p>
      <div class="sim-range-settings"><div class="lab-field-grid"><label>试玩范围<select id="sim-scope"><option value="current">当前关卡</option><option value="range">手动填写关卡范围</option></select></label><label for="sim-repeats">每关试玩次数<input id="sim-repeats" type="number" min="1" max="1000" step="1" value="100"></label></div><div id="sim-range-fields" class="lab-field-grid"><label>起始关号<input id="sim-range-start" type="number" min="1" step="1" value="1" aria-describedby="sim-range-note"></label><label>结束关号<input id="sim-range-end" type="number" min="1" step="1" value="1" aria-describedby="sim-range-note"></label></div><p id="sim-range-note" class="metric-note"></p><p id="sim-selection-summary" class="sim-selection-summary" role="status" aria-live="polite"></p></div><div class="sim-batch-controls"><button id="sim-batch-start" class="lab-primary" type="button" disabled>批量试玩本关</button><button id="sim-batch-stop" type="button" disabled>取消</button><button id="sim-next" type="button">下一关</button></div><p id="sim-status" role="status" aria-live="polite">填写次数后开始批量试玩。</p><progress id="sim-batch-progress" value="0" max="100" aria-label="批量试玩进度" hidden></progress>
      <div class="simulation-results"><h3 id="sim-results-title">本关批量试玩均值</h3><div id="sim-results" class="result-cards"></div></div>
      <p id="sim-results-note" class="metric-note" hidden>每局从初始棋盘独立随机试玩。其他均值包含通关和正常放弃局，排除异常局；通关耗时仅取已通关局的用时中位数，无样本留空。</p>
      <details id="sim-range-details" hidden><summary>逐关均值</summary><div class="lab-table-scroll"><table class="lab-results"><thead><tr><th>关卡</th><th>有效 / 已计算</th><th>平均错误</th><th>通关耗时（秒）</th><th>平均试探</th><th>状态</th></tr></thead><tbody id="sim-range-results"></tbody></table></div></details>
      <details class="human-settings"><summary>自己试玩与真人记录</summary><div class="lab-field-grid"><label>测试者代号<input id="human-participant" maxlength="60" value="本机测试者"></label><label>测试者类型<select id="human-audience"><option value="self-other">本人测试</option><option value="ordinary-english">普通英语休闲玩家</option><option value="experienced">熟练玩家</option></select></label></div><div class="lab-actions"><button id="human-start" type="button">自己试玩并记录</button><button id="human-finish" type="button" disabled>结束／放弃</button></div><p id="human-status" role="status">点击棋盘上方“开始试玩”后连词；启用真人记录可用于英语校准。</p><p id="record-summary"></p><div class="lab-actions"><button id="human-export" type="button">导出真人记录</button><button id="human-import" type="button">合并真人记录</button><button id="human-calibrate" type="button">校准英语水平</button></div><input id="human-file" type="file" accept=".json,application/json" hidden><p id="calibration-status" role="status"></p></details>
      <p id="profile-status" class="metric-note"></p><a href="./playtest/methodology.html" target="_blank" rel="noopener">英语模型依据 ↗</a>
    </section>
    <section id="lab-batch" class="lab-pane" hidden><h2>反跑关卡</h2><p class="lab-description">使用普通英语休闲玩家策略反跑所选关卡，统计通关耗时和错误尝试。</p>
      <div id="batch-form"><div class="lab-field-grid"><div class="batch-source-field"><label for="batch-game">关卡来源</label><div class="batch-source-picker"><select id="batch-game"><option value="web">WT词库.xlsx</option><option value="wordtiles">WT 1.4.0 英文原包</option><option value="uploaded" disabled>已上传关卡</option></select><button id="batch-upload" type="button" title="支持单关、批量生成和关序 JSON，最多 20 MB。上传后按文件顺序填写起止序号。">上传关卡</button></div></div><label>认识目标词比例（%）<input id="batch-knowledge-percent" type="number" min="0" max="100" step="0.1" value="80"></label><label id="batch-language-field" hidden>语言<select id="batch-language"><option value="english">英语</option></select></label></div><input id="batch-upload-file" type="file" accept=".json,application/json" hidden><p id="batch-range-note"></p>
      <div class="batch-range-grid"><label>开始序号<input id="batch-start" type="number" min="1" step="1" value="1"></label><label>结束序号<input id="batch-end" type="number" min="1" step="1" value="30"></label><label>每关试玩（局）<input id="batch-repeats" type="number" min="1" max="1000" step="1" value="20"></label></div><label class="lab-checkbox"><input id="batch-words" type="checkbox" checked>附加词汇明细</label><label class="lab-checkbox"><input id="batch-runs" type="checkbox">附加逐局明细</label></div>
      <div class="lab-actions"><button id="batch-run" class="lab-primary" type="button" disabled>开始反跑</button><button id="batch-cancel" type="button" disabled>取消</button><button id="batch-xlsx" type="button" disabled>导出 Excel</button><button id="batch-json" type="button" disabled>导出 JSON</button></div><progress id="batch-progress" value="0" max="1" aria-label="反跑进度"></progress><p id="batch-status" role="status" aria-live="polite">正在读取目录…</p>
      <div class="simulation-results" id="batch-averages-panel" hidden><h3>本批试玩均值</h3><div id="batch-averages" class="result-cards"></div><p class="metric-note">按有效试玩局数取平均，含正常放弃局，排除异常局。</p></div>
      <div class="lab-table-scroll"><table class="lab-results"><thead><tr><th>关卡</th><th>目标词</th><th id="batch-length-distribution">目标词长分布（3：4：5：6）</th><th>平均试探</th><th>平均错误</th><th>通关耗时（秒）</th><th>倒向 / 多拐 / 低识别</th></tr></thead><tbody id="batch-results"></tbody></table></div><p id="batch-table-note">试探为探索性滑动次数，错误为无效提交次数；末列为目标词数量。点击结果查看关卡，导出可选词汇与逐局明细。</p>
    </section>
    <section id="web-library" class="web-library"><div class="library-heading"><h2>生成关卡关序</h2><span id="web-level-count">0 关</span></div><div class="sequence-library-actions"><button id="sequence-export" type="button">导出关序</button><button id="sequence-import" type="button">导入关序／批量 JSON</button></div><input id="sequence-file" type="file" accept=".json,application/json" hidden><ol id="web-level-list" class="web-level-list"></ol><button id="sequence-more" type="button" hidden>显示更多关卡</button><p id="sequence-storage-note" class="metric-note">关序按词库分别保存，生成后可继续修改。</p></section>`;
  editor.append(areas);
  const zenBulk=document.createElement('button');zenBulk.id='zen-bulk-entry';zenBulk.type='button';zenBulk.className='native-bulk-entry';zenBulk.textContent='使用当前 Zen 词库批量生成新关卡';$('lab-zen-settings').append(zenBulk);
  const preview=document.createElement('section');preview.id='zen-play-preview';preview.className='lab-zen-preview';preview.hidden=true;preview.innerHTML='<div class="zen-navigation"><button id="zen-open-editor" type="button">配置</button><button id="zen-open-info" type="button">关卡信息</button></div><div class="zen-preview-heading"><span>ZEN WORD</span><h2 id="zen-play-label">主线 T1</h2></div><p id="zen-play-progress"></p><div id="zen-play-targets" class="zen-play-targets"></div><div id="zen-play-pool" class="zen-play-pool"></div><form id="zen-play-form"><label for="zen-play-input">拼出单词</label><div class="zen-input-row"><input id="zen-play-input" autocomplete="off" spellcheck="false"><button type="submit">提交</button></div></form><p id="zen-play-feedback" role="status"></p><div class="lab-actions"><button id="zen-play-clear" type="button">清空输入</button><button id="zen-play-hint" type="button">提示</button><button id="zen-play-reset" type="button">重开</button></div>';document.querySelector('.preview-column').append(preview);
  const playBar=document.createElement('div');playBar.className='playtest-start-bar';playBar.innerHTML='<span id="manual-play-status">待开始 · 0.0 秒</span><button id="manual-play-start" type="button">开始试玩</button>';document.querySelector('.preview-column').prepend(playBar);
  const dialog=document.createElement('dialog');dialog.id='level-complete-dialog';dialog.className='level-complete-dialog';dialog.setAttribute('aria-labelledby','level-complete-title');dialog.innerHTML=settlementArtMarkup()+'<div class="sr-only"><h2 id="level-complete-title">本关完成</h2><p id="level-complete-summary"></p></div><p id="complete-status" role="status" aria-live="polite"></p>';document.body.append(dialog);
  const settlementActions=dialog.querySelector('.settlement-buttons');
  function settlementReady(){if(dialog.open){dialog.classList.add('settlement-ready');settlementActions.inert=false;}}
  function openCompletion(){dialog.classList.remove('settlement-ready');settlementActions.inert=true;dialog.showModal();if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)settlementReady();}
  dialog.addEventListener('animationend',event=>{if(event.animationName==='settlement-part-float'&&event.target===settlementActions)settlementReady();});
  dialog.addEventListener('close',()=>{dialog.classList.remove('settlement-ready');settlementActions.inert=true;});

  let tab='edit',activeSource='web',sourceChanging=false,sourceRequest=0,frequency=ENGLISH_FREQUENCY,sourceCatalogue,zenCatalogue=null,zenSession=null,recorder=null,report=null,batchWorker=null,bulkWorker=null,bulkReport=null,bulkPreviewSession=null,bulkPreviewDictionary=null,bulkInsertion=null;
  let profile={...DEFAULT_PROFILE},records=[],storage,sequence=new LevelSequence(),sequenceStore=null,sequenceLoaded=false,sequenceSaveTimer,libraryLimit=200;
  const trackers=new WeakMap(),measures=new WeakMap(),completedShown=new WeakSet(),bankCache=new Map(),machineResults=new MachinePlaytestResults();
  let dataResetting=false,displayedMachineResult,simulationBatch=null,simulationRangeReport=null,simulationRangeInitialized=false,qualityPanel=null,sourceBank=null,originalDataPromise=null,rangeSourceKey='';
  let uploadedBatch=null,batchUploadJob=null,batchSourceRequest=0,batchSourceLoading=false,reportUploadedEntries=null;
  async function ensureOriginalData(){
    if(!originalDataPromise)originalDataPromise=Promise.all([wtSourceCatalogue(),wtSourceBank()]).then(([catalogue,bank])=>{sourceCatalogue=catalogue;sourceBank=bank;return bank;}).catch(error=>{originalDataPromise=null;throw error;});
    return originalDataPromise;
  }
  const originalList=()=>sourceBank?.orders[originalOrder(current()?.initial.source?.order||'level_list_0')]||[];
  try{storage=localStorage;records=mergeHumanRecords([],JSON.parse(storage.getItem(RECORD_KEY)||'[]'));const saved=JSON.parse(storage.getItem(PROFILE_KEY)||'null');if(saved)profile=normalizeProfile(saved);}catch{}
  const current=()=>activeSource==='zen'?zenSession:hooks.getGame();
  const inform=(id,e)=>$(id).textContent=e.message||String(e);
  const machineRunning=()=>!!simulationBatch;
  function tracker(session=current()){if(!session)return null;if(!trackers.has(session))trackers.set(session,new SessionMetrics(session));return trackers.get(session);}
  function readKnowledgeRate(id){const text=$(id).value.trim(),percent=Number(text);if(!text||!Number.isFinite(percent)||percent<0||percent>100)throw new Error('认识目标词比例请填写0～100之间的百分数');return percent/100;}
  function profileForRun(){return normalizeProfile({...profile,knowledgeRate:readKnowledgeRate(tab==='batch'?'batch-knowledge-percent':'sim-knowledge-percent')});}
  function syncKnowledgeControls(){for(const id of ['sim-knowledge-percent','batch-knowledge-percent'])$(id).disabled=machineRunning()||!!batchWorker||!!batchUploadJob||dataResetting;}
  for(const id of ['sim-knowledge-percent','batch-knowledge-percent']){const input=$(id);input.value=String(profile.knowledgeRate*100);input.oninput=()=>input.setCustomValidity('');input.onchange=()=>{
    try{profile=normalizeProfile({...profile,knowledgeRate:readKnowledgeRate(id)});for(const key of ['sim-knowledge-percent','batch-knowledge-percent']){$(key).value=String(Number((profile.knowledgeRate*100).toFixed(2)));$(key).setCustomValidity('');}try{storage?.setItem(PROFILE_KEY,JSON.stringify(profile));}catch{}
      machineResults.clear();simulationRangeReport=null;displayedMachineResult=undefined;updateRecordSummary();syncSimulationAvailability();updateInformation();if(report)$('batch-status').textContent='认识比例已修改，重新反跑后更新结果；当前导出保留原批次设置。';
    }catch(error){input.setCustomValidity(error.message);inform(id.startsWith('batch')?'batch-status':'sim-status',error);}
  };}
  function simulationUnavailable(){
    const session=current();
    if(!session)return '请先载入关卡。';
    if(session.initial.source?.language&&session.initial.source.language!=='english')return '目前只支持英语关卡的机器试玩。';
    if(session.initial.mode==='bubble')return '分类词组暂不适用英语连词玩家策略。';
    return '';
  }
  function syncSimulationAvailability(){
    syncKnowledgeControls();
    const unavailable=simulationUnavailable();
    const busy=machineRunning(),disabled=!frequency||!!unavailable||busy||sourceChanging||dataResetting;
    updateSimulationRangeControls();
    $('sim-batch-start').disabled=disabled||($('sim-scope').value==='range'&&(activeSource==='wordtiles'?!sourceBank:!sequenceLoaded));
    $('sim-batch-stop').disabled=!simulationBatch;$('sim-repeats').disabled=busy;
    for(const id of ['sim-scope','sim-range-start','sim-range-end'])$(id).disabled=busy;
    $('sim-source').disabled=busy||sourceChanging||dataResetting||!current();
    $('sim-bank').disabled=busy||sourceChanging||dataResetting||!sourceBank;
    $('sim-mode-note').textContent=unavailable||`认识 ${Number((profile.knowledgeRate*100).toFixed(2))}% 目标词，模拟观察和试错。通关耗时为预计玩家时间，机器会快速算完。`;
  }
  function updateSimulationRangeControls(){
    const range=$('sim-scope').value==='range',original=activeSource==='wordtiles',entries=original?originalList().map((id,index)=>({id,number:index+1})):webHistory();
    $('sim-source').value=original?'wordtiles':'web';$('sim-bank-field').hidden=!original;
    const lists=sourceCatalogue?.languages[0].lists||[],key=JSON.stringify(lists);
    if(lists.length&&$('sim-bank').dataset.lists!==key){options($('sim-bank'),lists.map(list=>[list.key,`${list.label}（${list.count}关）`]));$('sim-bank').dataset.lists=key;}
    const order=originalOrder(current()?.initial.source?.order||'level_list_0'),list=lists.find(item=>item.key===order);
    if(original&&list)$('sim-bank').value=order;
    $('sim-range-fields').hidden=false;$('sim-range-note').hidden=false;
    $('sim-batch-start').textContent=range?'开始范围试玩':'批量试玩本关';
    const first=entries[0]?.number,last=entries.at(-1)?.number;
    if(!simulationRangeInitialized&&entries.length){$('sim-range-start').value=first;$('sim-range-end').value=original?Math.min(20,last):last;simulationRangeInitialized=true;}
    for(const id of ['sim-range-start','sim-range-end'])$(id).max=last||1;
    $('sim-range-note').textContent=(original?`${list?.label||'原包列表'} · 可填 1～${last||0} 关，按列表顺序计数。`:entries.length?`已保存 #${first}～#${last}，共 ${entries.length} 关；按编辑关号选择。`:'暂无已保存关卡，请先生成或导入关序。')+' 起止关都包含；手填关号会自动切换到范围试玩。';
    const start=Number($('sim-range-start').value),end=Number($('sim-range-end').value),repeats=Number($('sim-repeats').value),summary=$('sim-selection-summary');
    let error='';
    if(!Number.isSafeInteger(repeats)||repeats<1||repeats>1000)error='每关试玩次数请填写 1～1000 的整数。';
    else if(range){try{checkSimulationRange(start,end,repeats);}catch(e){error=e.message;}}
    summary.classList.toggle('error',!!error);
    summary.textContent=error||(!range?`当前关卡${current()?.initial.source?.position?' · 第 '+current().initial.source.position+' 关':''}${original&&current()?.initial.source?.original?' · ID '+current().initial.source.original.id:''}，试玩 ${repeats} 次。`:`第 ${start}～${end} 关，共 ${end-start+1} 关 × 每关 ${repeats} 次 = ${((end-start+1)*repeats).toLocaleString()} 局。`);
  }
  function checkSimulationRange(start,end,repeats){
    if(![start,end].every(Number.isSafeInteger)||start<1||end<1)throw new Error('起始关号和结束关号请填写大于 0 的整数。');
    if(end<start)throw new Error('结束关号不能小于起始关号。');
    if(activeSource==='wordtiles'&&sourceBank&&end>originalList().length)throw new Error(`所选原包列表仅有 ${originalList().length} 关，请填写 1～${originalList().length}。`);
    if(end-start+1>10000||(end-start+1)*repeats>200000)throw new Error('每批最多 10,000 关、200,000 局，请缩小范围或每关次数。');
  }
  $('sim-scope').onchange=()=>{displayedMachineResult=undefined;syncSimulationAvailability();updateMachineResult();};
  for(const id of ['sim-range-start','sim-range-end'])$(id).oninput=()=>{
    simulationRangeInitialized=true;$('sim-scope').value='range';displayedMachineResult=undefined;syncSimulationAvailability();updateMachineResult();
  };
  $('sim-repeats').oninput=updateSimulationRangeControls;
  function averageMetrics(summary){return [
    ['有效 / 已计算局数',`${summary.samples} / ${summary.attempted}`],
    ['平均错误尝试',fmt(summary.meanMistakes)+' 次'],['通关耗时',summary.medianWinSeconds==null?'暂无通关样本':fmt(summary.medianWinSeconds)+' 秒'],
    ['平均试探滑动',fmt(summary.meanTrialSwipes)+' 次'],['平均全部提交',fmt(summary.meanAttempts)+' 次'],
    ['平均完成目标',fmt(summary.meanCompleted)+' 词'],
    ['平均认识目标',fmt(summary.meanKnownCount)+' 词（'+pct(summary.meanKnownRate)+'）'],
    ['平均认识但漏看',fmt(summary.meanKnownMissedTargets)+' 词'],['平均累计漏识别',fmt(summary.meanMissedRecognitions)+' 次'],
    ['平均拐弯操作',fmt(summary.meanTurnOperations)+' 次'],['平均反向连接',fmt(summary.meanReverseConnections)+' 次'],
  ];}
  function updateMachineResult(){
    const currentSummary=machineResults.getDisplay(current())?.summary;
    $('current-error-count').textContent=currentSummary?(currentSummary.samples?fmt(currentSummary.meanMistakes)+' 次':'暂无有效样本'):'未批量试玩';
    $('current-attempt-source').textContent=currentSummary?`批量均值 · ${currentSummary.samples} 局有效`:'批量试玩均值';
    const range=$('sim-scope').value==='range',result=range?(simulationRangeReport?.result??null):machineResults.getDisplay(current()),summary=result?.summary;
    if(displayedMachineResult===result)return;
    displayedMachineResult=result;
    $('sim-results-title').textContent=range?'范围批量试玩总体均值':'本关批量试玩均值';
    $('sim-range-details').hidden=!range||!simulationRangeReport;
    $('sim-results-note').hidden=!summary;$('sim-batch-progress').hidden=!summary;
    if(summary){
      $('sim-batch-progress').max=result.requested;$('sim-batch-progress').value=summary.attempted;
      const status={running:'正在批量试玩',complete:'批量试玩完成',cancelled:'已取消，保留已计算结果',failed:'批量试玩中断'}[result.status];
      $('sim-status').textContent=`${status}${range?` · ${result.sourceLabel||''} · #${result.start}～#${result.end} · 已完成 ${result.processed}/${result.levelCount} 关`:''} · ${summary.attempted}/${result.requested} 局 · ${summary.samples} 局有效 · ${summary.errors} 局异常`;
      $('sim-results').replaceChildren(...averageMetrics(summary).map(([label,value])=>metric(label,value)));return;
    }
    if(frequency&&!machineRunning())$('sim-status').textContent=range?'填写关卡范围和每关次数后开始试玩。':'填写次数后开始批量试玩。';
    $('sim-results').replaceChildren();
  }
  function sourceName(){return current()?.initial.algorithm===1?'WT 1.4.0 英文原包':'WT词库.xlsx 生成关卡';}
  function updateInformation(){
    const session=current();if(!session){$('level-size-card').textContent='正在载入关卡…';return;}
    if(!measures.has(session))measures.set(session,levelMetrics(session.initial,session.bonusDictionaryInput||session.dictionary));const m=measures.get(session);
    const origin=session.dictionary?.metadata?.origin,original=session.initial.algorithm===1;
    $('level-size-card').replaceChildren(metric(sourceName(),m.rows?`${m.cols} × ${m.rows}`:`${[...session.pool].length} 个字母`),metric('词库来源',original?'原包本关名单':BANK_NAMES[origin]||'历史网页词库'),metric('本关总词数',`${m.wordCount} 个`),metric('目标 / 额外词',`${m.targetCount} / ${m.extras}`));
    if(original)$('level-size-card').append(metric('原关卡 ID',session.initial.source.original.id),metric('顺序表',session.initial.source.order),metric('列表内序号',session.initial.source.position),metric('待开帘格子',session.blockedCells.length),metric('当前可连目标',session.availableTargets.length));
    if(activeSource==='web')$('level-size-card').append(metric('生成算法',session.initial.source?.generationEngine==='supplied-v1'?'历史关卡':'可调棋盘回溯'));
    if(activeSource==='web'&&session.initial.source?.editorNumber)$('level-size-card').append(metric('编辑关号',session.initial.source.editorNumber));
    if(activeSource==='web'&&session.initial.source?.difficultyRequested!=null)$('level-size-card').append(metric('计划难度',session.initial.source.difficultyRequested+(session.initial.source.edited?' · 已手改':'')));
    const lengths=[...new Set([...Array.from({length:9},(_,i)=>i+2),...Object.keys(m.wordLengths).map(Number),...Object.keys(m.extraWordLengths).map(Number)])].sort((a,b)=>a-b);
    $('word-length-metrics').replaceChildren(...lengths.map(n=>{const card=metric(n+' 字词',`${m.wordLengths[n]||0} / ${m.extraWordLengths[n]||0}`,`目标词 ${m.wordLengths[n]||0} 个；额外词 ${m.extraWordLengths[n]||0} 个。目标占比 = ${m.wordLengths[n]||0} ÷ ${m.targetCount}（本关总目标词数）= ${pct(m.wordLengthShares[n]||0)}。`);const share=document.createElement('small');share.textContent='目标占比 '+pct(m.wordLengthShares[n]||0);share.title=`${m.wordLengths[n]||0} / ${m.targetCount} 个目标词`; card.append(share);return card;}));
    $('word-length-metrics').setAttribute('aria-label','按全部实际词长分别统计，数值为目标词 / 额外词');
    $('word-ratio-metrics').replaceChildren(metric(TARGET_LENGTH_RATIO_TITLE,m.wordLengthRatio));
    $('path-metrics').replaceChildren(...[['目标词拐弯总次数',m.totalTurns],['反向目标词数',m.reverseTargets],['重复使用格子数',m.sharedTiles],['最大格子使用次数',m.maxTileUses]].map(([label,value])=>metric(label,value??'不适用')));
    const perceptionStats=spatialLevelMetrics(session.initial,{knowledgeRate:profile.knowledgeRate});
    perception.querySelector('.metric-note').textContent=`校正分使用 ${Number((profile.knowledgeRate*100).toFixed(2))}% 认识比例模拟推进清词；共享格用尽后才打开，外围生词保留阻挡，封闭内洞不算外露。原识别分保持不变，工程模型尚未经真人校准。`;
    $('perception-metrics').replaceChildren(...[['顺读词（无左／上步）',m.readingForwardTargets],['倒向词（反向步 > 50%）',m.reverseMajorityTargets],['外圈词（外圈格 ≥ 80%）',m.outerTargets],['多拐词（≥ 2 次）',m.spatialMultiTurnTargets],['低识别词（原分 < 55%）',m.hardToSpotTargets]].map(([label,value])=>metric(label,value??'不适用')),
      metric('原识别估计分',pct(perceptionStats.meanKnownRecognition),'保留原来的静态排布公式，分数越高表示越容易识别。'),
      metric('校正后识别估计分',pct(perceptionStats.meanCorrectedRecognition),`按${Number((profile.knowledgeRate*100).toFixed(2))}%认识率模拟推进清词后的单轮识别概率；未改变原识别分。`),
      metric('推进校正平均变化',perceptionStats.meanProgressionGain==null?'—':(perceptionStats.meanProgressionGain>=0?'+':'')+(perceptionStats.meanProgressionGain*100).toFixed(1)+' 个百分点'),
      metric('半数外露目标词',perceptionStats.applicable&&perceptionStats.progressionApplicable!==false?`${perceptionStats.words.filter(word=>word.halfExposureRate>0).length} / ${perceptionStats.words.length} 个`:'不适用', '至少一半路径格接到棋盘外缘的目标词数。'),
      metric('平均半数外露回合',!perceptionStats.applicable?'不适用':perceptionStats.meanFirstHalfExposureTurn==null?'—':perceptionStats.meanFirstHalfExposureTurn.toFixed(1)+' 次清词','仅对曾达到半数外露的认识样本取平均；0表示初始已外露。'),
      metric('发现时平均外露率',pct(perceptionStats.meanExposureAtDiscovery),'目标词被识别时，路径中连到外缘的格子比例。'),
      metric('平均同字干扰减少',perceptionStats.meanAmbiguityReduction==null?'—':perceptionStats.meanAmbiguityReduction.toFixed(2)+' 项','目标路径同字邻格干扰值从初始到识别时的平均减少量。'));
    $('perception-words').replaceChildren(...perceptionStats.words.slice().sort((a,b)=>a.length-b.length).map(word=>{const row=document.createElement('tr');for(const value of [word.word,word.turns,pct(word.backwardShare),pct(word.edgeShare),pct(word.recognitionProbability),pct(word.correctedRecognitionProbability),word.progressionGain==null?'不适用':(word.progressionGain>=0?'+':'')+(word.progressionGain*100).toFixed(1)+' pp',pct(word.halfExposureRate),perceptionStats.progressionApplicable===false?'不适用':word.meanFirstHalfExposureTurn==null?'未过半':word.meanFirstHalfExposureTurn.toFixed(1),word.meanAmbiguityReduction==null?'—':word.meanAmbiguityReduction.toFixed(2)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}return row;}));
    $('path-metric-note').textContent=original?'格子次数按每词全部路径的格子并集统计；原识别分保持不变，校正分按真实帘子解锁、扣次与替代格清理规则推进。':m.spatialApplicable?'反向目标按终点方向计；排布识别另统计每一步的方向与拐弯。':'Zen 字母池不使用棋盘空间指标。';
    updateSessionInformation();qualityPanel?.update();
  }
  function recordPersonal(session=current(),flush=false){if(dataResetting)return;const t=trackers.get(session);if(t)hooks.recordPersonalProgress?.(session,t.snapshot(),flush);}
  function pausePersonal(){const session=current();trackers.get(session)?.pause();recordPersonal(session,true);}
  function updateSessionInformation(){const t=tracker();if(!t)return;const s=t.snapshot();recordPersonal();
    updateMachineResult();
    $('manual-play-status').textContent=s.timeKind==='virtual'?'机器预计 · '+fmt(s.elapsedSeconds)+' 秒':!s.started?'待开始 · 0.0 秒':s.finished?'本关结束 · '+fmt(s.elapsedSeconds)+' 秒':'试玩中 · '+fmt(s.elapsedSeconds)+' 秒';$('manual-play-start').disabled=machineRunning()||!current()||current().status!=='playing'||s.started||s.timeKind==='virtual';}
  const canPlay=()=>!!tracker()?.started&&!tracker().finished&&!machineRunning();
  const inPlayer=()=>shell.dataset.mode==='play'&&$('lobby').hidden;
  function startPlayer(){
    stopMachine();changeTab('edit');
    if(tracker()?.snapshot().timeKind==='virtual')resetCurrent();
    if(current()?.status==='playing')tracker().start();
    syncTime();hooks.render();
  }
  $('manual-play-start').onclick=()=>{if(!current()||machineRunning())return;tracker().start();syncTime();if(activeSource==='zen')renderZen();else hooks.render();updateInformation();};
  function syncTime(){for(const session of [hooks.getGame(),zenSession]){const t=trackers.get(session);if(t){if(session===current()&&!document.hidden&&$('lobby').hidden&&tab!=='batch')t.resume();else t.pause();recordPersonal(session,t.runningSince===null);}}if(recorder){if(recorder.session===current()&&!document.hidden&&$('lobby').hidden&&tab!=='batch')recorder.resume();else recorder.pause();}}
  function syncView(){
    const key=activeSource+':'+(activeSource==='wordtiles'?current()?.initial.source?.order:hooks.getDictionary()?.version);
    if(key!==rangeSourceKey){rangeSourceKey=key;simulationRangeInitialized=false;simulationRangeReport=null;displayedMachineResult=undefined;$('sim-range-results').replaceChildren();}
    renderWebLibrary();editor.classList.toggle('edit-web',tab==='edit'&&activeSource==='web');
    existing.hidden=tab!=='edit'||activeSource==='zen';$('lab-zen-settings').hidden=tab!=='edit'||activeSource!=='zen';
    $('lab-simulate').hidden=tab!=='simulate';$('lab-batch').hidden=tab!=='batch';$('web-library').hidden=tab!=='edit'||activeSource!=='web';
    $('play-source').value=activeSource;$('play-bank-field').hidden=activeSource!=='zen';preview.hidden=activeSource!=='zen';document.querySelector('.preview-column .viewport-sizer').hidden=activeSource==='zen';
    for(const button of nav.children)button.setAttribute('aria-pressed',String(button.dataset.labTab===tab));
    syncSimulationAvailability();syncTime();updateInformation();
  }
  function changeTab(next){tab=next;syncView();}
  nav.addEventListener('click',e=>{const b=e.target.closest('[data-lab-tab]');if(b)changeTab(b.dataset.labTab);});
  const toggleControls=()=>$('editor-toggle').click(),toggleInfo=()=>shell.classList.toggle('information-open');
  $('controls-open').onclick=toggleControls;$('workbench-mobile-close').onclick=()=>$('editor-close').click();$('info-open').onclick=toggleInfo;$('info-close').onclick=()=>shell.classList.remove('information-open');$('zen-open-editor').onclick=toggleControls;$('zen-open-info').onclick=toggleInfo;
  document.addEventListener('visibilitychange',syncTime);new MutationObserver(syncTime).observe($('lobby'),{attributes:true,attributeFilter:['hidden']});const clock=setInterval(()=>updateSessionInformation(),500);
  function finishHuman(outcome){if(dataResetting){recorder=null;return;}if(!recorder)return;const record=recorder.finish(outcome);recorder=null;$('human-finish').disabled=true;if(record){records=mergeHumanRecords(records,[record]);try{storage?.setItem(RECORD_KEY,JSON.stringify(records));}catch{$('calibration-status').textContent='记录保留在本次页面，请导出保存。';}$('human-status').textContent=`${outcome==='won'?'完成':outcome==='gave-up'?'放弃':'中断'} · ${fmt(record.elapsedSeconds)}秒 · 错误${record.mistakes}次`;updateRecordSummary();}}
  function stopMachine(){if(simulationBatch)finishSimulationBatch(simulationBatch,'cancelled');syncSimulationAvailability();}
  function closeCompletion(){dialog.classList.remove('settlement-ready');settlementActions.inert=true;if(dialog.open)dialog.close();}
  const webHistory=()=>sequence.list(hooks.getDictionary()?.metadata?.origin||'legacy-web');
  function loadSequenceEntry(entry){
    pausePersonal();sourceChanging=true;finishHuman('interrupted');stopMachine();closeCompletion();activeSource='web';
    try{hooks.loadWeb(entry);}finally{sourceChanging=false;syncView();}
  }
  function renderWebLibrary(){
    const list=webHistory(),selected=current()?.initial;$('web-level-count').textContent=list.length+' 关';
    $('web-level-list').replaceChildren(...list.slice(0,libraryLimit).map(entry=>{
      const li=document.createElement('li'),button=document.createElement('button'),edit=document.createElement('button');
      button.type='button';button.textContent=`#${entry.number}　${entry.level.board?.cols||entry.level.cols} × ${entry.level.board?.rows||entry.level.rows}　${entry.level.targets.length} 个目标词 · ${BANK_NAMES[entry.dictionary.metadata?.origin]||'历史词库'}${entry.level.source?.difficultyRequested!=null?' · 难度 '+entry.level.source.difficultyRequested:''}`;
      button.setAttribute('aria-current',String(entry.level.id===selected?.id&&entry.level.seed===selected?.seed&&entry.dictionary.version===hooks.getGame()?.dictionary?.version));
      button.onclick=()=>loadSequenceEntry(entry);edit.type='button';edit.className='sequence-edit-button';edit.textContent='编辑';edit.disabled=!!bulkWorker;edit.onclick=()=>levelEditor.open(entry);
      li.append(button,edit);return li;
    }));
    $('sequence-more').hidden=list.length<=libraryLimit;
    updateSimulationRangeControls();
  }
  function rememberWeb(entry,position){
    const item=sequence.insert(entry,position);
    if(item){renderWebLibrary();scheduleSequenceSave();}
    return item;
  }
  async function saveSequence(){
    if(dataResetting||!sequenceStore||!sequenceLoaded)return;
    try{await sequenceStore.save(sequence.serialize());$('sequence-storage-note').textContent='关序已保存在本机浏览器，可逐关编辑；导出 JSON 可带到其他设备。';}
    catch{$('sequence-storage-note').textContent='浏览器无法保存关序，请导出 JSON 保留本次生成。';}
  }
  function scheduleSequenceSave(){clearTimeout(sequenceSaveTimer);sequenceSaveTimer=setTimeout(saveSequence,600);}
  function sequenceContext(origin,placement){
    const list=sequence.list(origin),session=current(),entry=session?.dictionary?sequence.find(session.initial,session.dictionary):null,currentIndex=entry?list.indexOf(entry):-1;
    const index=placement==='end'||currentIndex<0?list.length:currentIndex+(placement==='after'?1:0);
    return {index,previousNumber:index?list[index-1].number:null,
      beforeTargets:list.slice(Math.max(0,index-100),index).map(e=>e.level.targets.map(t=>t.word)),
      afterTargets:list.slice(index,index+100).map(e=>e.level.targets.map(t=>t.word)),existingFingerprints:list.map(e=>levelFingerprint(e.level))};
  }
  const levelEditor=mountLevelEditor({onSave:(entry,level)=>{sequence.replace(entry,level);if(bulkReport?.dictionary.version===entry.dictionary.version)bulkReport.levels=bulkReport.levels.map(l=>l.id===level.id&&l.seed===level.seed?entry.level:l);loadSequenceEntry(entry);saveSequence();}});
  const bulkDialog=mountBatchGenerationDialog({getSettings:hooks.generationSettings,getSequenceContext:sequenceContext,onStart:startBulk,onCancel:cancelBulk});
  $('bulk-open').onclick=()=>bulkDialog.open();$('bulk-stop').onclick=cancelBulk;
  function setBulkBusy(value){
    bulkDialog.setBusy(value);
    qualityPanel?.setGenerationBusy(value);
    for(const id of ['dictionary-source','zen-dictionary-bank','generation-engine','board-cols','board-rows','generation-target-count','generation-three-percent','generation-four-percent','generation-auto-lengths','generation-lengths','word-count','uniform-length','generate'])$(id).disabled=value;
    $('bulk-stop').hidden=!value;$('bulk-export').disabled=value||!bulkReport?.levels.length;$('sequence-import').disabled=value;renderWebLibrary();
    if(!value)hooks.refreshGenerationControls();
  }
  function bulkProgress(generated,requested,message){$('bulk-progress').max=requested;$('bulk-progress').value=generated;$('bulk-status').textContent=message;bulkDialog.progress(generated,requested,message);}
  function finishBulk(status,message,summary={}){
    const previewFirst=status==='complete'&&current()===bulkPreviewSession&&!tracker()?.started&&hooks.getDictionary()?.version===bulkPreviewDictionary;
    bulkWorker?.terminate();bulkWorker=null;if(bulkReport)Object.assign(bulkReport,{status,summary});
    bulkProgress(bulkReport?.levels.length||0,bulkReport?.requested||1,message);setBulkBusy(false);
    if(previewFirst&&bulkReport.levels.length)loadSequenceEntry({level:bulkReport.levels[0],dictionary:bulkReport.dictionary});
    bulkPreviewSession=null;saveSequence();
  }
  function startBulk(draft){
    if(bulkWorker)return;if(!sequenceLoaded)throw new Error('关序正在恢复，请稍后开始');
    if(!draft.plan.curve.enabled)hooks.checkGenerationConfig(draft.config,draft.dictionary);
    const {context,...settings}=draft,job={...settings,batchId:crypto.randomUUID(),frequency,...context};
    bulkInsertion=context.index;bulkPreviewSession=current();bulkPreviewDictionary=hooks.getDictionary()?.version;
    bulkReport={schemaVersion:2,kind:'generated-level-batch',status:'running',requested:job.count,engine:job.engine,config:job.config,plan:job.plan,dictionary:job.dictionary,frequencyVersion:frequency?.version,createdAt:new Date().toISOString(),levels:[],qualityReports:[]};
    const instance=new Worker('./generation-batch.worker.js?v=39',{type:'module'});bulkWorker=instance;setBulkBusy(true);
    bulkProgress(0,job.count,`正在生成 ${job.count} 关 · ${BANK_NAMES[job.dictionary.metadata.origin]}`);
    instance.onmessage=({data})=>{
      if(bulkWorker!==instance)return;
      if(data.type==='level'){
        if(data.qualityReport){bulkReport.qualityReports.push(data.qualityReport);qualityPanel?.generationResult({ok:true,level:data.level,qualityReport:data.qualityReport,qualitySearch:data.qualitySearch},job.dictionary);}
        const item=rememberWeb({level:data.level,dictionary:job.dictionary},{index:bulkInsertion+bulkReport.levels.length,number:job.plan.startNumber+bulkReport.levels.length});
        if(!item){finishBulk('failed','关卡重复，已保留此前完成的关卡');return;}
        bulkReport.levels.push(item.level);
        bulkProgress(data.index,job.count,`已生成 ${data.index}/${job.count} 关 · 第 ${item.number} 关 · ${data.level.targets.length} 个目标${data.level.source?.difficultyRequested!=null?' · 难度 '+data.level.source.difficultyRequested:''}`);
      }else if(data.type==='progress'&&data.attempts>data.generated)bulkProgress(data.generated,job.count,`已生成 ${data.generated}/${job.count} 关 · 搜索第 ${job.plan.startNumber+data.generated} 关 · 已尝试 ${data.attempts} 次`);
      else if(data.type==='done')finishBulk(data.status,data.status==='complete'?`生成完成：${bulkReport.levels.length} 关，已插入 ${BANK_NAMES[job.dictionary.metadata.origin]} 的关序。`:data.error,data);
      else if(data.type==='error')finishBulk('failed','生成失败：'+data.message);
    };
    instance.onerror=e=>{if(bulkWorker===instance)finishBulk('failed','生成线程失败：'+e.message);};instance.postMessage(job);
  }
  function cancelBulk(){if(bulkWorker)finishBulk('cancelled',`已取消，保留生成的 ${bulkReport?.levels.length||0} 关。`);}
  $('bulk-export').onclick=()=>downloadFile(JSON.stringify(bulkReport,null,2),'批量生成关卡.json');
  $('wt-bulk-entry').onclick=()=>bulkDialog.open({origin:'wt-workbook'});$('zen-bulk-entry').onclick=()=>bulkDialog.open({origin:'zen',bank:$('play-bank').value});
  $('sequence-more').onclick=()=>{libraryLimit+=200;renderWebLibrary();};
  $('sequence-export').onclick=()=>downloadFile(JSON.stringify({kind:'generated-level-sequence',...sequence.serialize(hooks.getDictionary()?.metadata?.origin||'legacy-web')},null,2),'生成关卡关序.json');
  $('sequence-import').onclick=()=>$('sequence-file').click();
  $('sequence-file').onchange=async()=>{
    const file=$('sequence-file').files[0];if(!file)return;
    try{
      const data=JSON.parse(await file.text());
      const snapshot=data.kind==='generated-level-batch'?{schemaVersion:1,dictionaries:[data.dictionary],levels:data.levels.map(l=>({level:l,dictionaryVersion:data.dictionary.version}))}:data;
      if(snapshot.schemaVersion!==1||!Array.isArray(snapshot.dictionaries)||!Array.isArray(snapshot.levels))throw new Error('请选择有效的关序或批量关卡 JSON');
      const dictionaries=new Map(snapshot.dictionaries.map(d=>[d.version,d]));
      const incoming=snapshot.levels.map(e=>refreshWorkbookEntry({level:e.level,dictionary:dictionaries.get(e.dictionaryVersion)}));
      for(const entry of incoming)createAlgorithmSession(entry.level,entry.dictionary);
      let count=0;for(const entry of incoming)if(rememberWeb(entry))count++;
      $('sequence-storage-note').textContent=`已导入 ${count} 关，按词库分别加入关序。`;saveSequence();
    }catch(e){inform('sequence-storage-note',e);}finally{$('sequence-file').value='';}
  };
  openSequenceStorage().then(async store=>{
    if(dataResetting){store?.close();return;}
    sequenceStore=store;const snapshot=await store?.load();
    if(snapshot){const loaded=new LevelSequence(),restored=loaded.restore(snapshot,createAlgorithmSession,{migrateEntry:refreshWorkbookEntry});for(const entry of [...sequence.groups.values()].flat())loaded.insert(entry);sequence=loaded;renderWebLibrary();if(restored.rejected)$('sequence-storage-note').textContent=`已清理 ${restored.rejected} 个失效的历史关卡。`;}
    sequenceLoaded=true;syncSimulationAvailability();scheduleSequenceSave();
  }).catch(()=>{sequenceLoaded=true;syncSimulationAvailability();$('sequence-storage-note').textContent='本次关序保留在页面内，请导出 JSON。';});

  async function loadZen(){throw new Error('Zen 原包关卡库未包含在此发布版本中。');}
  async function chooseSource(source,position=1,order='main',language='english'){
    pausePersonal();const request=++sourceRequest;sourceChanging=true;$('play-source').disabled=true;finishHuman('interrupted');stopMachine();closeCompletion();
    try{
      if(source==='zen'){const next=await loadZen(position);if(request!==sourceRequest)return;zenSession=next;activeSource='zen';$('zen-position').value=position;renderZen();}
      else if(source==='wordtiles'){await ensureOriginalData();if(request!==sourceRequest)return;if(!await hooks.useWordTiles(position,order,language))throw new Error('原包关卡未能载入');if(request!==sourceRequest)return;activeSource='wordtiles';}
      else {if(!await hooks.useGenerated())throw new Error('随机关卡生成失败，请重试');if(request!==sourceRequest)return;activeSource='web';}
      $('source-change-status').textContent='';syncView();return true;
    }catch(e){inform('source-change-status',e);inform('sim-status',e);inform('zen-status',e);inform('complete-status',e);$('play-source').value=activeSource;return false;}
    finally{if(request===sourceRequest){sourceChanging=false;$('play-source').disabled=false;syncView();}}
  }
  $('play-source').onchange=()=>chooseSource($('play-source').value);$('play-bank').onchange=()=>chooseSource('zen',1);$('zen-load').onclick=()=>chooseSource('zen',Number($('zen-position').value));
  async function chooseSimulationSource(source,order='level_list_0'){
    if(sourceChanging||machineRunning()||dataResetting)return;
    $('sim-source-status').textContent='正在载入关卡…';
    const loaded=await chooseSource(source,1,order);
    if(loaded){$('sim-source-status').textContent='';if(source==='wordtiles')$('sim-scope').value='range';displayedMachineResult=undefined;syncSimulationAvailability();updateMachineResult();}
    else $('sim-source-status').textContent=$('source-change-status').textContent||'关卡未能载入，当前关卡保留。';
  }
  $('sim-source').onchange=()=>chooseSimulationSource($('sim-source').value);
  $('sim-bank').onchange=()=>chooseSimulationSource('wordtiles',$('sim-bank').value);
  $('zen-prev').onclick=()=>chooseSource('zen',Number($('zen-position').value)-1);$('zen-next').onclick=()=>chooseSource('zen',Number($('zen-position').value)+1);
  function renderZen(){if(!zenSession)return;const l=zenSession.level;$('zen-status').textContent=`${sourceName()} · 第 ${l.source.position} / 1000 关`;$('zen-play-label').textContent=`${sourceName()} · ${l.source.position}`;$('zen-play-progress').textContent=`目标 ${zenSession.completedCount}/${zenSession.targetCount} · 额外词 ${zenSession.bonusCompleted.size}`;
    $('zen-play-targets').replaceChildren(...l.targets.map((word,i)=>({word,i})).sort((a,b)=>a.word.length-b.word.length).map(({word,i})=>{const s=document.createElement('span');const done=zenSession.completedIndices.has(i);s.className='zen-answer'+(done?' solved':'');s.textContent=done?word:[...word].map(()=> '□').join(' ');return s;}));
    $('zen-play-pool').replaceChildren(...[...zenSession.pool].map(letter=>{const b=document.createElement('button');b.type='button';b.textContent=letter;b.disabled=zenSession.status!=='playing'||!canPlay();b.onclick=()=>{if(!canPlay())return;$('zen-play-input').value+=letter;b.disabled=true;};return b;}));
    $('zen-word-roles').replaceChildren(...[['目标词',l.targets],['额外词',l.wordRoles.extra],['仅额外词',l.wordRoles.onlyExtra],['奖励名单',l.wordRoles.bonus]].map(([label,words])=>{const p=document.createElement('p');p.textContent=label+'：'+(words.join(' / ')||'无');return p;}));$('zen-play-hint').disabled=zenSession.status!=='playing';
    $('zen-play-input').disabled=!canPlay();$('zen-play-form').querySelector('button').disabled=!canPlay();$('zen-play-hint').disabled=!canPlay();syncTime();updateInformation();showCompletion();
  }
  function recordSubmit(value,result,session=hooks.getGame()){if(session!==current())return;tracker(session).submit(value,result);if(session.initial.kind==='zen')hooks.collectWord(result,session.initial.source.language,'zen');if(recorder?.session===session){recorder.submit(value,result);if(session.status==='won')finishHuman('won');}updateInformation();}
  function recordHint(hint,session=hooks.getGame()){if(!hint||session!==current())return;tracker(session).useHint();if(recorder?.session===session){recorder.hint(hint);if(session.status==='won')finishHuman('won');}updateSessionInformation();}
  $('zen-play-form').onsubmit=e=>{e.preventDefault();if(!zenSession||!canPlay())return;const value=$('zen-play-input').value,result=zenSession.submit(value);recordSubmit(value,result,zenSession);$('zen-play-feedback').textContent=result.accepted?`找到 ${result.word}`:result.reason==='extra-word'?`${result.word} 已记录为额外词`:'这个词不在本关名单中';$('zen-play-input').value='';renderZen();};
  $('zen-play-clear').onclick=()=>{$('zen-play-input').value='';renderZen();};$('zen-play-input').oninput=()=>{for(const b of $('zen-play-pool').children)b.disabled=zenSession.status!=='playing';};
  $('zen-play-hint').onclick=()=>{if(!zenSession||machineRunning())return;const hint=zenSession.hint();recordHint(hint,zenSession);$('zen-play-feedback').textContent=hint?'提示：'+hint.word:'';};
  function resetCurrent(){pausePersonal();finishHuman('interrupted');closeCompletion();if(activeSource==='zen'){zenSession=new ZenSession(zenSession.level);$('zen-play-input').value='';$('zen-play-feedback').textContent='';renderZen();}else hooks.resetCurrent();syncView();}
  $('zen-play-reset').onclick=()=>{stopMachine();resetCurrent();};
  async function nextLevel(){const previous=current();closeCompletion();let loaded;if(activeSource==='zen')loaded=await chooseSource('zen',zenSession.level.source.position<1000?zenSession.level.source.position+1:1);else if(activeSource==='wordtiles')loaded=await hooks.nextWordTiles();else{const list=webHistory(),entry=previous?.dictionary?sequence.find(previous.initial,previous.dictionary):null,index=list.indexOf(entry);if(index>=0&&index+1<list.length){loadSequenceEntry(list[index+1]);loaded=true;}else loaded=await chooseSource('web');}syncView();if(!loaded&&previous===current()&&previous?.status==='won'){$('complete-status').textContent='下一关未能载入，请重试。';openCompletion();}}
  $('sim-next').onclick=nextLevel;
  function showCompletion(){const session=current();if(!$('lobby').hidden||!session||session.status!=='won'||completedShown.has(session)||hooks.isTargetAnimationRunning?.())return;const s=tracker(session).snapshot();if(machineRunning()||s.timeKind==='virtual')return;completedShown.add(session);const count=session.targetCount??session.initial.targets.length;$('level-complete-title').textContent='本关完成';$('level-complete-summary').textContent=inPlayer()?`${session.victoryReason==='empty-grid'?'棋盘已清空':count+' 个目标全部完成'}，继续下一关吧！`:`${session.victoryReason==='empty-grid'?'棋盘清空兜底 · 已完成 '+session.completed.size+'/'+count+' 词':count+' 个目标全部完成'} · ${fmt(s.elapsedSeconds)} 秒 · ${s.mistakes} 次错误`;$('complete-status').textContent='';$('complete-next').disabled=false;openCompletion();}
  $('complete-next').onclick=async()=>{$('complete-next').disabled=true;try{await nextLevel();}finally{$('complete-next').disabled=false;}};
  $('complete-reward').onclick=()=>{$('complete-status').textContent='视频奖励暂未开放';};
  function updateSimulationRangeRow(job,status){
    if(job.scope!=='range'||job.activeIndex<0)return;
    const index=job.activeIndex,entry=job.entries[index],summary=machineResults.getDisplay(job.sessions[index])?.summary;
    let row=job.rows.get(index);
    if(!row){row=document.createElement('tr');job.rows.set(index,row);row.onclick=()=>entry.level.algorithm===1?chooseSource('wordtiles',entry.number,entry.level.source.order):loadSequenceEntry(entry);$('sim-range-results').append(row);}
    const number=value=>value==null?'—':fmt(value),values=[`#${entry.number}${entry.level.source?.original?' · ID '+entry.level.source.original.id:''}`,`${summary?.samples||0} / ${summary?.attempted||0}`,number(summary?.meanMistakes),number(summary?.medianWinSeconds),number(summary?.meanTrialSwipes),{running:'试玩中',complete:'已完成',cancelled:'已取消',failed:'中断'}[status]];
    row.replaceChildren(...values.map(value=>{const cell=document.createElement('td');cell.textContent=value;return cell;}));
  }
  function updateSimulationRangeResult(job,status){
    if(job.scope!=='range')return;
    simulationRangeReport.result={kind:'range',status,sourceLabel:job.sourceLabel,start:job.entries[0].number,end:job.entries.at(-1).number,processed:job.processed,levelCount:job.entries.length,requested:job.entries.length*job.repeats,summary:job.totals.snapshot()};
  }
  function finishSimulationBatch(job,status,message=''){
    if(simulationBatch!==job)return;
    job.worker?.terminate();simulationBatch=null;
    if(job.activeIndex>=0&&!job.activeDone){
      machineResults.setBatch(job.sessions[job.activeIndex],{requested:job.repeats,runs:job.runs,status});
      updateSimulationRangeRow(job,status);
    }
    updateSimulationRangeResult(job,status);
    syncSimulationAvailability();updateSessionInformation();
    if(message)$('sim-status').textContent+=' · '+message;
    if(!dataResetting){if(activeSource==='zen')renderZen();else hooks.render();}
  }
  $('sim-batch-start').onclick=()=>{
    if(!frequency||simulationUnavailable()||machineRunning()||sourceChanging||dataResetting)return;
    let job;
    try{
      const repeats=Number($('sim-repeats').value);
      if(!Number.isSafeInteger(repeats)||repeats<1||repeats>1000)throw new Error('批量试玩次数请填写 1～1000 的整数');
      const scope=$('sim-scope').value;
      if(scope==='range'&&(activeSource==='wordtiles'?!sourceBank:!sequenceLoaded))throw new Error('关卡列表正在读取，请稍后开始');
      if(scope==='range')checkSimulationRange(Number($('sim-range-start').value),Number($('sim-range-end').value),repeats);
      const rangeEntries=activeSource==='wordtiles'?originalList().map((id,index)=>({id,number:index+1})):webHistory();
      const selected=scope==='range'?selectSimulationRange(rangeEntries,Number($('sim-range-start').value),Number($('sim-range-end').value),repeats).map(entry=>entry.level?entry:{number:entry.number,level:convertWTLevel(sourceBank.levels[entry.id],{order:current().initial.source.order,bank:current().initial.source.order,position:entry.number,sha256:sourceCatalogue.sha256})}):[{level:current().exportInitial||current().initial,dictionary:current().dictionary,number:current().initial.source?.editorNumber??current().initial.source?.position}];
      const entries=selected.map(entry=>({level:structuredClone(entry.level),dictionary:entry.dictionary,number:entry.number}));
      const runProfile=profileForRun();
      finishHuman('interrupted');resetCurrent();
      job={scope,sourceLabel:activeSource==='wordtiles'?'WT 1.4.0 · '+$('sim-bank').selectedOptions[0].textContent:'WT词库.xlsx 生成关卡',entries,sessions:entries.map(entry=>({exportInitial:entry.level,dictionary:entry.dictionary})),repeats,runs:[],worker:null,activeIndex:0,activeDone:false,processed:0,totals:new SimulationTotals(),rows:new Map()};simulationBatch=job;
      if(scope==='range'){simulationRangeReport={result:null};$('sim-range-results').replaceChildren();$('sim-range-details').open=true;}
      machineResults.setBatch(job.sessions[0],{requested:repeats,runs:job.runs,status:'running'});updateSimulationRangeResult(job,'running');updateSimulationRangeRow(job,'running');
      syncSimulationAvailability();updateSessionInformation();hooks.render();
      const worker=new Worker('./simulation-batch.worker.js?v=48',{type:'module'});job.worker=worker;
      worker.onmessage=({data})=>{
        if(simulationBatch!==job)return;
        if(data.type==='level-start'){
          job.activeIndex=data.index;job.runs=[];job.activeDone=false;
          machineResults.setBatch(job.sessions[data.index],{requested:repeats,runs:job.runs,status:'running'});updateSimulationRangeRow(job,'running');
        }else if(data.type==='run'){
          job.runs.push(data.summary);job.totals.add(data.summary);
          machineResults.setBatch(job.sessions[data.index],{requested:repeats,runs:job.runs,status:'running'});
          updateSimulationRangeResult(job,'running');updateSimulationRangeRow(job,'running');updateMachineResult();
        }else if(data.type==='level-done'){
          job.activeDone=true;job.processed++;
          machineResults.setBatch(job.sessions[data.index],{requested:repeats,runs:job.runs,status:'complete'});
          updateSimulationRangeResult(job,'running');updateSimulationRangeRow(job,'complete');updateMachineResult();
        }else if(data.type==='done')finishSimulationBatch(job,'complete');
        else if(data.type==='error')finishSimulationBatch(job,'failed',data.message);
      };
      worker.onerror=event=>finishSimulationBatch(job,'failed',event.message||'运行失败');
      worker.postMessage({entries,profile:runProfile,repeats});
    }catch(error){if(job&&simulationBatch===job)finishSimulationBatch(job,'failed',error.message);else inform('sim-status',error);}
  };
  $('sim-batch-stop').onclick=()=>{if(simulationBatch)finishSimulationBatch(simulationBatch,'cancelled');};
  $('human-start').onclick=()=>{try{stopMachine();resetCurrent();const participant=$('human-participant').value.trim();if(!participant)throw new Error('请填写测试者代号');tracker().start();recorder=new HumanRecorder(current(),{participant,audience:$('human-audience').value});$('human-status').textContent='真人记录中，开始连词即可。';$('human-finish').disabled=false;syncTime();if(activeSource==='zen')renderZen();else hooks.render();}catch(e){inform('human-status',e);}};
  $('human-finish').onclick=()=>{finishHuman(current()?.status==='won'?'won':'gave-up');tracker()?.end();if(activeSource==='zen')renderZen();else hooks.render();};
  function updateRecordSummary(){$('record-summary').textContent=`已保存 ${records.length} 局真人记录。`;const rate=Number((profile.knowledgeRate*100).toFixed(2));$('profile-status').textContent=profile.status==='observational-calibration'?`思考时间与错误率已用 ${profile.calibration?.participants||0} 人的记录调整；认识率 ${rate}% 为手动设定，空间识别仍为工程估计。`:`英语模型：目标词认识率 ${rate}%；小关随机取整，多局平均接近设定比例。空间识别尚未真人验证。`;}
  $('human-export').onclick=()=>{if(recorder)finishHuman('interrupted');downloadFile(JSON.stringify({schemaVersion:1,records},null,2),'英语真人试玩记录.json');};$('human-import').onclick=()=>$('human-file').click();
  $('human-file').onchange=async()=>{try{const f=$('human-file').files[0];if(!f)return;if(f.size>20*1024*1024)throw new Error('记录文件超过20MiB');records=mergeHumanRecords(records,JSON.parse(await f.text()));try{storage?.setItem(RECORD_KEY,JSON.stringify(records));}catch{}updateRecordSummary();}catch(e){inform('calibration-status',e);}finally{$('human-file').value='';}};
  $('human-calibrate').onclick=()=>{const result=calibrateEnglish(records,profile);$('calibration-status').textContent=result.message;if(result.ok){profile=result.profile;try{storage?.setItem(PROFILE_KEY,JSON.stringify(profile));}catch{}updateRecordSummary();}};

  function selectedBanks(){
    if($('batch-game').value==='wordtiles')return sourceCatalogue?.languages.find(item=>item.language==='english')?.lists.filter(list=>list.key===sourceCatalogue.defaultOrder)||[];
    return [{key:$('batch-game').value==='uploaded'?'uploaded':'fresh'}];
  }
  function updateBatchRange({reset=false}={}){
    const game=$('batch-game').value,limit=game==='uploaded'?uploadedBatch?.count||0:game==='wordtiles'?selectedBanks()[0]?.count||0:10000;
    $('batch-start').max=limit||1;$('batch-end').max=limit||1;
    if(reset){$('batch-start').value=1;$('batch-end').value=Math.min(30,limit||1);}
    if(game==='web'){
      const settings=hooks.generationSettings();$('batch-range-note').textContent=`按当前配置生成 · ${settings.config.cols}×${settings.config.rows} · ${BANK_NAMES[settings.dictionary?.metadata?.origin]||'当前词库'}`;
    }else if(game==='uploaded')$('batch-range-note').textContent=uploadedBatch?`${uploadedBatch.name} · ${limit} 关 · 文件序号 1～${limit}`:'请先上传关卡 JSON。';
    else $('batch-range-note').textContent=`WT 1.4.0 英文主线 · 关卡序号 1～${limit}`;
  }
  function syncBatchControls(){
    const busy=!!batchWorker||!!batchUploadJob||dataResetting,game=$('batch-game').value;
    for(const input of $('batch-form').querySelectorAll('input,select,button'))input.disabled=busy;
    $('batch-run').disabled=busy||batchSourceLoading||!frequency||(game==='uploaded'&&!uploadedBatch)||(game==='wordtiles'&&!selectedBanks().length);
    $('batch-cancel').disabled=!batchWorker&&!batchUploadJob;
    syncKnowledgeControls();
  }
  async function updateBatchLists(){
    const game=$('batch-game').value,request=++batchSourceRequest;batchSourceLoading=true;syncBatchControls();
    try{if(game==='wordtiles')await ensureOriginalData();if(request!==batchSourceRequest||dataResetting)return;
      $('batch-language').value='english';updateBatchRange({reset:true});
    }catch(error){if(request===batchSourceRequest)inform('batch-status',error);}
    finally{if(request===batchSourceRequest){batchSourceLoading=false;syncBatchControls();}}
  }
  $('batch-game').onchange=updateBatchLists;
  function finishBatchUpload(job,message){
    if(batchUploadJob!==job)return;
    job.worker?.terminate();batchUploadJob=null;syncBatchControls();
    if(!dataResetting)$('batch-status').textContent=message;
  }
  $('batch-upload').onclick=()=>$('batch-upload-file').click();
  $('batch-upload-file').onchange=async()=>{
    const file=$('batch-upload-file').files[0];$('batch-upload-file').value='';
    if(!file||batchWorker||batchUploadJob||dataResetting)return;
    if(file.size>MAX_PLAYTEST_UPLOAD_BYTES){$('batch-status').textContent='上传失败：关卡 JSON 不能超过 20 MB。';return;}
    const job={worker:null,name:file.name};batchUploadJob=job;batchSourceRequest++;batchSourceLoading=false;syncBatchControls();
    $('batch-status').textContent='正在读取并校验 '+file.name+'…';
    try{
      const text=await file.text();if(batchUploadJob!==job||dataResetting)return;
      const worker=new Worker('./playtest-import.worker.js?v=47',{type:'module'});job.worker=worker;
      worker.onmessage=({data})=>{
        if(batchUploadJob!==job||dataResetting)return;
        if(data.type==='progress')$('batch-status').textContent=`正在校验 ${file.name} · ${data.processed}/${data.total} 关`;
        else if(data.type==='done'){
          uploadedBatch={name:file.name,entries:data.entries,count:data.count,format:data.format};
          const option=$('batch-game').querySelector('[value="uploaded"]');option.disabled=false;option.textContent='上传：'+file.name;$('batch-game').value='uploaded';
          updateBatchRange({reset:true});finishBatchUpload(job,`已载入 ${file.name}，共 ${data.count} 关。填写起止序号后开始反跑。`);
        }else if(data.type==='error')finishBatchUpload(job,'上传失败：'+data.message+'。原来源保留。');
      };
      worker.onerror=event=>finishBatchUpload(job,'上传失败：'+(event.message||'校验中断')+'。原来源保留。');
      worker.postMessage({text,dictionary:hooks.getDictionary()});
    }catch(error){finishBatchUpload(job,'上传失败：'+error.message+'。原来源保留。');}
  };
  function updateBatchAverages(){const runs=report?.runs||[];$('batch-averages-panel').hidden=!runs.length;$('batch-averages').replaceChildren(...averageMetrics(summarizeRuns(runs)).map(([label,value])=>metric(label,value)));}
  $('batch-runs').onchange=()=>{if(report)report.job.includeRuns=$('batch-runs').checked;};
  function endBatch(status,message){batchWorker?.terminate();batchWorker=null;if(report)report.status=status;updateBatchAverages();$('batch-status').textContent=message;$('batch-xlsx').disabled=!report?.levels.length;$('batch-json').disabled=!report?.levels.length;syncBatchControls();}
  async function inspectResult(row){
    if(row.uploadedIndex&&reportUploadedEntries){const entry=reportUploadedEntries[row.uploadedIndex-1];if(entry?.originalOrder)return chooseSource('wordtiles',entry.originalPosition,entry.originalOrder,'english');if(entry)return loadSequenceEntry(entry);}
    if(row.game==='Zen Word'){$('play-bank').value=row.bank;await chooseSource('zen',row.position);}else if(row.game==='Word Tiles')await chooseSource('wordtiles',row.position,row.bank,row.language);else{const e=[...sequence.groups.values()].flat().find(e=>e.level.id===row.id||(!e.level.id&&String(e.level.seed)===String(row.id)));if(e)loadSequenceEntry(e);}
  }
  $('batch-run').onclick=()=>{if(batchWorker||batchUploadJob||batchSourceLoading||dataResetting)return;try{const game=$('batch-game').value,language='english',start=Number($('batch-start').value),end=Number($('batch-end').value),repeats=Number($('batch-repeats').value),banks=selectedBanks(),limit=Number($('batch-end').max);
      if(!banks.length||![start,end,repeats].every(Number.isSafeInteger)||start<1||end<start||end>limit||repeats<1||repeats>1000||(game==='uploaded'&&!uploadedBatch))throw new Error('请检查关卡范围与每关试玩局数');if((end-start+1)*repeats>200000)throw new Error('每批最多200,000局，请缩小范围');
      const generation=game==='web'?hooks.generationSettings():{},job={game,language,banks,start,end,repeats,mode:'ordinary',order:banks[0].key,profile:profileForRun(),includeWords:$('batch-words').checked,includeRuns:$('batch-runs').checked,
        randomization:'system',dictionary:generation.dictionary,generationBudget:generation.budget,generationConfig:generation.config,generationEngine:generation.engine,
        uploadedLevels:game==='uploaded'?uploadedBatch.entries:undefined,uploadedSource:game==='uploaded'?{name:uploadedBatch.name,count:uploadedBatch.count,format:uploadedBatch.format}:undefined,
        sourceSha256:game==='wordtiles'?sourceCatalogue.sha256:null};
      reportUploadedEntries=job.uploadedLevels;
      report={job:{...job,dictionary:job.dictionary?{version:job.dictionary.version,metadata:job.dictionary.metadata}:undefined,uploadedLevels:undefined},requested:end-start+1,status:'running',frequencyVersion:frequency.version,createdAt:new Date().toISOString(),levels:[],runs:[],words:[]};$('batch-results').replaceChildren();updateBatchAverages();$('batch-progress').max=report.requested;$('batch-progress').value=0;$('batch-xlsx').disabled=true;$('batch-json').disabled=true;$('batch-status').textContent='正在反跑…';
      const instance=new Worker('./playtest.worker.js?v=47',{type:'module'});batchWorker=instance;instance.onmessage=({data})=>{if(batchWorker!==instance||dataResetting)return;if(data.type==='level'){report.levels.push(data.row);report.runs.push(...data.runs);report.words.push(...data.words);updateBatchAverages();if(data.generated)rememberWeb(data.generated);$('batch-progress').value=data.processed;
          const row=document.createElement('tr');for(const text of [data.row.position,data.row.targetCount??'—',targetLengthRatio(data.row.wordLengths)??'—',data.row.error?'失败':fmt(data.row.meanTrialSwipes),fmt(data.row.meanMistakes),data.row.medianWinSeconds==null?'—':fmt(data.row.medianWinSeconds),data.row.spatialApplicable?[data.row.reverseMajorityTargets,data.row.spatialMultiTurnTargets,data.row.hardToSpotTargets].join(' / '):'—']){const td=document.createElement('td');td.textContent=text;row.append(td);}if(data.row.error)row.title=data.row.error;row.onclick=()=>inspectResult(data.row).catch(e=>inform('batch-status',e));$('batch-results').append(row);$('batch-status').textContent=`已处理 ${data.processed}/${report.requested} 关 · ${report.runs.length} 局`;}
        else if(data.type==='done')endBatch('complete',`反跑完成：${data.processed}关、${report.runs.length}局。`);else if(data.type==='error')endBatch('failed','反跑失败：'+data.message);};instance.onerror=e=>{if(batchWorker===instance)endBatch('failed','运行失败：'+e.message);};syncBatchControls();instance.postMessage(job);
    }catch(e){inform('batch-status',e);}};
  $('batch-cancel').onclick=()=>{if(batchUploadJob)finishBatchUpload(batchUploadJob,'已取消上传校验，原来源保留。');else if(batchWorker)endBatch('cancelled',`已取消，保留已处理的${report?.levels.length||0}关。`);};
  $('batch-xlsx').onclick=()=>{try{downloadFile(exportAnalysisXlsx(report),'关卡反跑分析.xlsx',XLSX_MIME);$('batch-status').textContent=`已生成 Excel：${report.levels.length} 关、${report.runs.length} 局，含试探与排布识别指标。`;}catch(e){inform('batch-status',e);}};$('batch-json').onclick=()=>downloadFile(exportAnalysisJson(report),'关卡反跑分析.json');
  qualityPanel=mountLevelQuality({getGame:current,getSettings:hooks.generationSettings,applyTemplate:hooks.applyQualityTemplate,loadCandidate:loadSequenceEntry});
  window.addEventListener('pagehide',()=>{pausePersonal();clearInterval(clock);finishHuman('interrupted');stopMachine();batchWorker?.terminate();batchUploadJob?.worker?.terminate();batchUploadJob=null;bulkWorker?.terminate();qualityPanel?.dispose();saveSequence();});updateRecordSummary();
  $('batch-run').disabled=false;updateBatchLists();$('sim-status').textContent='填写次数后开始批量试玩。';$('batch-status').textContent='选择关卡来源和范围，完成后可导出 Excel / JSON。';$('zen-load').disabled=true;syncView();
  return {get machineRunning(){return machineRunning();},get bulkRunning(){return !!bulkWorker;},get canPlay(){return canPlay();},startPlayer,getQualitySettings:()=>qualityPanel.getSettings(),setQualityBusy:value=>qualityPanel.setGenerationBusy(value),qualityGenerated:(result,dictionary)=>qualityPanel.generationResult(result,dictionary),recordSubmit,recordHint,changeTab,continueJourney:()=>current()?.status==='won'?nextLevel():true,dictionaryChanged(){renderWebLibrary();updateInformation();updateBatchRange();},
    prepareDataReset(){dataResetting=true;qualityPanel?.dispose();sourceRequest++;batchSourceRequest++;clearInterval(clock);clearTimeout(sequenceSaveTimer);recorder=null;simulationBatch?.worker?.terminate();simulationBatch=null;simulationRangeReport=null;machineResults.clear();batchWorker?.terminate();batchUploadJob?.worker?.terminate();batchUploadJob=null;uploadedBatch=null;reportUploadedEntries=null;bulkWorker?.terminate();batchWorker=null;bulkWorker=null;sequenceStore?.close();sequenceStore=null;sequenceLoaded=false;},
    gameChanging(){finishHuman('interrupted');stopMachine();const session=hooks.getGame();trackers.get(session)?.pause();recordPersonal(session,true);closeCompletion();},
    gameChanged(){const g=hooks.getGame();if(g?.initial.algorithm===1&&!sourceBank)ensureOriginalData().then(()=>syncSimulationAvailability()).catch(error=>inform('source-change-status',error));if(!sourceChanging&&activeSource!=='zen')activeSource=g?.initial.algorithm===1?'wordtiles':'web';if(g?.exportInitial&&g.initial.algorithm!==1)rememberWeb({level:g.exportInitial,dictionary:g.dictionary});if(inPlayer()&&g?.status==='playing')tracker(g).start();syncView();if(inPlayer())hooks.render();},
    gameUpdated(){updateInformation();showCompletion();},getReport(){return report;},getBulkReport(){return bulkReport;}};
}
