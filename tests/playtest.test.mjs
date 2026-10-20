import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {SourceGameSession,convertSourceLevel} from '../dist/core/source-levels.js';
import {SimulationRun,DEFAULT_PROFILE,summarizeRuns,familiarity,scanVisibleBoard,seededRandom} from '../dist/core/playtest.js';
import {HumanRecorder,mergeHumanRecords,calibrateEnglish} from '../dist/core/playtest-records.js';
import {exportAnalysisXlsx,analysisSheets} from '../dist/core/playtest-export.js';
import {createZenDictionary,zenDictionaryError} from '../dist/core/zen-dictionary.js';
import {ENGLISH_FREQUENCY} from '../dist/core/playtest-frequency.js';
const load=async file=>JSON.parse(await readFile(new URL('../dist/'+file,import.meta.url),'utf8'));
const bank=await load('source-levels/english.json'),frequency=ENGLISH_FREQUENCY;
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
