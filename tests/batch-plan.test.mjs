import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBatchPlan,difficultyAt,targetCountAt,planLevelOptions,previewBatchPlan} from '../dist/core/batch-plan.js';
import {createBankDictionary} from '../dist/core/dictionary-banks.js';
import {generateLevelBatch} from '../dist/core/generation-batch.js';
import {generateLevel as generateFlexibleLevel} from '../dist/core/generator.js';
import {createAlgorithmSession} from '../dist/core/algorithm-v1-adapter.js';
import {GameSession,validateLevel,checkConfiguration} from '../dist/core/rules.js';
import {LevelSequence} from '../dist/core/level-sequence.js';
import {ENGLISH_FREQUENCY} from '../dist/core/playtest-frequency.js';
const dictionary=createBankDictionary([2,3,4,5,6,7,8,9,10]),budget={maxNodesPerAttempt:10000,maxAttempts:30,maxTotalNodes:300000};
const frequency=ENGLISH_FREQUENCY;
const input={startNumber:2,sizes:[{cols:3,rows:3},{cols:4,rows:2},{cols:4,rows:3},{cols:5,rows:3}],curve:{start:5,end:80,rampLevels:20,peakEvery:10,drop:20},startTargets:4,endTargets:11};

test('批量编排拒绝空规格和越界参数，词数可达16、格子上限可达9',()=>{
  assert.throws(()=>normalizeBatchPlan({...input,sizes:[]},20),/至少选择/);
  assert.throws(()=>normalizeBatchPlan({...input,maxUses:10},20),/1～9/);
  assert.throws(()=>normalizeBatchPlan({...input,curve:{...input.curve,drop:61}},20),/0～60/);
  assert.throws(()=>normalizeBatchPlan({...input,minLength:8,maxLength:4},20),/最短/);
  assert.equal(normalizeBatchPlan({...input,fixedTargets:16,maxUses:9},20).fixedTargets,16);
});
test('曲线按真实关号爬升，在峰后回落；计划目标数和词长跟随变化',()=>{
  const p=normalizeBatchPlan(input,20);
  assert.equal(difficultyAt(p,0),5);assert.equal(difficultyAt(p,8),37);assert.equal(difficultyAt(p,9),21);
  assert.equal(difficultyAt(p,18),76);assert.equal(difficultyAt(p,19),60);
  assert.equal(targetCountAt(p,0),4);assert.equal(targetCountAt(p,18),11);assert.equal(targetCountAt(p,19),9);
  const first=planLevelOptions(p,0,dictionary),last=planLevelOptions(p,18,dictionary);
  assert.ok(first.every(s=>s.config.wordLengths.length===4));assert.ok(last.every(s=>s.config.wordLengths.length===11));
  assert.ok(last.some(s=>Math.max(...s.config.wordLengths)>Math.max(...first[0].config.wordLengths)));
  assert.equal(previewBatchPlan(p,20,dictionary,'flexible').points.at(-1).number,21);
});
test('固定目标数不被难度覆盖，原V1固定3×3、5目标及3次上限',()=>{
  const p=normalizeBatchPlan({...input,targetMode:'fixed',fixedTargets:3},20);
  assert.equal(targetCountAt(p,0),3);assert.equal(targetCountAt(p,19),3);
  const v1=planLevelOptions(p,19,dictionary,'supplied-v1')[0];assert.equal(v1.config.rows,3);assert.equal(v1.config.wordLengths.length,5);assert.equal(v1.config.maxUses??3,3);
});
test('12个目标、每格8次完整检查4096状态，实际反序通关；未声明上限仍按3次拒绝',()=>{
  const targets=[['AB',[0,1]],['AC',[0,2]],['BD',[1,3]],['CD',[2,3]],['ABD',[0,1,3]],['ACD',[0,2,3]],['BAC',[1,0,2]],['BDC',[1,3,2]],['CAB',[2,0,1]],['CDB',[2,3,1]],['DBA',[3,1,0]],['DCA',[3,2,0]]].map(([word,path])=>({word,path}));
  const level={schemaVersion:2,config:{rows:2,cols:2,wordLengths:targets.map(t=>t.word.length),maxUses:8},board:{rows:2,cols:2,letters:['A','B','C','D'],counts:[8,8,8,8]},targets},words=targets.map(t=>t.word);
  const r=validateLevel(level,words);assert.equal(r.valid,true);assert.equal(r.stateChecks,4096);
  const s=new GameSession(level,words);for(const t of [...targets].reverse())s.submit(t.path);assert.equal(s.status,'won');
  assert.equal(checkConfiguration({...level.config,maxUses:undefined},words).valid,false);
});

