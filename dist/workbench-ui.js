import {SimulationRun,DEFAULT_PROFILE,normalizeProfile} from './core/playtest.js?v=29';
import {HumanRecorder,RECORD_KEY,PROFILE_KEY,mergeHumanRecords,calibrateEnglish} from './core/playtest-records.js?v=29';
import {ZenSession} from './core/zen-levels.js?v=17';
import {levelMetrics,SessionMetrics} from './core/playtest-metrics.js?v=29';
import {MachinePlaytestResults} from './core/machine-playtest-results.js?v=32';
import {spatialLevelMetrics} from './core/spatial-perception.js?v=30';
import {exportAnalysisXlsx,downloadFile,XLSX_MIME} from './core/playtest-export.js?v=29';
import {LANGUAGE_NAMES} from './core/source-levels.js?v=15';
import {BANK_NAMES} from './core/dictionary-banks.js?v=23';
import {LevelSequence,levelFingerprint,openSequenceStorage} from './core/level-sequence.js?v=25';
import {createAlgorithmSession} from './core/algorithm-v1-adapter.js?v=21';
import {mountBatchGenerationDialog} from './batch-generation-ui.js?v=28';
import {mountLevelEditor} from './level-edit-ui.js?v=21';
import {ENGLISH_FREQUENCY} from './core/playtest-frequency.js?v=34';

const $=id=>document.getElementById(id),fmt=n=>n==null?'不适用':Number(n).toFixed(1),pct=n=>n==null?'—':(n*100).toFixed(1)+'%';
const BANKS=[{key:'main-en-us_t1',label:'主线 T1',file:'main-en-us_t1.json',count:1000},{key:'main-en-us_t3',label:'主线 T3',file:'main-en-us_t3.json',count:1000}];
async function json(url){const response=await fetch(url);if(!response.ok)throw new Error('数据读取失败');return response.json();}
function options(select,items){select.replaceChildren(...items.map(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;}));}
function metric(label,value,help=''){const row=document.createElement('div');row.className='metric-row';const title=document.createElement('span'),number=document.createElement('strong');title.textContent=label;number.textContent=value;row.append(title,number);if(help)row.title=help;return row;}

