import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRuns} from '../dist/core/playtest.js';
import {simulateLevelBatch,selectSimulationRange,SimulationTotals} from '../dist/core/playtest-batch.js';
import {MachinePlaytestResults} from '../dist/core/machine-playtest-results.js';
import {createBankDictionary} from '../dist/core/dictionary-banks.js';
import {generateLevel} from '../dist/core/algorithm2.js';
import {createAlgorithmSession} from '../dist/core/algorithm-v1-adapter.js';
import {ENGLISH_FREQUENCY} from '../dist/core/playtest-frequency.js';
import {analyzePlayedLevel} from '../dist/core/playtest-analysis.js';
import {analysisSheets} from '../dist/core/playtest-export.js';

const samples=[
  {mode:'ordinary',outcome:'won',elapsedSeconds:20,mistakes:1,completed:5,turnOperations:2},
  {mode:'ordinary',outcome:'won',elapsedSeconds:40,mistakes:4,completed:5,turnOperations:4},
  {mode:'ordinary',outcome:'gave-up',elapsedSeconds:120,mistakes:10,completed:2,turnOperations:9},
  ...['error','anomaly','cancelled','unsupported','search-limit','running'].map(outcome=>({mode:'ordinary',outcome,elapsedSeconds:999,mistakes:999})),
];
test('范围按真实编辑关号选择并包含两端，缺失、倒序、小数和总局数超限均拒绝',()=>{
  const entries=[104,102,101,103].map(number=>({number}));
  assert.deepEqual(selectSimulationRange(entries,102,103,20).map(entry=>entry.number),[102,103]);
  assert.deepEqual(entries.map(entry=>entry.number),[104,102,101,103]);
  assert.equal(selectSimulationRange(entries,101,101,1).length,1);
  assert.throws(()=>selectSimulationRange(entries,100,102,20),/第 100 关/);
  assert.throws(()=>selectSimulationRange(entries,103,105,20),/第 105 关/);
  assert.throws(()=>selectSimulationRange(entries.filter(entry=>entry.number!==102),101,103,20),/第 102 关/);
  for(const [start,end,repeats] of [[3,2,10],[0,2,10],[1.5,2,10],[1,2,0],[1,2,1.5],[1,201,1000]])assert.throws(()=>selectSimulationRange(entries,start,end,repeats));
});
test('范围总体均值按每个有效局等权统计，包含放弃局，取消和异常不影响分母',()=>{
  const totals=new SimulationTotals();
  for(const sample of samples)totals.add(sample);
  const expected=summarizeRuns(samples),actual=totals.snapshot();
  for(const [key,value] of Object.entries(actual))assert.equal(value,expected[key],key);
  const uneven=new SimulationTotals();
  for(const mistakes of [10,0,0,0])uneven.add({outcome:'gave-up',mistakes});
  uneven.add({outcome:'cancelled',mistakes:99});
  assert.equal(uneven.snapshot().meanMistakes,2.5);assert.equal(uneven.snapshot().samples,4);
  assert.equal(new SimulationTotals().snapshot().meanSeconds,null);
});
test('批量均值按有效局计算，放弃计入、异常及未完成排除，均值不同于中位数',()=>{
  const s=summarizeRuns(samples);
  assert.equal(s.attempted,9);assert.equal(s.samples,3);assert.equal(s.errors,6);
  assert.equal(s.meanSeconds,60);assert.equal(s.medianSeconds,40);assert.equal(s.meanMistakes,5);
  assert.equal(s.meanCompleted,4);assert.equal(s.meanTurnOperations,5);assert.equal(s.winRate,2/3);
  for(const key of ['meanSeconds','meanCompleted','meanMistakes','meanTrialSwipes','winRate'])assert.equal(summarizeRuns([])[key],null);
  const report={levels:[],runs:samples,job:{mode:'ordinary'}};
  assert.equal(analysisSheets(report)[0].rows.find(row=>row[0]==='通关耗时（秒）')[1],40);
});
test('范围实时汇总的通关耗时与完整汇总一致，停止局不计入且无通关时为空',()=>{
  const totals=new SimulationTotals(),runs=[];assert.equal(totals.snapshot().medianWinSeconds,null);
  for(const [index,time] of [90,10,70,20,60,40,0,100,80,50].entries()){
    const run={outcome:index%3===0?'gave-up':'won',elapsedSeconds:time};runs.push(run);totals.add(run);
    assert.equal(totals.snapshot().medianWinSeconds,summarizeRuns(runs).medianWinSeconds);
  }
  totals.add({outcome:'error',elapsedSeconds:999});assert.equal(totals.snapshot().medianWinSeconds,summarizeRuns(runs).medianWinSeconds);
});