test('14目标生成完整验证16384状态，仍遵守全局搜索预算并可实际通关',()=>{
  const words=['ABC','ABE','ADE','ADG','BAD','BCF','BED','BEF','BEH','CBA','CFE','CFI','DEB','GHE'];
  const config={rows:3,cols:3,wordLengths:Array(14).fill(3),maxUses:9};
  const result=generateFlexibleLevel(words,'complete-14-states',{config,budget});
  assert.equal(result.success,true);assert.equal(result.validation.stateChecks,16384);
  assert.equal(result.stats.completionValidationAllowance,16384);assert.ok(result.stats.nodes<=budget.maxTotalNodes);
  const session=new GameSession(result.level,words);
  for(const target of [...result.level.targets].reverse())session.submit(target.path);
  assert.equal(session.status,'won');assert.ok(session.counts.every(n=>n===0));
  const limited=generateFlexibleLevel(words,'complete-14-states',{config,budget:{...budget,maxTotalNodes:100}});
  assert.equal(limited.success,false);assert.equal(limited.stats.nodes,100);assert.ok(limited.stats.failures['global-node-limit']);
});
test('真实规划批量遵守词频、固定词数、多尺寸、邻关避重，并完成真实提交',async()=>{
  const plan=normalizeBatchPlan({...input,targetMode:'fixed',fixedTargets:3,curve:{start:5,end:35,rampLevels:3,peakEvery:0,drop:0},repeatWindow:2},3);
  const r=await generateLevelBatch({count:3,engine:'flexible',plan,dictionary,frequency,budget,beforeTargets:[['THE']],afterTargets:[['AND']]});
  assert.equal(r.status,'complete');const seen=new Set(['THE']);
  for(const [i,l]of r.levels.entries()){
    assert.equal(l.targets.length,3);assert.equal(l.source.editorNumber,i+2);assert.equal(l.source.difficultyRequested,difficultyAt(plan,i));
    assert.ok(plan.sizes.some(s=>s.rows===l.board.rows&&s.cols===l.board.cols));
    for(const t of l.targets){assert.equal(seen.has(t.word),false);assert.ok(frequency.zipf[t.word]>=l.source.difficultyParameters.minimumZipf);seen.add(t.word);}
    const s=createAlgorithmSession(l,dictionary);for(const t of [...s.initial.targets].reverse())s.submit(t.path);assert.equal(s.status,'won');assert.equal(l.source.validationStates,8);
  }
  assert.ok(!r.levels.at(-1).targets.some(t=>t.word==='AND'));
});
test('关序前后插入和编号真实生效，所有关卡共用工作簿词库',async()=>{
  const generated=await generateLevelBatch({count:3,engine:'flexible',config:{rows:2,cols:4,wordLengths:[8]},dictionary,budget}),seq=new LevelSequence();
  const a=seq.insert({level:generated.levels[0],dictionary});const c=seq.insert({level:generated.levels[2],dictionary});
  const b=seq.insert({level:generated.levels[1],dictionary},{index:1,number:2});
  assert.deepEqual(seq.list('wt-workbook').map(e=>e.number),[1,2,3]);assert.deepEqual(seq.list('wt-workbook'),[a,b,c]);
  assert.equal(seq.serialize('wt-workbook').dictionaries.length,1);assert.equal(seq.serialize().dictionaries.length,1);
  const collision=new LevelSequence(),sameIdentity={...generated.levels[1],id:generated.levels[0].id,seed:generated.levels[0].seed};collision.insert({level:generated.levels[0],dictionary});const other=collision.insert({level:sameIdentity,dictionary});assert.equal(collision.find(sameIdentity,dictionary),other);
  assert.throws(()=>seq.insert({level:{...generated.levels[1],board:{...generated.levels[1].board,letters:[...generated.levels[1].board.letters].reverse()}},dictionary},{index:2,number:1}),/前一关/);
  const restored=new LevelSequence(),state=JSON.parse(JSON.stringify(seq.serialize()));assert.equal(restored.restore(state,createAlgorithmSession).rejected,0);assert.deepEqual(restored.list('wt-workbook').map(e=>e.number),[1,2,3]);assert.equal(restored.list('wt-workbook')[0].dictionary,restored.list('wt-workbook')[2].dictionary);
});
