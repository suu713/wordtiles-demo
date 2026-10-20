import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {levelMetrics,pathMetrics,operationMetrics,SessionMetrics} from '../dist/core/playtest-metrics.js';
import {analysisSheets} from '../dist/core/playtest-export.js';
import {SimulationRun} from '../dist/core/playtest.js';
import {SourceGameSession,convertSourceLevel} from '../dist/core/source-levels.js';
import {createZenDictionary} from '../dist/core/zen-dictionary.js';
import {MachinePlaytestResults} from '../dist/core/machine-playtest-results.js';
import {ENGLISH_FREQUENCY} from '../dist/core/playtest-frequency.js';
const load=async name=>JSON.parse(await readFile(new URL('../dist/'+name,import.meta.url),'utf8'));
const [bank]=await Promise.all([load('source-levels/english.json')]);
const frequency=ENGLISH_FREQUENCY;

test('全部实际词长独立统计，6、7、9字不合并，目标与额外分开',()=>{
  const m=levelMetrics({kind:'zen',targets:['AB','ABCDEF','ABCDEFG','ABCDEFGHI','A😀'],wordRoles:{extra:['ABCDEF','ABCDEFGHIJ','Z😀Z'],onlyExtra:['ABCDEFGHIJ']}});
  assert.deepEqual(m.wordLengths,{2:2,6:1,7:1,9:1});assert.deepEqual(m.extraWordLengths,{3:1,10:1});
  assert.equal(m.wordCount,7);assert.equal(m.wordLengthShares[2],.4);assert.equal(m.wordLengthShares[9],.2);assert.equal(m.totalTurns,null);
});
test('Excel按本批所有词长生成数字列及占比，不包含种子或每步操作表',()=>{
  const level=levelMetrics({kind:'zen',targets:['AB','ABCDEF','ABCDEFG','ABCDEFGHI'],wordRoles:{extra:['ABCDEFGHIJ'],onlyExtra:[]}});
  const sheets=analysisSheets({job:{game:'zen'},levels:[level],runs:[{outcome:'won',elapsedSeconds:9,events:[{type:'submit'}]}]});
  assert.deepEqual(sheets.map(s=>s.name),['分析总览','逐关分析','逐局明细']);
  const sheet=sheets[1],header=sheet.rows[0],row=sheet.rows[1];
  for(const n of [2,6,7,9,10])assert.ok(header.includes(n+'字目标词数'));
  assert.equal(row[header.indexOf('7字目标词数')],1);assert.equal(row[header.indexOf('10字额外词数')],1);
  assert.equal(row[header.indexOf('9字目标占比')],.25);assert.ok(sheet.percentColumns.includes(header.indexOf('9字目标占比')));
  assert.ok(!JSON.stringify(sheets).includes('派生种子'));assert.ok(!JSON.stringify(sheets).includes('6 字及以上'));
});
test('生产模拟使用新的系统随机行为，回归测试仍可单独指定种子',()=>{
  const initial=convertSourceLevel(bank.levels[String(bank.orders.main[24])],{language:'english',order:'main',position:25});
  const runs=Array.from({length:8},()=>new SimulationRun(new SourceGameSession(initial),{frequency}).run());
  assert.equal(new Set(runs.map(r=>r.runId)).size,8);assert.ok(runs.every(r=>r.seed===null));assert.ok(new Set(runs.map(r=>JSON.stringify(r.events))).size>1);
});
test('结构指标和实际操作分开，原包反向按画面行序判断',()=>{
  const board={cols:3,rows:3};assert.deepEqual(pathMetrics([0,1,4,5],board),{turns:2,reverse:false});
  assert.equal(pathMetrics([0,3,6],board,true).reverse,true);
  assert.deepEqual(operationMetrics({board,algorithm:1},[{type:'submit',value:[0,1,4,5]},{type:'submit',value:[0,3,6]}]),{turnOperations:2,reverseConnections:2});
});
test('本人计时暂停生效，错误、提示和操作总数按提交更新',()=>{
  let time=0;const session={initial:{board:{cols:3,rows:3}},status:'playing'},t=new SessionMetrics(session,{now:()=>time});
  t.start();time=2000;t.submit([0,1,4],{accepted:false,reason:'not-target'});t.useHint();t.pause();time=10000;
  assert.equal(t.snapshot().elapsedSeconds,2);assert.equal(t.snapshot().mistakes,1);assert.equal(t.snapshot().turnOperations,1);
  t.resume();time=11000;session.status='won';t.submit([0,1],{accepted:true});assert.equal(t.snapshot().elapsedSeconds,3);
});
test('代码版不加载未发布的 Zen 关卡词库',()=>{
  assert.throws(()=>createZenDictionary([3,4,5]),/未包含在此发布版本/);
});

