import test from 'node:test';
import assert from 'node:assert/strict';
import {generateLevelBatch} from '../dist/core/generation-batch.js';
import {createBankDictionary,recommendedLengths} from '../dist/core/dictionary-banks.js';
import {createAlgorithmSession} from '../dist/core/algorithm-v1-adapter.js';
const budget={maxNodesPerAttempt:10000,maxAttempts:30,maxTotalNodes:300000};
const dictionary=createBankDictionary([2,3,4,5,6,7,8,9,10]);
test('词库按单词排序时，目标数推荐仍按真实词长正确覆盖棋盘',()=>{
  const available=[...new Set(dictionary.words.map(w=>w.length))],r=recommendedLengths(3,4,available,2);
  assert.deepEqual(r,recommendedLengths(3,4,[...available].sort((a,b)=>a-b),2));assert.equal(r.length,2);assert.ok(r.every(n=>available.includes(n)));assert.ok(r.reduce((a,b)=>a+b,0)>=12);
});
test('批量数量与每关目标数独立生效，结果随机、可验证及实际通关',async()=>{
  const config={rows:3,cols:4,wordLengths:recommendedLengths(3,4,[3,4,5,6,7,8],2)},progress=[];
  const r=await generateLevelBatch({count:4,engine:'flexible',config,dictionary,budget},{onLevel:e=>progress.push(e.index)});
  assert.equal(r.status,'complete');assert.equal(r.levels.length,4);assert.deepEqual(progress,[1,2,3,4]);assert.equal(new Set(r.levels.map(l=>l.seed)).size,4);
  for(const l of r.levels){assert.equal(l.targets.length,2);assert.equal(l.source.dictionaryOrigin,'wt-workbook');const s=createAlgorithmSession(l,dictionary);for(const t of s.initial.targets)s.submit(t.path);assert.equal(s.status,'won');}
});
test('批量取消只保留已完成校验的关卡，不宣称达到请求数量',async()=>{
  let cancelled=false;const r=await generateLevelBatch({count:10,engine:'flexible',config:{rows:2,cols:4,wordLengths:[8]},dictionary,budget},{onLevel:()=>cancelled=true,isCancelled:()=>cancelled});
  assert.equal(r.status,'cancelled');assert.equal(r.levels.length,1);assert.ok(createAlgorithmSession(r.levels[0],dictionary));
});
test('无效配置拒绝，预算不足明确保留部分状态；不会用样例补足',async()=>{
  await assert.rejects(generateLevelBatch({count:0,engine:'flexible',dictionary,budget}),/生成数量/);
  await assert.rejects(generateLevelBatch({count:2,engine:'flexible',config:{rows:6,cols:6,wordLengths:[3]},dictionary,budget}),/覆盖/);
  const r=await generateLevelBatch({count:2,engine:'flexible',config:{rows:2,cols:4,wordLengths:[8]},dictionary,budget:{maxNodesPerAttempt:1,maxAttempts:1,maxTotalNodes:1}});
  assert.equal(r.status,'partial');assert.equal(r.levels.length,0);assert.equal(r.failures,10);assert.match(r.error,/0\/2/);
});
