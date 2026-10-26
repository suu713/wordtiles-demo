import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {SourceGameSession,convertSourceLevel} from '../dist/core/source-levels.js';
import {SimulationRun,DEFAULT_PROFILE,summarizeRuns,familiarity,scanVisibleBoard,seededRandom} from '../dist/core/playtest.js';
import {HumanRecorder,mergeHumanRecords,calibrateEnglish} from '../dist/core/playtest-records.js';
import {exportAnalysisXlsx,exportAnalysisJson,analysisSheets} from '../dist/core/playtest-export.js';
import {createZenDictionary,zenDictionaryError} from '../dist/core/zen-dictionary.js';
import {ENGLISH_FREQUENCY} from '../dist/core/playtest-frequency.js';
const load=async file=>JSON.parse(await readFile(new URL('../dist/'+file,import.meta.url),'utf8'));
const bank=await load('../tests/fixtures/retired-runtime-data/source-levels/english.json'),frequency=ENGLISH_FREQUENCY;
const level=position=>convertSourceLevel(bank.levels[bank.orders.main[position-1]],{language:'english',order:'main',position});

test('英语模拟同种子可复现，初始关卡不变，所有提交经过真实规则',()=>{
  const original=level(25),before=JSON.stringify(original);
  const run=seed=>new SimulationRun(new SourceGameSession(original),{seed,frequency}).run();
  assert.deepEqual(run(143),run(143));assert.notDeepEqual(run(143).events,run(144).events);assert.equal(JSON.stringify(original),before);
  const r=run(143);assert.ok(Number.isFinite(r.elapsedSeconds)&&r.elapsedSeconds>=0);assert.ok(r.events.length<=DEFAULT_PROFILE.maxSteps);
  assert.equal('patienceSeconds' in r.profile,false);assert.notEqual(r.outcome,'timeout');
});
test('词汇记忆没有目标且无提示时，模拟不会偷读答案；全知规则模式仍完整完成',()=>{
  const l=level(25),ordinary=new SimulationRun(new SourceGameSession(l),{seed:9,frequency,lexicon:[],profile:{...DEFAULT_PROFILE,maxHints:0}}).run();
  assert.equal(ordinary.completed,0);assert.notEqual(ordinary.outcome,'won');
  const rules=new SimulationRun(new SourceGameSession(l),{seed:9,frequency,mode:'rules'}).run();
  assert.equal(rules.outcome,'won');assert.equal(rules.completed,l.targets.length);assert.equal(rules.hints,0);
});
test('可视扫描节点有界，不能读目标词或已消除格',()=>{
  const board={rows:2,cols:2,letters:['C','A','T','S']},trie={children:new Map([['C',{children:new Map([['A',{children:new Map(),word:'CA'}]])}]])};
  const result=scanVisibleBoard(board,[1,0,1,1],trie,3,seededRandom(1));assert.ok(result.visited<=3);assert.equal(result.found.length,0);
});
test('常见词熟悉度更高，但未观察词不冒充不可能，模型拒绝其他语言的人类推断',()=>{
  assert.ok(familiarity(6)>familiarity(2));assert.ok(familiarity(0)>0);
  const l=level(1);l.source.language='portuguese';assert.throws(()=>new SimulationRun(new SourceGameSession(l),{frequency}),/仅校准英语/);
});
test('聚合剔除异常并给出有限模拟样本区间，空样本保留空值',()=>{
  const s=summarizeRuns([{outcome:'won',elapsedSeconds:20,hints:0,mistakes:1},{outcome:'gave-up',elapsedSeconds:60,hints:2,mistakes:3},{outcome:'error',elapsedSeconds:0}]);
  assert.equal(s.samples,2);assert.equal(s.winRate,.5);assert.equal(s.errors,1);assert.ok(s.ciLow<.5&&s.ciHigh>.5);assert.equal(summarizeRuns([]).winRate,null);
});
test('真人计时排除暂停，中断与机器不能混进英语校准，按记录ID合并',()=>{
  let now=0;const session=new SourceGameSession(level(1)),recorder=new HumanRecorder(session,{participant:'A',audience:'ordinary-english',now:()=>now});
  now=1000;recorder.pause();now=100000;recorder.resume();now=102000;
  const h=session.hint(),result=session.submit(h.path);recorder.submit(h.path,result);recorder.hint(session.hint());
  const record=recorder.finish('gave-up');assert.equal(record.elapsedSeconds,3);assert.equal(mergeHumanRecords([record],[record]).length,1);
  assert.throws(()=>mergeHumanRecords([],[{...record,mode:'ordinary'}]),/格式/);assert.equal(calibrateEnglish([record]).ok,false);
  const records=Array.from({length:30},(_,i)=>({...record,id:String(i),participant:'P'+i%10,elapsedSeconds:10+i,attempts:5,mistakes:1}));
  const calibrated=calibrateEnglish(records);assert.equal(calibrated.ok,true);assert.equal(calibrated.profile.knowledgeShift,0);assert.equal(calibrated.profile.scanBudget,160);
  assert.equal(calibrated.profile.calibration.participants,10);assert.equal(calibrateEnglish(records.map(r=>({...r,outcome:'interrupted'}))).ok,false);
});
test('当前发布不附带 Zen 原包关卡或词库',()=>{
  assert.throws(()=>createZenDictionary([3,4,5]),/未包含在此发布版本/);
  assert.equal(zenDictionaryError({}).code,'ZEN_CONTENT_UNAVAILABLE');
});
test('Excel是真实ZIP/OOXML，文本不会执行为公式，逐关与逐局数据完整',()=>{
  const report={status:'cancelled',requested:10,job:{game:'wordtiles',mode:'ordinary',profile:DEFAULT_PROFILE},levels:[{position:1,targets:'=1+1',winRate:0}],runs:[{outcome:'gave-up',elapsedSeconds:5,hints:1,mistakes:0,seed:4,events:[]}],words:[]};
  const bytes=exportAnalysisXlsx(report);assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
  const text=new TextDecoder().decode(bytes);assert.ok(text.includes('inlineStr'));assert.ok(text.includes('=1+1'));assert.ok(!text.includes('<f>'));assert.ok(text.includes('cancelled'));
  assert.equal(analysisSheets(report)[1].rows.length,2);assert.equal(analysisSheets(report)[2].rows.length,2);
});