test('本关机器错误只接受有效策略模拟，真人错误和规则校验均不写入',()=>{
  const initial=convertSourceLevel(bank.levels[String(bank.orders.main[24])],{language:'english',order:'main',position:25});
  const results=new MachinePlaytestResults(),human=new SourceGameSession(initial),metrics=new SessionMetrics(human);
  metrics.start();metrics.submit([0],human.submit([0]));
  assert.equal(metrics.snapshot().mistakes,1);assert.equal(results.get(human),null);
  assert.equal(results.set(human,metrics.snapshot()),false);
  const check=new SourceGameSession(initial),rules=new SimulationRun(check,{frequency,seed:13,mode:'rules'}).run();
  assert.equal(results.set(check,rules),false);assert.equal(results.get(human),null);
  const machine=new SourceGameSession(initial),summary=new SimulationRun(machine,{frequency,seed:13}).run();
  assert.equal(results.set(machine,summary),true);assert.equal(results.get(human).mistakes,summary.mistakes);
  metrics.submit([0],human.submit([0]));assert.equal(metrics.snapshot().mistakes,2);
  assert.equal(results.get(human).mistakes,summary.mistakes);
  assert.equal(results.set(machine,{...summary,outcome:'search-limit',mistakes:99}),false);
  assert.equal(results.get(human).mistakes,summary.mistakes);
});

test('同关重玩保留最近一次机器错误，换关、手改路径、来源和词库版本分别隔离',()=>{
  const initial=convertSourceLevel(bank.levels[String(bank.orders.main[24])],{language:'english',order:'main',position:25});
  const session=()=>new SourceGameSession(initial),results=new MachinePlaytestResults();
  assert.equal(results.set(session(),{mode:'ordinary',outcome:'won',mistakes:0}),true);
  assert.equal(results.get(session()).mistakes,0);
  results.set(session(),{mode:'ordinary',outcome:'gave-up',mistakes:7});
  const replay=session();replay.counts.fill(0);replay.completed.add(initial.targets[0].word);
  assert.equal(results.get(replay).mistakes,7);
  for(const edit of [
    level=>{level.source.position++;},
    level=>{level.source.language='spanish';},
    level=>{level.targets[0].path.reverse();},
    level=>{level.id+='-edited';},
  ]){const level=structuredClone(initial);edit(level);assert.equal(results.get({initial:level}),null);}
  for(const dictionary of [{version:'changed'},{metadata:{origin:'zen'}}])assert.equal(results.get({initial,dictionary}),null);
  results.clear();assert.equal(results.get(session()),null);
});

test('机器结果支持Zen字符串目标、T1/T3隔离与导出关卡的初始布局',()=>{
  const results=new MachinePlaytestResults(),zen={kind:'zen',letters:'CAT',targets:['CAT','AT'],source:{bank:'t1',position:1}};
  results.set({initial:zen},{mode:'ordinary',outcome:'won',mistakes:4});
  assert.equal(results.get({initial:structuredClone(zen)}).mistakes,4);
  assert.equal(results.get({initial:{...zen,source:{bank:'t3',position:1}}}),null);
  const exported={id:'generated-1',letters:['C','A','T'],targets:[{word:'CAT',canonicalPath:[0,1,2]}]};
  results.set({initial:{board:{}},exportInitial:exported,dictionary:{version:'v1'}},{mode:'ordinary',outcome:'won',mistakes:2});
  assert.equal(results.get({initial:{board:{counts:[0,0,0]}},exportInitial:structuredClone(exported),dictionary:{version:'v1'}}).mistakes,2);
  assert.equal(results.get({initial:{},exportInitial:{...exported,source:{editorNumber:20}},dictionary:{version:'v1'}}).mistakes,2);
});