export function mountPlaytestLab(hooks) {
  const editor=$('editor-panel'),workspace=document.querySelector('.workspace'),shell=$('game-screen'),heading=editor.querySelector('.editor-heading');
  const header=document.createElement('header');header.className='workbench-header';header.append(heading);shell.prepend(header);
  heading.querySelector('.algorithm-field').hidden=true;$('editor-close').hidden=true;
  const nav=document.createElement('nav');nav.className='lab-tabs';nav.setAttribute('aria-label','编辑器工作区');nav.innerHTML='<button type="button" data-lab-tab="edit" aria-pressed="true">编辑关卡</button><button type="button" data-lab-tab="simulate" aria-pressed="false">模拟试玩</button><button type="button" data-lab-tab="batch" aria-pressed="false">反跑关卡</button>';header.append(nav);
  const sourceControl=document.createElement('div');sourceControl.className='workbench-source';sourceControl.innerHTML='<label>当前试玩<select id="play-source"><option value="web">网页生成关卡</option><option value="wordtiles">Word Tiles 原包</option></select></label><label id="play-bank-field" hidden>主线<select id="play-bank"><option value="main-en-us_t1">T1</option><option value="main-en-us_t3">T3</option></select></label><button id="info-open" type="button">关卡信息</button><button id="controls-open" type="button">配置</button>';header.append(sourceControl);
  const information=document.createElement('aside');information.id='level-info-panel';information.className='level-info-panel';information.setAttribute('aria-label','关卡信息');information.innerHTML='<div class="info-heading"><h2>关卡信息</h2><button id="info-close" type="button" aria-label="关闭关卡信息">×</button></div><div id="level-size-card" class="level-size-card"></div><h3>词汇组成 · 目标 / 额外</h3><div id="word-length-metrics" class="metric-cards"></div><div id="word-ratio-metrics" class="metric-list"></div><h3>路径与格子</h3><div id="path-metrics" class="metric-list"></div><p id="path-metric-note" class="metric-note"></p>';workspace.prepend(information);
  const perception=document.createElement('section');perception.className='perception-section';perception.innerHTML='<h3>排布识别</h3><div id="perception-metrics" class="metric-list"></div><details><summary>逐词排布与推进校正</summary><div class="lab-table-scroll"><table class="lab-results"><thead><tr><th>目标词</th><th>拐弯</th><th>反向步</th><th>外圈格</th><th>原识别估计</th><th>校正后识别估计</th><th>分差</th><th>半数外露覆盖</th><th>半数外露回合</th><th>同字干扰减少</th></tr></thead><tbody id="perception-words"></tbody></table></div></details><p class="metric-note">原识别估计保留不变。校正分用128次推进模拟，按80%目标词已认识；共享格用尽后才打开，外围生词仍作阻挡，封闭内洞不算外露，同字干扰随格子耗尽重新计算。半数外露回合越小代表越早变得可见；覆盖率表示该词在多少次认识样本中达到过半外露。工程模型尚未经真人校准。</p>';information.append(perception);
  const attemptMetrics=document.createElement('div');attemptMetrics.className='metric-list current-attempt-metrics';
  const errorMetric=metric('本关错误尝试次数','未模拟','仅统计本关最近一次有效机器试玩的无效提交；额外词和重复已完成词不计。真人试玩不影响此数据。');errorMetric.querySelector('strong').id='current-error-count';
  const attemptSource=metric('统计来源','机器试玩');attemptSource.querySelector('strong').id='current-attempt-source';attemptMetrics.append(errorMetric,attemptSource);$('level-size-card').after(attemptMetrics);
  const existing=document.createElement('div');existing.id='editor-edit-workspace';for(const child of [...editor.children])existing.append(child);const configHeading=document.createElement('h2');configHeading.className='config-heading';configHeading.textContent='关卡配置';existing.prepend(configHeading);editor.append(existing);
  const shape=document.createElement('section');shape.id='generation-shape';shape.className='generation-shape';shape.innerHTML='<h3>棋盘与目标</h3><p id="shape-mode-note" class="metric-note" hidden></p>';
  shape.append(document.querySelector('[data-settings-pane="board"] .field-grid'));
  const targetCount=document.createElement('label');targetCount.innerHTML='目标词数量<input id="generation-target-count" type="number" min="1" max="16" step="1" value="5">';shape.querySelector('.field-grid').append(targetCount);shape.querySelector('.field-grid').classList.add('shape-size-grid');
  const lengths=document.createElement('div');lengths.className='shape-lengths';lengths.innerHTML='<div class="shape-ratios"><label>三字词比例<div class="ratio-input"><input id="generation-three-percent" type="number" min="0" max="100" step="1" value="30"><span>%</span></div></label><label>四字词比例<div class="ratio-input"><input id="generation-four-percent" type="number" min="0" max="100" step="1" value="30"><span>%</span></div></label></div><p id="composition-note" class="metric-note">其余词长随机补齐</p><p id="shape-status" class="metric-note" aria-live="polite"></p><div hidden><input id="generation-auto-lengths" type="checkbox" checked><input id="generation-lengths" type="text"></div>';shape.append(lengths);existing.insertBefore(shape,$('generation-section'));
  const engineField=document.createElement('label');engineField.hidden=true;engineField.innerHTML='<select id="generation-engine"><option value="flexible">可调棋盘回溯</option></select>';$('generation-section').insertBefore(engineField,$('generate'));
  const bulk=document.createElement('section');bulk.id='bulk-generation';bulk.className='bulk-generation';bulk.innerHTML='<h3>批量生成关卡</h3><p class="metric-note">设置起始关号、难度曲线、目标词数和多种棋盘规格，再插入对应词库的关序。</p><button id="bulk-open" class="bulk-open-button" type="button">配置批量生成</button><div class="lab-actions"><button id="bulk-stop" type="button" hidden>中止生成</button><button id="bulk-export" type="button" disabled>导出本批 JSON</button></div><progress id="bulk-progress" value="0" max="1" aria-label="批量生成进度"></progress><p id="bulk-status" class="metric-note" role="status">关卡生成后可逐关试玩、编辑和反跑分析。</p>';$('generation-section').after(bulk);
  const nativeBulk=document.createElement('button');nativeBulk.id='wt-bulk-entry';nativeBulk.type='button';nativeBulk.className='native-bulk-entry';nativeBulk.textContent='使用 WT 英语词库批量生成新关卡';$('source-controls').append(nativeBulk);
  $('level-statistics').hidden=true;existing.querySelector('.seed-field').hidden=true;
  const mobileClose=document.createElement('button');mobileClose.id='workbench-mobile-close';mobileClose.type='button';mobileClose.textContent='关闭配置';editor.prepend(mobileClose);
  const areas=document.createElement('div');areas.className='lab-areas';areas.innerHTML=`
    <section id="lab-zen-settings" class="lab-pane" hidden><h2>Zen 主线配置</h2><p class="lab-description">在上方选择 T1 或 T3，按原始编号载入。原包使用字母池，字母数量与词长随关卡自动适配。</p><label>关卡序号<input id="zen-position" type="number" min="1" max="1000" step="1" value="1"></label><div class="lab-actions"><button id="zen-prev" type="button">上一关</button><button id="zen-load" class="lab-primary" type="button" disabled>载入关卡</button><button id="zen-next" type="button">下一关</button></div><p id="zen-status" role="status">正在读取关卡库…</p><details><summary>本关词汇名单</summary><div id="zen-word-roles"></div></details></section>
    <section id="lab-simulate" class="lab-pane" hidden><h2>模拟试玩</h2><p class="lab-description">机器试玩结果显示在下方。</p>
      <div class="lab-field-grid"><div class="simulation-strategy"><span>试玩策略</span><strong>普通英语休闲玩家</strong></div><label id="sim-hints-field">最多提示（次）<input id="sim-hints" type="number" min="0" max="18" step="1" value="2"></label></div><p id="sim-mode-note" class="metric-note"></p>
      <div class="lab-actions"><button id="sim-start" class="lab-primary" type="button" disabled>机器试玩本关</button><button id="sim-next" type="button">下一关</button></div><p id="sim-status" role="status" aria-live="polite">正在读取英语玩家模型…</p>
      <div class="simulation-results"><h3 id="sim-results-title">本关最近一次机器结果</h3><div id="sim-results" class="result-cards"></div></div>
      <details class="human-settings"><summary>自己试玩与真人记录</summary><div class="lab-field-grid"><label>测试者代号<input id="human-participant" maxlength="60" value="本机测试者"></label><label>测试者类型<select id="human-audience"><option value="self-other">本人测试</option><option value="ordinary-english">普通英语休闲玩家</option><option value="experienced">熟练玩家</option></select></label></div><div class="lab-actions"><button id="human-start" type="button">自己试玩并记录</button><button id="human-finish" type="button" disabled>结束／放弃</button></div><p id="human-status" role="status">点击棋盘上方“开始试玩”后连词；启用真人记录可用于英语校准。</p><p id="record-summary"></p><div class="lab-actions"><button id="human-export" type="button">导出真人记录</button><button id="human-import" type="button">合并真人记录</button><button id="human-calibrate" type="button">校准英语水平</button></div><input id="human-file" type="file" accept=".json,application/json" hidden><p id="calibration-status" role="status"></p></details>
      <p id="profile-status" class="metric-note"></p><a href="./playtest/methodology.html" target="_blank" rel="noopener">英语模型依据 ↗</a>
    </section>
    <section id="lab-batch" class="lab-pane" hidden><h2>反跑关卡</h2><p class="lab-description">三类关卡分别统计，每局重新随机抽取玩家行为。</p>
      <div id="batch-form"><div class="lab-field-grid"><label>关卡来源<select id="batch-game"><option value="wordtiles">Word Tiles 原包关卡</option><option value="web">网页生成关卡</option></select></label><label>列表<select id="batch-bank"></select></label><label id="batch-language-field">语言<select id="batch-language"><option value="english">英语</option></select></label><label>跑关模式<select id="batch-mode"><option value="ordinary">普通英语休闲玩家</option><option value="rules">规则校验</option></select></label></div><p id="batch-range-note"></p>
      <div class="batch-range-grid"><label>开始序号<input id="batch-start" type="number" min="1" step="1" value="1"></label><label>结束序号<input id="batch-end" type="number" min="1" step="1" value="30"></label><label>每关试玩（局）<input id="batch-repeats" type="number" min="1" max="1000" step="1" value="20"></label></div><label class="lab-checkbox"><input id="batch-words" type="checkbox" checked>附加词汇明细</label></div>
      <div class="lab-actions"><button id="batch-run" class="lab-primary" type="button" disabled>开始反跑</button><button id="batch-cancel" type="button" disabled>取消</button><button id="batch-xlsx" type="button" disabled>导出 Excel</button><button id="batch-json" type="button" disabled>导出 JSON</button></div><progress id="batch-progress" value="0" max="1" aria-label="反跑进度"></progress><p id="batch-status" role="status" aria-live="polite">正在读取目录…</p>
      <div class="lab-table-scroll"><table class="lab-results"><thead><tr><th>关卡</th><th>目标词</th><th>目标词长分布</th><th>通过率</th><th>平均试探</th><th>平均错误</th><th>耗时（秒）</th><th>倒向 / 多拐 / 低识别</th></tr></thead><tbody id="batch-results"></tbody></table></div><p id="batch-table-note">试探为探索性滑动次数，错误为无效提交次数；末列为目标词数量。点击结果查看关卡，Excel 含逐关与逐词指标。</p>
    </section>
    <section id="web-library" class="web-library"><div class="library-heading"><h2>生成关卡关序</h2><span id="web-level-count">0 关</span></div><div class="sequence-library-actions"><button id="sequence-export" type="button">导出关序</button><button id="sequence-import" type="button">导入关序／批量 JSON</button></div><input id="sequence-file" type="file" accept=".json,application/json" hidden><ol id="web-level-list" class="web-level-list"></ol><button id="sequence-more" type="button" hidden>显示更多关卡</button><p id="sequence-storage-note" class="metric-note">关序按词库分别保存，生成后可继续修改。</p></section>`;
  editor.append(areas);
  const zenBulk=document.createElement('button');zenBulk.id='zen-bulk-entry';zenBulk.type='button';zenBulk.className='native-bulk-entry';zenBulk.textContent='使用当前 Zen 词库批量生成新关卡';$('lab-zen-settings').append(zenBulk);
  const preview=document.createElement('section');preview.id='zen-play-preview';preview.className='lab-zen-preview';preview.hidden=true;preview.innerHTML='<div class="zen-navigation"><button id="zen-open-editor" type="button">配置</button><button id="zen-open-info" type="button">关卡信息</button></div><div class="zen-preview-heading"><span>ZEN WORD</span><h2 id="zen-play-label">主线 T1</h2></div><p id="zen-play-progress"></p><div id="zen-play-targets" class="zen-play-targets"></div><div id="zen-play-pool" class="zen-play-pool"></div><form id="zen-play-form"><label for="zen-play-input">拼出单词</label><div class="zen-input-row"><input id="zen-play-input" autocomplete="off" spellcheck="false"><button type="submit">提交</button></div></form><p id="zen-play-feedback" role="status"></p><div class="lab-actions"><button id="zen-play-clear" type="button">清空输入</button><button id="zen-play-hint" type="button">提示</button><button id="zen-play-reset" type="button">重开</button></div>';document.querySelector('.preview-column').append(preview);
  const playBar=document.createElement('div');playBar.className='playtest-start-bar';playBar.innerHTML='<span id="manual-play-status">待开始 · 0.0 秒</span><button id="manual-play-start" type="button">开始试玩</button>';document.querySelector('.preview-column').prepend(playBar);
  const dialog=document.createElement('dialog');dialog.id='level-complete-dialog';dialog.className='level-complete-dialog';dialog.setAttribute('aria-labelledby','level-complete-title');dialog.innerHTML='<div class="complete-symbol" aria-hidden="true">✓</div><p class="complete-eyebrow">LEVEL COMPLETE</p><h2 id="level-complete-title">本关完成</h2><p id="level-complete-summary"></p><button id="complete-next" type="button">下一关</button><button id="complete-review" type="button">查看本关数据</button><p id="complete-status" role="status"></p>';document.body.append(dialog);

  let tab='edit',activeSource='web',sourceChanging=false,sourceRequest=0,frequency=ENGLISH_FREQUENCY,sourceCatalogue,zenCatalogue=null,zenSession=null,machine=null,recorder=null,report=null,batchWorker=null,bulkWorker=null,bulkReport=null,bulkPreviewSession=null,bulkPreviewDictionary=null,bulkInsertion=null;
  let profile={...DEFAULT_PROFILE},records=[],storage,sequence=new LevelSequence(),sequenceStore=null,sequenceLoaded=false,sequenceSaveTimer,libraryLimit=200;
  const trackers=new WeakMap(),measures=new WeakMap(),completedShown=new WeakSet(),bankCache=new Map(),machineResults=new MachinePlaytestResults();
  let dataResetting=false,displayedMachineResult=null;
  try{storage=localStorage;records=mergeHumanRecords([],JSON.parse(storage.getItem(RECORD_KEY)||'[]'));const saved=JSON.parse(storage.getItem(PROFILE_KEY)||'null');if(saved)profile=normalizeProfile(saved);}catch{}
  const current=()=>activeSource==='zen'?zenSession:hooks.getGame();
  const inform=(id,e)=>$(id).textContent=e.message||String(e);
  const machineRunning=()=>!!machine&&!machine.done;
  function tracker(session=current()){if(!session)return null;if(!trackers.has(session))trackers.set(session,new SessionMetrics(session));return trackers.get(session);}
  function profileForRun(){return normalizeProfile({...profile,maxHints:Number($('sim-hints').value)});}
  function simulationUnavailable(){
    const session=current();
    if(!session)return '请先载入关卡。';
    if(session.initial.source?.language&&session.initial.source.language!=='english')return '目前只支持英语关卡的机器试玩。';
    if(session.initial.mode==='bubble')return '分类词组暂不适用英语连词玩家策略。';
    return '';
  }
  function syncSimulationAvailability(){
    const unavailable=simulationUnavailable();
    $('sim-start').disabled=!frequency||!!unavailable||machineRunning()||sourceChanging||dataResetting;
    $('sim-mode-note').textContent=unavailable||'认识 80% 目标词，模拟观察和试错。显示玩家预计用时，机器会快速算完。';
  }
  function updateMachineResult(){
    const summary=machineResults.get(current());
    $('current-error-count').textContent=summary?summary.mistakes+' 次':'未模拟';
    $('current-attempt-source').textContent=summary?'最近一次机器试玩':'机器试玩';
    if(displayedMachineResult===summary)return;
    displayedMachineResult=summary;
    if(frequency&&!machineRunning())$('sim-status').textContent=summary?(summary.outcome==='won'?'本关最近一次机器试玩已完成。':'本关上次机器试玩持续卡关后放弃。'):'本关尚未模拟。';
    const resultMetrics=summary?[['完成目标',summary.completed+'/'+summary.targetCount],['试探滑动',summary.trialSwipes+' 次'],['错误提交',summary.mistakes+' 次'],['玩家预计用时',fmt(summary.elapsedSeconds)+' 秒'],['提示字母',summary.hints+' 个'],['本局认识',summary.knownCount+' 词（'+pct(summary.knownRate)+'）'],['认识但漏看',summary.knownMissedTargets+' 词'],['累计漏识别',summary.missedRecognitions+' 次']]:[];
    $('sim-results').replaceChildren(...resultMetrics.map(([label,value])=>metric(label,value)));
  }
  function sourceName(){return activeSource==='zen'?'Zen '+($('play-bank').value.endsWith('t3')?'T3':'T1'):activeSource==='wordtiles'?'WT 原包':'网页生成关卡';}
  function updateInformation(){
    const session=current();if(!session){$('level-size-card').textContent='正在载入关卡…';return;}
    if(!measures.has(session))measures.set(session,levelMetrics(session.initial,session.bonusDictionaryInput||session.dictionary));const m=measures.get(session);
    const origin=activeSource==='zen'?'zen':activeSource==='wordtiles'?'wt-package':session.dictionary?.metadata?.origin;
    $('level-size-card').replaceChildren(metric(sourceName(),m.rows?`${m.cols} × ${m.rows}`:`${[...session.pool].length} 个字母`),metric('词库来源',BANK_NAMES[origin]||'历史网页词库'),metric('本关总词数',`${m.wordCount} 个`),metric('目标 / 额外词',`${m.targetCount} / ${m.extras}`));
    if(activeSource==='web')$('level-size-card').append(metric('生成算法',session.initial.source?.generationEngine==='supplied-v1'?'历史关卡':'可调棋盘回溯'));
    if(activeSource==='web'&&session.initial.source?.editorNumber)$('level-size-card').append(metric('编辑关号',session.initial.source.editorNumber));
    if(activeSource==='web'&&session.initial.source?.difficultyRequested!=null)$('level-size-card').append(metric('计划难度',session.initial.source.difficultyRequested+(session.initial.source.edited?' · 已手改':'')));
    const lengths=[...new Set([...Array.from({length:9},(_,i)=>i+2),...Object.keys(m.wordLengths).map(Number),...Object.keys(m.extraWordLengths).map(Number)])].sort((a,b)=>a-b);
    $('word-length-metrics').replaceChildren(...lengths.map(n=>{const card=metric(n+' 字词',`${m.wordLengths[n]||0} / ${m.extraWordLengths[n]||0}`,`目标词 ${m.wordLengths[n]||0} 个；额外词 ${m.extraWordLengths[n]||0} 个。目标占比 = ${m.wordLengths[n]||0} ÷ ${m.targetCount}（本关总目标词数）= ${pct(m.wordLengthShares[n]||0)}。`);const share=document.createElement('small');share.textContent='目标占比 '+pct(m.wordLengthShares[n]||0);share.title=`${m.wordLengths[n]||0} / ${m.targetCount} 个目标词`; card.append(share);return card;}));
    $('word-length-metrics').setAttribute('aria-label','按全部实际词长分别统计，数值为目标词 / 额外词');
    $('word-ratio-metrics').replaceChildren(metric('目标词长比（约分）',m.wordLengthRatio));
    $('path-metrics').replaceChildren(...[['目标词拐弯总次数',m.totalTurns],['反向目标词数',m.reverseTargets],['重复使用格子数',m.sharedTiles],['最大格子使用次数',m.maxTileUses]].map(([label,value])=>metric(label,value??'不适用')));
    const perceptionStats=spatialLevelMetrics(session.initial);
    $('perception-metrics').replaceChildren(...[['顺读词（无左／上步）',m.readingForwardTargets],['倒向词（反向步 > 50%）',m.reverseMajorityTargets],['外圈词（外圈格 ≥ 80%）',m.outerTargets],['多拐词（≥ 2 次）',m.spatialMultiTurnTargets],['低识别词（原分 < 55%）',m.hardToSpotTargets]].map(([label,value])=>metric(label,value??'不适用')),
      metric('原识别估计分',pct(perceptionStats.meanKnownRecognition),'保留原来的静态排布公式，分数越高表示越容易识别。'),
      metric('校正后识别估计分',pct(perceptionStats.meanCorrectedRecognition),'按80%认识率模拟推进清词后的单轮识别概率；未改变原识别分。'),
      metric('推进校正平均变化',perceptionStats.meanProgressionGain==null?'—':(perceptionStats.meanProgressionGain>=0?'+':'')+(perceptionStats.meanProgressionGain*100).toFixed(1)+' 个百分点'),
      metric('半数外露目标词',perceptionStats.applicable?`${perceptionStats.words.filter(word=>word.halfExposureRate>0).length} / ${perceptionStats.words.length} 个`:'不适用', '至少一半路径格接到棋盘外缘的目标词数。'),
      metric('平均半数外露回合',!perceptionStats.applicable?'不适用':perceptionStats.meanFirstHalfExposureTurn==null?'—':perceptionStats.meanFirstHalfExposureTurn.toFixed(1)+' 次清词','仅对曾达到半数外露的认识样本取平均；0表示初始已外露。'),
      metric('发现时平均外露率',pct(perceptionStats.meanExposureAtDiscovery),'目标词被识别时，路径中连到外缘的格子比例。'),
      metric('平均同字干扰减少',perceptionStats.meanAmbiguityReduction==null?'—':perceptionStats.meanAmbiguityReduction.toFixed(2)+' 项','目标路径同字邻格干扰值从初始到识别时的平均减少量。'));
    $('perception-words').replaceChildren(...perceptionStats.words.slice().sort((a,b)=>a.length-b.length).map(word=>{const row=document.createElement('tr');for(const value of [word.word,word.turns,pct(word.backwardShare),pct(word.edgeShare),pct(word.recognitionProbability),pct(word.correctedRecognitionProbability),(word.progressionGain>=0?'+':'')+(word.progressionGain*100).toFixed(1)+' pp',pct(word.halfExposureRate),word.meanFirstHalfExposureTurn==null?'未过半':word.meanFirstHalfExposureTurn.toFixed(1),word.meanAmbiguityReduction==null?'—':word.meanAmbiguityReduction.toFixed(2)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}return row;}));
    $('path-metric-note').textContent=m.spatialApplicable?'反向目标按终点方向计；排布识别另统计每一步的方向与拐弯。':'Zen 字母池不使用棋盘空间指标。';
    updateSessionInformation();
  }
  function recordPersonal(session=current(),flush=false){if(dataResetting)return;const t=trackers.get(session);if(t)hooks.recordPersonalProgress?.(session,t.snapshot(),flush);}
  function pausePersonal(){const session=current();trackers.get(session)?.pause();recordPersonal(session,true);}
  function updateSessionInformation(){const t=tracker();if(!t)return;const s=t.snapshot();recordPersonal();
    updateMachineResult();
    $('manual-play-status').textContent=s.timeKind==='virtual'?'机器预计 · '+fmt(s.elapsedSeconds)+' 秒':!s.started?'待开始 · 0.0 秒':s.finished?'本关结束 · '+fmt(s.elapsedSeconds)+' 秒':'试玩中 · '+fmt(s.elapsedSeconds)+' 秒';$('manual-play-start').disabled=!current()||current().status!=='playing'||s.started||s.timeKind==='virtual';}
  const canPlay=()=>!!tracker()?.started&&!tracker().finished&&!machineRunning();
  $('manual-play-start').onclick=()=>{if(!current()||machineRunning())return;tracker().start();syncTime();if(activeSource==='zen')renderZen();else hooks.render();updateInformation();};
  function syncTime(){for(const session of [hooks.getGame(),zenSession]){const t=trackers.get(session);if(t){if(session===current()&&!document.hidden&&$('lobby').hidden&&tab!=='batch')t.resume();else t.pause();recordPersonal(session,t.runningSince===null);}}if(recorder){if(recorder.session===current()&&!document.hidden&&$('lobby').hidden&&tab!=='batch')recorder.resume();else recorder.pause();}}
  function syncView(){
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
  function stopMachine(){if(machine&&!machine.done)machine.finish('cancelled');machine=null;syncSimulationAvailability();}
  function closeCompletion(){if(dialog.open)dialog.close();}
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
  }
  function rememberWeb(entry,position){
    const item=sequence.insert(entry,position);
    if(item){renderWebLibrary();scheduleSequenceSave();if($('batch-game').value==='web'&&$('batch-bank').value==='history')updateBatchRange();}
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
    bulkReport={schemaVersion:2,kind:'generated-level-batch',status:'running',requested:job.count,engine:job.engine,config:job.config,plan:job.plan,dictionary:job.dictionary,frequencyVersion:frequency?.version,createdAt:new Date().toISOString(),levels:[]};
    const instance=new Worker('./generation-batch.worker.js?v=28',{type:'module'});bulkWorker=instance;setBulkBusy(true);
    bulkProgress(0,job.count,`正在生成 ${job.count} 关 · ${BANK_NAMES[job.dictionary.metadata.origin]}`);
    instance.onmessage=({data})=>{
      if(bulkWorker!==instance)return;
      if(data.type==='level'){
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
  $('wt-bulk-entry').onclick=()=>bulkDialog.open({origin:'wordtiles'});$('zen-bulk-entry').onclick=()=>bulkDialog.open({origin:'zen',bank:$('play-bank').value});
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
      for(const e of snapshot.levels)createAlgorithmSession(e.level,dictionaries.get(e.dictionaryVersion));
      let count=0;for(const e of snapshot.levels)if(rememberWeb({level:e.level,dictionary:dictionaries.get(e.dictionaryVersion)}))count++;
      $('sequence-storage-note').textContent=`已导入 ${count} 关，按词库分别加入关序。`;saveSequence();
    }catch(e){inform('sequence-storage-note',e);}finally{$('sequence-file').value='';}
  };
  openSequenceStorage().then(async store=>{
    if(dataResetting){store?.close();return;}
    sequenceStore=store;const snapshot=await store?.load();
    if(snapshot){const loaded=new LevelSequence(),restored=loaded.restore(snapshot,createAlgorithmSession);for(const entry of [...sequence.groups.values()].flat())loaded.insert(entry);sequence=loaded;renderWebLibrary();if(restored.rejected)$('sequence-storage-note').textContent=`已清理 ${restored.rejected} 个旧词库或失效的历史关卡。`;}
    sequenceLoaded=true;scheduleSequenceSave();
  }).catch(()=>{sequenceLoaded=true;$('sequence-storage-note').textContent='本次关序保留在页面内，请导出 JSON。';});

  async function loadZen(){throw new Error('Zen 原包关卡库未包含在此发布版本中。');}
  async function chooseSource(source,position=1,order='main',language='english'){
    pausePersonal();const request=++sourceRequest;sourceChanging=true;$('play-source').disabled=true;finishHuman('interrupted');stopMachine();closeCompletion();
    try{
      if(source==='zen'){const next=await loadZen(position);if(request!==sourceRequest)return;zenSession=next;activeSource='zen';$('zen-position').value=position;renderZen();}
      else if(source==='wordtiles'){if(!await hooks.useWordTiles(position,order,language))throw new Error('原包关卡未能载入');if(request!==sourceRequest)return;activeSource='wordtiles';}
      else {if(!await hooks.useGenerated())throw new Error('随机关卡生成失败，请重试');if(request!==sourceRequest)return;activeSource='web';}
      syncView();return true;
    }catch(e){inform('sim-status',e);inform('zen-status',e);inform('complete-status',e);$('play-source').value=activeSource;return false;}
    finally{if(request===sourceRequest){sourceChanging=false;$('play-source').disabled=false;syncView();}}
  }
  $('play-source').onchange=()=>chooseSource($('play-source').value);$('play-bank').onchange=()=>chooseSource('zen',1);$('zen-load').onclick=()=>chooseSource('zen',Number($('zen-position').value));
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
  async function nextLevel(){const previous=current();closeCompletion();let loaded;if(activeSource==='zen')loaded=await chooseSource('zen',zenSession.level.source.position<1000?zenSession.level.source.position+1:1);else if(activeSource==='wordtiles')loaded=await hooks.nextWordTiles();else{const list=webHistory(),entry=previous?.dictionary?sequence.find(previous.initial,previous.dictionary):null,index=list.indexOf(entry);if(index>=0&&index+1<list.length){loadSequenceEntry(list[index+1]);loaded=true;}else loaded=await chooseSource('web');}syncView();if(!loaded&&previous===current()&&previous?.status==='won'){$('complete-status').textContent='下一关未能载入，请重试。';dialog.showModal();}}
  $('sim-next').onclick=nextLevel;
  function showCompletion(){const session=current();if(!session||session.status!=='won'||completedShown.has(session))return;completedShown.add(session);const s=tracker(session).snapshot(),count=session.targetCount??session.initial.targets.length;$('level-complete-title').textContent='本关完成';$('level-complete-summary').textContent=`${count} 个目标全部完成 · ${s.timeKind==='virtual'?'预计用时 ':''}${fmt(s.elapsedSeconds)} 秒 · ${s.mistakes} 次错误`;$('complete-status').textContent='';$('complete-next').disabled=false;dialog.showModal();}
  $('complete-next').onclick=async()=>{$('complete-next').disabled=true;try{await nextLevel();}finally{$('complete-next').disabled=false;}};$('complete-review').onclick=()=>{closeCompletion();changeTab('simulate');};
  $('sim-start').onclick=async()=>{if(!frequency||simulationUnavailable()||machineRunning()||sourceChanging||dataResetting)return;try{finishHuman('interrupted');resetCurrent();const run=new SimulationRun(current(),{frequency,profile:profileForRun(),mode:'ordinary'});machine=run;syncSimulationAvailability();$('sim-status').textContent='正在计算本关结果…';await new Promise(r=>setTimeout(r,0));if(machine!==run)return;const summary=run.run();tracker(run.session).setSimulation(summary);machineResults.set(run.session,summary);
      $('sim-status').textContent=summary.outcome==='won'?'本次机器试玩完成。':summary.outcome==='gave-up'?'持续卡关后放弃，保留本次未完成结果。':summary.outcome==='search-limit'?'触发内部搜索保护，本局不计入有效模拟样本。':'本次机器试玩异常，保留上一次有效结果。';if(activeSource==='zen')renderZen();else{hooks.clearSelection();hooks.render();}updateInformation();showCompletion();
    }catch(e){inform('sim-status',e);}finally{machine=null;syncSimulationAvailability();}};
  $('human-start').onclick=()=>{try{stopMachine();resetCurrent();const participant=$('human-participant').value.trim();if(!participant)throw new Error('请填写测试者代号');tracker().start();recorder=new HumanRecorder(current(),{participant,audience:$('human-audience').value});$('human-status').textContent='真人记录中，开始连词即可。';$('human-finish').disabled=false;syncTime();if(activeSource==='zen')renderZen();else hooks.render();}catch(e){inform('human-status',e);}};
  $('human-finish').onclick=()=>{finishHuman(current()?.status==='won'?'won':'gave-up');tracker()?.end();if(activeSource==='zen')renderZen();else hooks.render();};
  function updateRecordSummary(){$('record-summary').textContent=`已保存 ${records.length} 局真人记录。`;$('profile-status').textContent=profile.status==='observational-calibration'?`思考时间与错误率已用 ${profile.calibration?.participants||0} 人的记录调整；80% 认识率为设定，空间识别仍为工程估计。`:'英语模型：目标词认识率 80%；空间识别经工程对照校准，尚未真人验证。小关按随机取整，多局平均 80%。';}
  $('human-export').onclick=()=>{if(recorder)finishHuman('interrupted');downloadFile(JSON.stringify({schemaVersion:1,records},null,2),'英语真人试玩记录.json');};$('human-import').onclick=()=>$('human-file').click();
  $('human-file').onchange=async()=>{try{const f=$('human-file').files[0];if(!f)return;if(f.size>20*1024*1024)throw new Error('记录文件超过20MiB');records=mergeHumanRecords(records,JSON.parse(await f.text()));try{storage?.setItem(RECORD_KEY,JSON.stringify(records));}catch{}updateRecordSummary();}catch(e){inform('calibration-status',e);}finally{$('human-file').value='';}};
  $('human-calibrate').onclick=()=>{const result=calibrateEnglish(records);$('calibration-status').textContent=result.message;if(result.ok){profile=result.profile;try{storage?.setItem(PROFILE_KEY,JSON.stringify(profile));}catch{}updateRecordSummary();}};

  function selectedBanks(){return $('batch-game').value==='zen'?BANKS.filter(b=>b.key===$('batch-bank').value):$('batch-game').value==='wordtiles'?sourceCatalogue?.languages.filter(g=>g.language===$('batch-language').value)||[]:[{key:$('batch-bank').value}];}
  function updateBatchRange(){const game=$('batch-game').value,banks=selectedBanks(),limit=game==='zen'?1000:game==='web'?($('batch-bank').value==='history'?webHistory().length:10000):$('batch-bank').value==='main'?banks[0]?.mainCount:banks[0]?.count;
    $('batch-start').max=limit||1;$('batch-end').max=limit||1;$('batch-end').value=Math.min(30,limit||1);const settings=hooks.generationSettings();$('batch-range-note').textContent=game==='web'&&$('batch-bank').value==='fresh'?`新随机关卡 · ${settings.config.cols}×${settings.config.rows} · ${BANK_NAMES[settings.dictionary?.metadata?.origin]||'当前词库'}`:`关卡序号 1～${limit||0}`;
    $('batch-mode').querySelector('[value="ordinary"]').disabled=$('batch-language').value!=='english';if($('batch-mode').selectedOptions[0].disabled)$('batch-mode').value='rules';}
  function updateBatchLists(){const game=$('batch-game').value;options($('batch-bank'),game==='zen'?BANKS.map(b=>[b.key,b.label]):game==='wordtiles'?[['main','原包主线'],['all','全部不同关卡']]:[['fresh','新随机生成'],['history','当前网页关卡列表']]);
    $('batch-language-field').hidden=game!=='wordtiles';options($('batch-language'),game==='wordtiles'?(sourceCatalogue?.languages||[]).map(g=>[g.language,LANGUAGE_NAMES[g.language]||g.language]):[['english','英语']]);$('batch-language').value='english';updateBatchRange();}
  $('batch-game').onchange=updateBatchLists;$('batch-bank').onchange=updateBatchRange;$('batch-language').onchange=updateBatchRange;
  function endBatch(status,message){batchWorker?.terminate();batchWorker=null;if(report)report.status=status;$('batch-status').textContent=message;$('batch-run').disabled=!frequency;$('batch-cancel').disabled=true;$('batch-xlsx').disabled=!report?.levels.length;$('batch-json').disabled=!report?.levels.length;for(const i of $('batch-form').querySelectorAll('input,select'))i.disabled=false;}
  async function inspectResult(row){if(row.game==='Zen Word'){$('play-bank').value=row.bank;await chooseSource('zen',row.position);}else if(row.game==='Word Tiles')await chooseSource('wordtiles',row.position,row.bank,row.language);else{const e=[...sequence.groups.values()].flat().find(e=>e.level.id===row.id||(!e.level.id&&String(e.level.seed)===String(row.id)));if(e)loadSequenceEntry(e);}}
  $('batch-run').onclick=()=>{try{const game=$('batch-game').value,language=$('batch-language').value,start=Number($('batch-start').value),end=Number($('batch-end').value),repeats=Number($('batch-repeats').value),banks=selectedBanks(),limit=Number($('batch-end').max);
      if(!banks.length||![start,end,repeats].every(Number.isInteger)||start<1||end<start||end>limit||repeats<1||repeats>1000||(game==='web'&&$('batch-bank').value==='history'&&!webHistory().length))throw new Error('请检查关卡范围与每关试玩局数');if((end-start+1)*repeats>200000)throw new Error('每批最多200,000局，请缩小范围');
      const generation=hooks.generationSettings(),job={game,language,banks,start,end,repeats,mode:$('batch-mode').value,order:$('batch-bank').value,profile:profileForRun(),includeWords:$('batch-words').checked,
        randomization:'system',dictionary:generation.dictionary,generationBudget:generation.budget,generationConfig:generation.config,generationEngine:generation.engine,webLevels:game==='web'&&$('batch-bank').value==='history'?webHistory():undefined,
        sourceSha256:game==='zen'?zenCatalogue.sha256:game==='wordtiles'?sourceCatalogue.sha256:null};
      report={job:{...job,dictionary:{version:job.dictionary?.version,metadata:job.dictionary?.metadata},webLevels:undefined},requested:end-start+1,status:'running',frequencyVersion:frequency.version,createdAt:new Date().toISOString(),levels:[],runs:[],words:[]};$('batch-results').replaceChildren();$('batch-progress').max=report.requested;$('batch-progress').value=0;for(const i of $('batch-form').querySelectorAll('input,select'))i.disabled=true;$('batch-run').disabled=true;$('batch-cancel').disabled=false;$('batch-xlsx').disabled=true;$('batch-json').disabled=true;$('batch-status').textContent='正在反跑…';
      batchWorker=new Worker('./playtest.worker.js?v=29',{type:'module'});batchWorker.onmessage=({data})=>{if(data.type==='level'){report.levels.push(data.row);report.runs.push(...data.runs);report.words.push(...data.words);if(data.generated)rememberWeb(data.generated);$('batch-progress').value=data.processed;
          const row=document.createElement('tr');for(const text of [data.row.position,data.row.targetCount??'—',Object.entries(data.row.wordLengths||{}).sort((a,b)=>Number(a[0])-Number(b[0])).map(([length,count])=>length+':'+count).join(' / '),data.row.error?'失败':pct(data.row.winRate),fmt(data.row.meanTrialSwipes),fmt(data.row.meanMistakes),fmt(data.row.medianSeconds),data.row.spatialApplicable?[data.row.reverseMajorityTargets,data.row.spatialMultiTurnTargets,data.row.hardToSpotTargets].join(' / '):'—']){const td=document.createElement('td');td.textContent=text;row.append(td);}row.onclick=()=>inspectResult(data.row).catch(e=>inform('batch-status',e));$('batch-results').append(row);$('batch-status').textContent=`已处理 ${data.processed}/${report.requested} 关 · ${report.runs.length} 局`;}
        else if(data.type==='done')endBatch('complete',`反跑完成：${data.processed}关、${report.runs.length}局。`);else if(data.type==='error')endBatch('failed','反跑失败：'+data.message);};batchWorker.onerror=e=>endBatch('failed','运行失败：'+e.message);batchWorker.postMessage(job);
    }catch(e){inform('batch-status',e);}};
  $('batch-cancel').onclick=()=>endBatch('cancelled',`已取消，保留已处理的${report?.levels.length||0}关。`);
  $('batch-xlsx').onclick=()=>{try{downloadFile(exportAnalysisXlsx(report),'关卡反跑分析.xlsx',XLSX_MIME);$('batch-status').textContent=`已生成 Excel：${report.levels.length} 关、${report.runs.length} 局，含试探与排布识别指标。`;}catch(e){inform('batch-status',e);}};$('batch-json').onclick=()=>downloadFile(JSON.stringify(report,null,2),'关卡反跑分析.json');
  window.addEventListener('pagehide',()=>{pausePersonal();clearInterval(clock);finishHuman('interrupted');stopMachine();batchWorker?.terminate();bulkWorker?.terminate();saveSequence();});updateRecordSummary();
  json('./source-levels/catalogue.json?v=15').then(value=>{sourceCatalogue=value;$('batch-run').disabled=false;$('zen-load').disabled=true;updateBatchLists();$('sim-status').textContent='词频由仓库已有分级词表估算；Zen 原包数据不随代码版发布。';$('batch-status').textContent='选择 Word Tiles 原包或当前网页关卡范围后开始反跑。';$('zen-status').textContent='Zen 关卡库未包含在此发布版本中。';syncView();}).catch(e=>{inform('sim-status',e);inform('batch-status',e);});
  return {get machineRunning(){return machineRunning();},get bulkRunning(){return !!bulkWorker;},get canPlay(){return canPlay();},recordSubmit,recordHint,changeTab,continueJourney:()=>current()?.status==='won'?nextLevel():true,dictionaryChanged(){renderWebLibrary();updateInformation();if(sourceCatalogue)updateBatchRange();},
    prepareDataReset(){dataResetting=true;sourceRequest++;clearInterval(clock);clearTimeout(sequenceSaveTimer);recorder=null;machine=null;machineResults.clear();batchWorker?.terminate();bulkWorker?.terminate();batchWorker=null;bulkWorker=null;sequenceStore?.close();sequenceStore=null;sequenceLoaded=false;},
    gameChanging(){finishHuman('interrupted');stopMachine();const session=hooks.getGame();trackers.get(session)?.pause();recordPersonal(session,true);closeCompletion();},
    gameChanged(){const g=hooks.getGame();if(!sourceChanging&&activeSource!=='zen')activeSource=g?.initial.algorithm===1?'wordtiles':'web';if(g?.exportInitial&&g.initial.algorithm!==1)rememberWeb({level:g.exportInitial,dictionary:g.dictionary});syncView();},
    gameUpdated(){updateInformation();showCompletion();},getReport(){return report;},getBulkReport(){return bulkReport;}};
}
