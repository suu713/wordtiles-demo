import {normalizeQualityConfig,QUALITY_LABELS} from './core/quality-config.js?v=39';
import {normalizedQualityLevel} from './core/quality-metrics.js?v=39';
import {scoreLevelQuality} from './core/quality-scoring.js?v=39';
import {summarizeQualityBenchmark,branchingRangeFromBenchmark} from './core/quality-benchmark.js?v=39';
import {downloadFile} from './core/playtest-export.js?v=35';
const fmt=value=>value==null?'不可用':Number(value).toFixed(Number.isInteger(value)?0:3),statusNames={pass:'达标',fail:'偏离',unavailable:'不可用',exempt:'覆盖不足，豁免', 'not-applicable':'非V3模板'},difficultyNames={easy:'简单',normal:'普通',hard:'困难'};
const optionalRanges=['avgBranching','sharedCellRate','wordFormDiversity','distractorScore'];
export function mountLevelQuality({getGame,getSettings,applyTemplate,loadCandidate}){
  const panel=document.createElement('details');panel.id='level-quality';panel.className='quality-panel';
  panel.innerHTML=`<summary>关卡质量 · V3</summary><div class="lab-field-grid"><label>质量难度<select id="quality-difficulty"><option value="easy">简单</option><option value="normal" selected>普通</option><option value="hard">困难</option></select></label><label>质量模式<select id="quality-mode"><option value="REPORT">REPORT · 只统计</option><option value="RANK">RANK · 评分择优</option><option value="FILTER">FILTER · 严格筛选</option></select></label><label>最多候选关卡<input id="quality-candidates" type="number" min="1" max="200" value="20"></label><label>每候选搜词节点预算<input id="quality-nodes" type="number" min="1" max="1000000" value="100000"></label></div><div class="lab-actions"><button id="quality-template" type="button">应用 V3 固定模板</button><button id="quality-export" type="button" disabled>导出本关质量报告</button></div><p class="metric-note">V3 模板：3×3，5个目标，词长3/3/3/4/5，每格最多3次。REPORT 保留原生成结果；RANK／FILTER 仅支持此模板。</p><details><summary>目标范围与筛选开关</summary><p class="metric-note">勾选表示参与评分及 FILTER；空白边界表示不限。缺失的启用指标不能通过 FILTER，词频覆盖不足80%的词频门槛除外。</p><div class="lab-table-scroll"><table class="lab-results quality-parameters"><thead><tr><th>启用</th><th>指标</th><th>最低</th><th>最高</th></tr></thead><tbody id="quality-ranges"></tbody></table></div></details><p id="quality-status" role="status" aria-live="polite">等待关卡。</p><p id="quality-score" class="quality-score"></p><p id="quality-search-status" class="metric-note"></p><ul id="quality-warnings" class="quality-warnings"></ul><div class="lab-table-scroll"><table class="lab-results"><thead><tr><th>指标</th><th>实际值</th><th>目标范围</th><th>状态</th></tr></thead><tbody id="quality-metrics"></tbody></table></div><details><summary>逐词路径与开局分</summary><div class="lab-table-scroll"><table class="lab-results"><thead><tr><th>词</th><th>可靠Zipf</th><th>近似分</th><th>路径</th><th>转弯</th><th>路径数／消耗集合</th><th>分支</th><th>开局分</th><th>纯路径参考</th></tr></thead><tbody id="quality-words"></tbody></table></div></details><details><summary>干扰词分类</summary><div id="quality-distractors"></div></details><details><summary>候选结果池</summary><div class="lab-field-grid"><label>排序<select id="quality-pool-sort"><option value="score">评分从高到低</option><option value="turns">转弯从少到多</option><option value="branching">分支从少到多</option></select></label><label class="lab-checkbox"><input id="quality-pool-filter" type="checkbox">只看满足全部启用条件</label></div><ol id="quality-pool"></ol></details><details><summary>批量质量测试</summary><div class="lab-field-grid"><label>测试难度<select id="quality-test-difficulty"><option value="all">简单＋普通＋困难</option><option value="easy">简单</option><option value="normal">普通</option><option value="hard">困难</option></select></label><label>每档独立生成次数<input id="quality-test-count" type="number" min="1" max="5000" value="500"></label></div><p class="metric-note">按 V3 固定模板测试，不插入关序。使用当前质量模式；全三档时使用各档默认范围。分位数只反映本批生成分布，未经过玩家校准。</p><div class="lab-actions"><button id="quality-test-start" type="button">开始质量测试</button><button id="quality-test-stop" type="button" disabled>取消测试</button><button id="quality-test-export" type="button" disabled>导出测试报告</button></div><progress id="quality-test-progress" value="0" max="1" aria-label="质量测试进度"></progress><p id="quality-test-status" role="status"></p><div id="quality-test-summary"></div></details>`;
  document.getElementById('generation-section').after(panel);
  const $=id=>document.getElementById(id),cache=new Map(),profiles={},cells=(row,values)=>row.replaceChildren(...values.map(value=>{const td=document.createElement('td');td.textContent=value;return td;}));
  let analysisWorker=null,analysisKey=null,currentKey=null,currentReport=null,lastSearch=null,candidates=[],poolDictionary=null,testWorker=null,testReport=null,generationBusy=false;
  function syncLocks(){const busy=generationBusy||!!testWorker;for(const id of ['quality-difficulty','quality-mode','quality-candidates','quality-nodes','quality-template','quality-test-start'])$(id).disabled=busy;for(const input of $('quality-ranges').querySelectorAll('input'))input.disabled=busy;for(const button of $('quality-pool').querySelectorAll('button'))button.disabled=busy;const quantiles=$('quality-branching-apply');if(quantiles)quantiles.disabled=busy||!branchingRangeFromBenchmark(testReport.rows,$('quality-difficulty').value);$('quality-test-difficulty').disabled=!!testWorker;$('quality-test-count').disabled=!!testWorker;}
  function invalidatePool(){candidates=[];poolDictionary=null;lastSearch=null;renderPool();$('quality-search-status').textContent='质量配置已修改，请重新生成候选。';}
  const remember=(key,report)=>{cache.set(key,report);if(cache.size>200)cache.delete(cache.keys().next().value);};
  const keyFor=(level,dictionary)=>JSON.stringify([dictionary?.version,level.seed,normalizedQualityLevel(level).board,normalizedQualityLevel(level).targets]);
  function fillRanges(){
    const difficulty=$('quality-difficulty').value,config=profiles[difficulty]||normalizeQualityConfig({difficulty});
    $('quality-ranges').replaceChildren(...[...new Set([...Object.keys(config.ranges),...optionalRanges])].map(key=>{
      const row=document.createElement('tr');row.dataset.key=key;
      const on=document.createElement('input');on.type='checkbox';on.checked=config.enabled[key]??false;on.dataset.enabled=key;on.setAttribute('aria-label',QUALITY_LABELS[key]+'参与筛选');
      const checkbox=document.createElement('td');checkbox.append(on);const label=document.createElement('td');label.textContent=QUALITY_LABELS[key];row.append(checkbox,label);
      for(const [index,bound] of ['min','max'].entries()){const td=document.createElement('td'),input=document.createElement('input');input.type='number';input.step='0.01';input.value=config.ranges[key]?.[index]??'';input.dataset[bound]=key;input.setAttribute('aria-label',QUALITY_LABELS[key]+(index?'最高':'最低'));td.append(input);row.append(td);}return row;
    }));
  }
  function read(){
    const ranges={},enabled={};for(const row of $('quality-ranges').rows){const key=row.dataset.key;ranges[key]=[row.querySelector('[data-min]').value,row.querySelector('[data-max]').value].map(value=>value===''?null:Number(value));enabled[key]=row.querySelector('[data-enabled]').checked;}
    return normalizeQualityConfig({difficulty:$('quality-difficulty').value,mode:$('quality-mode').value,maxCandidates:Number($('quality-candidates').value),maxSearchNodes:Number($('quality-nodes').value),ranges,enabled});
  }
  function renderPool(){
    const filtered=candidates.filter(candidate=>!$('quality-pool-filter').checked||candidate.qualityReport.scoring.filterSatisfied),sort=$('quality-pool-sort').value;
    filtered.sort((a,b)=>sort==='turns'?a.qualityReport.values.totalTurnCount-b.qualityReport.values.totalTurnCount:sort==='branching'?a.qualityReport.values.avgBranching-b.qualityReport.values.avgBranching:(b.qualityReport.scoring.totalScore??-1)-(a.qualityReport.scoring.totalScore??-1));
    $('quality-pool').replaceChildren(...filtered.map(candidate=>{const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.disabled=generationBusy||!!testWorker;button.textContent=`${fmt(candidate.qualityReport.scoring.totalScore)} 分 · ${candidate.level.targets.map(t=>t.word).join(' / ')}`;button.onclick=()=>loadCandidate({level:candidate.level,dictionary:poolDictionary});li.append(button);return li;}));
  }
  function draw(report){
    let scoring;try{scoring=scoreLevelQuality(report,read());}catch(error){$('quality-status').textContent=error.message;$('quality-export').disabled=true;return;}currentReport={...report,scoring};
    $('quality-export').disabled=false;$('quality-status').textContent=report.hardValid?(report.templateMatched?'V3 模板 · 玩法硬性校验通过':'自定义规格 · 仅统计，不套用 V3 范围'):'玩法校验失败';
    $('quality-score').textContent=`质量评分 ${scoring.totalScore===null?'不可用':scoring.totalScore.toFixed(1)} / 100 · 评分覆盖 ${(scoring.confidence*100).toFixed(0)}%`;
    const warnings=[...report.warnings];if(scoring.config.mode==='FILTER'&&scoring.evaluations.some(item=>item.enabled&&item.status==='unavailable'))warnings.push('FILTER 有已启用但数据缺失的指标；请补充数据或手动停用相应条件。');
    $('quality-warnings').replaceChildren(...warnings.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    $('quality-metrics').replaceChildren(...Object.entries(report.values||{}).filter(([key])=>QUALITY_LABELS[key]).map(([key,value])=>{const row=document.createElement('tr'),criterion=scoring.evaluations.find(item=>item.key===key);row.dataset.metric=key;cells(row,[QUALITY_LABELS[key],fmt(value),criterion?criterion.range.map(v=>v??'不限').join('～'):'仅统计',criterion?(criterion.enabled?'':'未启用 · ')+statusNames[criterion.status]:value===null?'不可用':'统计']);return row;}));
    $('quality-words').replaceChildren(...report.words.map(word=>{const row=document.createElement('tr');cells(row,[word.word,fmt(word.zipf),fmt(word.zipfEstimate),word.path.join('→'),word.wordTurnCount,`${word.pathCount} / ${word.consumptionSetCount}`,fmt(word.wordBranching),fmt(word.wordEase),fmt(word.pathEase)]);return row;}));
    $('quality-distractors').replaceChildren(...Object.entries(report.categories||{}).map(([type,words])=>{const p=document.createElement('p');p.textContent=({targetWords:'目标词',rewardedExtraWords:'认可的额外词',ignoredValidWords:'忽略的合法词',blockedWords:'屏蔽词'}[type])+`（${words.length}）：`+(words.join('、')||'本词库范围内未发现');return p;}));
    if(lastSearch)$('quality-search-status').textContent=`候选请求 ${lastSearch.requests} · 硬性合格 ${lastSearch.hardCandidates} · 合格率 ${lastSearch.requests?(lastSearch.hardCandidates/lastSearch.requests*100).toFixed(1):'—'}% · 搜索 ${fmt(lastSearch.elapsedMs)} ms`;
  }
  function update(){
    const game=getGame();if(!game)return;
    if(game.initial.algorithm===1){analysisWorker?.terminate();analysisWorker=null;analysisKey=null;currentKey=null;$('quality-status').textContent='原包按固定目标与帘子规则运行；V3 生成质量评分不适用。';$('quality-export').disabled=true;return;}
    let config;try{config=read();}catch(error){$('quality-status').textContent=error.message;$('quality-export').disabled=true;return;}
    const level=game.exportInitial||game.initial,key=keyFor(level,game.dictionary);currentKey=key;
    if(cache.has(key)){draw(cache.get(key));return;}
    if(analysisKey===key)return;
    analysisWorker?.terminate();analysisKey=key;$('quality-status').textContent='后台计算质量指标…';$('quality-export').disabled=true;
    const worker=new Worker('./quality-analysis.worker.js?v=39',{type:'module'});analysisWorker=worker;
    worker.onmessage=({data})=>{if(analysisWorker!==worker)return;worker.terminate();analysisWorker=null;analysisKey=null;if(data.type==='report'){remember(key,data.report);if(currentKey===key)draw(data.report);}else $('quality-status').textContent=data.message;};
    worker.onerror=event=>{if(analysisWorker===worker){worker.terminate();analysisWorker=null;analysisKey=null;$('quality-status').textContent='质量分析失败：'+event.message;}};
    worker.postMessage({level,dictionary:game.dictionary,maxSearchNodes:config.maxSearchNodes});
  }
  function renderBenchmark(){
    if(!testReport)return;const summary=testReport.summary||summarizeQualityBenchmark(testReport.rows,testReport.requested);
    const p=document.createElement('p');p.textContent=`已测 ${summary.processed}/${summary.requested} 次 · 硬性合格 ${fmt(summary.hardPassRate===null?null:summary.hardPassRate*100)}% · 进入结果池 ${summary.generated} 次 · 平均 ${fmt(summary.time.mean)}ms · P90 ${fmt(summary.time.p90)}ms · ${summary.distinctCombinations} 种词组 · ${summary.distinctStructures} 种几何结构`;
    const table=document.createElement('table');table.className='lab-results';const head=document.createElement('tr');cells(head,['指标','均值','P10','P50','P90','可用数']);table.append(head);
    for(const [key,value] of Object.entries({qualityScore:summary.score,...summary.metrics})){const row=document.createElement('tr');cells(row,[QUALITY_LABELS[key]||'质量评分',fmt(value.mean),fmt(value.p10),fmt(value.p50),fmt(value.p90),value.available]);table.append(row);}
    const reasons=document.createElement('p');reasons.textContent='常见偏离／缺失原因：'+summary.failureReasons.slice(0,8).map(([reason,count])=>reason+' ×'+count).join('；');
    const scroller=document.createElement('div');scroller.className='lab-table-scroll';scroller.append(table);
    const softTable=document.createElement('table');softTable.className='lab-results';const softHead=document.createElement('tr');cells(softHead,['软性目标','可评估数','满足率','缺失／豁免']);softTable.append(softHead);
    for(const [key,value] of Object.entries(summary.soft)){const row=document.createElement('tr');cells(row,[QUALITY_LABELS[key],value.available,value.satisfactionRate===null?'不可用':(value.satisfactionRate*100).toFixed(1)+'%',`${value.unavailable} / ${value.exempt}`]);softTable.append(row);}
    const softScroller=document.createElement('div');softScroller.className='lab-table-scroll';softScroller.append(softTable);
    const quantiles=document.createElement('button');quantiles.id='quality-branching-apply';quantiles.type='button';quantiles.textContent='将本批分支分位数填入当前档位';quantiles.disabled=generationBusy||!!testWorker||!branchingRangeFromBenchmark(testReport.rows,$('quality-difficulty').value);quantiles.title='当前档位至少100个有效生成样本后可用；仅反映生成分布，尚未玩家校准';
    quantiles.onclick=()=>{const estimate=branchingRangeFromBenchmark(testReport.rows,$('quality-difficulty').value);if(!estimate||generationBusy||testWorker)return;const row=$('quality-ranges').querySelector('[data-key="avgBranching"]');row.querySelector('[data-enabled]').checked=true;row.querySelector('[data-min]').value=estimate.range[0]??'';row.querySelector('[data-max]').value=estimate.range[1]??'';profiles[$('quality-difficulty').value]=read();invalidatePool();update();$('quality-test-status').textContent=`已按 ${estimate.count} 个本批样本填写分支范围，未改变其他阈值。`;} ;
    $('quality-test-summary').replaceChildren(p,scroller,softScroller,reasons,quantiles);
  }
  function stopTest(status='cancelled',message='已取消，保留已完成请求。'){
    testWorker?.terminate();testWorker=null;if(testReport){testReport.status=status;testReport.summary=summarizeQualityBenchmark(testReport.rows,testReport.requested);}
    syncLocks();
    $('quality-test-stop').disabled=true;$('quality-test-export').disabled=!testReport?.rows.length;$('quality-test-status').textContent=message;renderBenchmark();
  }
  fillRanges();
  $('quality-difficulty').onchange=()=>{fillRanges();invalidatePool();update();renderBenchmark();};
  for(const id of ['quality-ranges','quality-mode','quality-candidates','quality-nodes'])$(id).addEventListener('change',()=>{invalidatePool();try{profiles[$('quality-difficulty').value]=read();if(id==='quality-nodes'){analysisWorker?.terminate();analysisWorker=null;analysisKey=null;cache.clear();}update();}catch(error){$('quality-status').textContent=error.message;$('quality-export').disabled=true;}});
  $('quality-template').onclick=()=>{applyTemplate();$('quality-status').textContent='V3 模板已应用到生成配置，点击原有生成按钮生成。';};
  $('quality-export').onclick=()=>downloadFile(JSON.stringify({kind:'wordtiles-quality-report',level:getGame().exportInitial||getGame().initial,report:currentReport,search:lastSearch},null,2),'关卡质量V3报告.json');
  $('quality-pool-sort').onchange=renderPool;$('quality-pool-filter').onchange=renderPool;
  $('quality-test-start').onclick=()=>{
    if(testWorker)return;
    try{const settings=getSettings(),quality=read(),count=Number($('quality-test-count').value),selection=$('quality-test-difficulty').value,difficulties=selection==='all'?['easy','normal','hard']:[selection];
      if(!Number.isInteger(count)||count<1||count>5000)throw new Error('每档测试次数须为1～5000');
      testReport={kind:'wordtiles-quality-benchmark',status:'running',createdAt:new Date().toISOString(),requested:count*difficulties.length,dictionaryVersion:settings.dictionary.version,quality,rows:[],examples:[]};
      const worker=new Worker('./quality-benchmark.worker.js?v=39',{type:'module'});testWorker=worker;syncLocks();$('quality-test-start').disabled=true;$('quality-test-stop').disabled=false;$('quality-test-export').disabled=true;$('quality-test-summary').replaceChildren();$('quality-test-progress').max=testReport.requested;$('quality-test-progress').value=0;
      worker.onmessage=({data})=>{if(testWorker!==worker)return;if(data.type==='row'){testReport.rows.push(data.row);if(data.example)testReport.examples.push(data.example);$('quality-test-progress').value=data.processed;$('quality-test-status').textContent=`已完成 ${data.processed}/${data.requested} 次独立请求`;if(data.processed%20===0)renderBenchmark();}else if(data.type==='done'){Object.assign(testReport,data.report);stopTest('complete','测试完成，以下为本批实际分布。');}else stopTest('failed',data.message);};
      worker.onerror=event=>stopTest('failed',event.message);worker.postMessage({count,difficulties,quality,dictionary:settings.dictionary,budget:settings.budget});
    }catch(error){$('quality-test-status').textContent=error.message;}
  };
  $('quality-test-stop').onclick=()=>stopTest();$('quality-test-export').onclick=()=>downloadFile(JSON.stringify(testReport,null,2),'关卡质量V3批量测试.json');
  return {update,getSettings:read,setGenerationBusy(value){generationBusy=value;syncLocks();},generationResult(result,dictionary){lastSearch=result.qualitySearch||null;candidates=lastSearch?.candidates||[];poolDictionary=dictionary;if(result.qualityReport){const key=keyFor(result.level,dictionary);remember(key,result.qualityReport);}renderPool();if(!result.ok)$('quality-search-status').textContent=result.message;},dispose(){analysisWorker?.terminate();testWorker?.terminate();analysisWorker=null;testWorker=null;cache.clear();}};
}