test('常规导出移除提示、通过率和未解认识词，保留真实错误、用时和原始报告',()=>{
  const report={job:{mode:'ordinary',profile:{...DEFAULT_PROFILE,maxHints:18,hintAfter:1}},
    levels:[{id:'sample',meanMistakes:3,meanSeconds:20,winRate:.5,ciLow:.2,ciHigh:.8,meanKnownUnsolvedTargets:1,meanHints:2}],
    runs:[{mode:'ordinary',outcome:'gave-up',elapsedSeconds:20,mistakes:3,attempts:5,hints:2,knownUnsolvedTargets:1}],
    words:[{word:'CAT',samples:1,trialSwipes:2,hintLetters:2,hinted:1}]};
  const before=structuredClone(report),exported=JSON.parse(exportAnalysisJson(report));
  assert.equal(exported.levels[0].meanMistakes,3);assert.equal(exported.runs[0].completionSeconds,null);assert.equal(Object.hasOwn(exported.runs[0],'elapsedSeconds'),false);assert.equal(exported.words[0].trialSwipes,2);
  assert.doesNotMatch(JSON.stringify(exported),/"(?:maxHints|hintAfter|hints|meanHints|hintLetters|hinted|winRate|ciLow|ciHigh|knownUnsolvedTargets|meanKnownUnsolvedTargets)":/);
  const sheets=analysisSheets(report),labels=[...sheets[0].rows.map(row=>row[0]),...sheets.slice(1).flatMap(sheet=>sheet.rows[0])];
  assert.ok(labels.every(label=>!/(?:提示|通关率|通过率|95%|未解)/.test(label)));
  assert.equal(sheets[0].rows.find(row=>row[0]==='平均错误数')[1],3);
  assert.equal(sheets[0].rows.find(row=>row[0]==='通关耗时（秒）')[1],null);
  assert.deepEqual(report,before);
});
test('逐局明细可选，关闭不影响均值和逐关数据；3456比值固定顺序且不约分',()=>{
  const report={job:{mode:'ordinary',includeRuns:false},levels:[{wordLengths:{3:4,4:2,5:2,6:2,7:3},targetCount:13,meanSeconds:20}],
    runs:[{mode:'ordinary',outcome:'won',elapsedSeconds:10,mistakes:2},{mode:'ordinary',outcome:'gave-up',elapsedSeconds:30,mistakes:4}],words:[]},before=structuredClone(report);
  const sheets=analysisSheets(report);assert.deepEqual(sheets.map(sheet=>sheet.name),['分析总览','逐关分析']);const header=sheets[1].rows[0];assert.equal(sheets[1].rows[1][header.indexOf('目标词长分布（3：4：5：6）')],'4：2：2：2');assert.ok(header.includes('7字目标词数'));
  const brief=JSON.parse(exportAnalysisJson(report));assert.equal(Object.hasOwn(brief,'runs'),false);assert.equal(brief.summary.completionSeconds,10);assert.equal(brief.summary.meanMistakes,3);assert.equal(brief.levels[0].wordLengthRatio,'4：2：2：2');assert.deepEqual(brief.levels[0].wordLengthRatioOrder,[3,4,5,6]);
  const included={...report,job:{...report.job,includeRuns:true}},detailed=JSON.parse(exportAnalysisJson(included));assert.equal(detailed.runs.length,2);assert.equal(detailed.summary.completionSeconds,brief.summary.completionSeconds);assert.ok(analysisSheets(included).some(sheet=>sheet.name==='逐局明细'));assert.deepEqual(report,before);
});
test('界面导出口径只保留通关耗时，未完成局用时不进入通关统计，原数据不变',()=>{
  const runs=[{outcome:'won',elapsedSeconds:10},{outcome:'won',elapsedSeconds:30},{outcome:'won',elapsedSeconds:20},{outcome:'gave-up',elapsedSeconds:500},{outcome:'error',elapsedSeconds:999}],summary=summarizeRuns(runs),report={job:{includeRuns:true},levels:[{...summary}],runs,words:[]},before=structuredClone(report);
  const exported=JSON.parse(exportAnalysisJson(report));assert.equal(exported.summary.completionSeconds,20);assert.equal(exported.levels[0].completionSeconds,20);assert.deepEqual(exported.runs.map(run=>run.completionSeconds),[10,30,20,null,null]);assert.doesNotMatch(JSON.stringify(exported),/"(?:meanSeconds|medianSeconds|p90Seconds|medianWinSeconds|elapsedSeconds)":/);
  const sheets=analysisSheets(report),labels=[...sheets[0].rows.map(row=>row[0]),...sheets.slice(1).flatMap(sheet=>sheet.rows[0])];assert.ok(labels.filter(label=>/耗时/.test(label)).every(label=>label==='通关耗时（秒）'));assert.deepEqual(report,before);
});