test('批量中止只统计已计算局，保持关卡隔离，单次结果不能覆盖批量均值',()=>{
  const store=new MachinePlaytestResults(),session={initial:{id:'a',targets:['CAT']}};
  store.set(session,{mode:'ordinary',outcome:'won',mistakes:2});
  assert.equal(store.getDisplay(session),null);
  assert.equal(store.setBatch(session,{requested:10,runs:samples.slice(0,3),status:'cancelled'}),true);
  const result=store.getDisplay(session);
  assert.equal(result.kind,'batch');assert.equal(result.status,'cancelled');assert.equal(result.requested,10);
  assert.equal(result.summary.samples,3);assert.equal(result.summary.meanMistakes,5);assert.equal(store.get(session).mistakes,2);
  assert.equal(store.getDisplay({initial:{id:'b',targets:['CAT']}}),null);
  assert.equal(store.getDisplay({initial:session.initial,dictionary:{version:'new'}}),null);
  assert.equal(store.setBatch(session,{requested:10,runs:samples.slice(0,3),status:'complete'}),false);
  assert.equal(store.setBatch(session,{requested:1,runs:[{mode:'rules',outcome:'won'}],status:'complete'}),false);
  store.set(session,{mode:'ordinary',outcome:'won',mistakes:1});assert.equal(store.getDisplay(session),result);
  assert.equal(store.getDisplay(session).summary.meanMistakes,5);
  store.clear();assert.equal(store.getDisplay(session),null);
});

test('批量逐局重置初始棋盘，使用系统随机且不输出每步操作，失败不会伪装为零错误有效局',()=>{
  const dictionary=createBankDictionary([4]);
  const generated=generateLevel({maxNodesPerAttempt:10000,maxAttempts:30,maxTotalNodes:300000},dictionary,88,{levelConfig:{rows:2,cols:2,wordLengths:[4]}});
  assert.equal(generated.ok,true,generated.message);
  const level=generated.level,before=JSON.stringify(level),
    options={repeats:12,frequency:ENGLISH_FREQUENCY,profile:{maxHints:18,hintAfter:1}},
    runs=[...simulateLevelBatch(level,dictionary,options)];
  assert.equal(runs.length,12);assert.equal(new Set(runs.map(run=>run.runId)).size,12);
  assert.ok(runs.every(run=>run.seed===null&&run.mode==='ordinary'));
  assert.ok(runs.every(run=>run.targetCount===1&&['won','gave-up'].includes(run.outcome)&&run.completed===Number(run.outcome==='won')));
  assert.ok(runs.every(run=>run.hints===0));
  assert.ok(runs.every(run=>!('events' in run)&&!('wordStats' in run)&&run.elapsedSeconds>0));
  assert.deepEqual(runs.map(run=>run.repeat),Array.from({length:12},(_,i)=>i+1));
  assert.equal(JSON.stringify(level),before);assert.equal(createAlgorithmSession(level,dictionary).status,'playing');
  const failures=[...simulateLevelBatch(level,{...dictionary,version:'wrong'}, {...options,repeats:2})];
  assert.equal(summarizeRuns(failures).samples,0);assert.ok(failures.every(run=>run.outcome==='error'&&run.error));
  assert.throws(()=>[...simulateLevelBatch(level,dictionary,{...options,repeats:1.5})],/整数/);
});

test('逐关平均拐弯与反向连接按有效局实际操作计算',()=>{
  const level={kind:'web',board:{rows:2,cols:2,letters:['C','A','T','S'],counts:[1,1,1,1]},targets:[{word:'CATS',path:[0,1,2,3]}]};
  const row=analyzePlayedLevel(level,[
    {outcome:'won',events:[{type:'submit',value:[0,1,3]}]},
    {outcome:'gave-up',events:[{type:'submit',value:[3,2]}]},
    {outcome:'error',events:[{type:'submit',value:[0,1,3,2]}]},
  ],ENGLISH_FREQUENCY);
  assert.equal(row.meanTurnOperations,.5);assert.equal(row.meanReverseConnections,.5);
});
