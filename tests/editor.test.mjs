import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameSession, validateLevel, findWordPaths, inspectPath, createNeighbors, checkConfiguration, clone } from '../dist/core/rules.js';
import { generateLevel } from '../dist/core/generator.js';
const dictionary = JSON.parse(await readFile(new URL('../dist/dictionary.json', import.meta.url),'utf8'));
const sample4 = {
  schemaVersion:2, seed:'four-square', config:{ rows:4, cols:4, wordLengths:[5,3,3,5] },
  board:{ rows:4, cols:4, letters:[...'APPLSUNEDOGTNIAR'], counts:Array(16).fill(1) },
  targets:[{word:'APPLE',path:[0,1,2,3,7]},{word:'SUN',path:[4,5,6]},{word:'DOG',path:[8,9,10]},{word:'TRAIN',path:[11,15,14,13,12]}]
};
test('4×4 配置独立检查全部 16 状态，实际完成后清空',()=>{
  const report=validateLevel(sample4,dictionary);
  assert.equal(report.valid,true,JSON.stringify(report.errors)); assert.equal(report.stateChecks,16);
  const game=new GameSession(sample4,dictionary);
  for(const target of [...sample4.targets].reverse()) assert.equal(game.submit(target.path).accepted,true);
  assert.equal(game.status,'won'); assert.deepEqual(game.counts,Array(16).fill(0));
});
test('矩形棋盘不允许行尾绕行，6×6 格子 0 和 32 不会发生位掩码碰撞',()=>{
  const neighbors=createNeighbors(3,4); assert.ok(!neighbors[3].includes(4)); assert.ok(neighbors[3].includes(7));
  assert.equal(inspectPath(Array(12).fill('A'),[3,4],null,{rows:3,cols:4}).valid,false);
  const letters=Array(36).fill('Z'), path=[0,1,7,13,19,25,31,32];
  path.forEach((cell,i)=>letters[cell]='ABCDEFGH'[i]);
  assert.ok(findWordPaths(letters,'ABCDEFGH',null,null,{rows:6,cols:6}).some(p=>p.join(',')===path.join(',')));
});
test('参数预检拒绝覆盖不足、容量超限、越界、小数和词长度过长',()=>{
  for(const config of [{rows:6,cols:6,wordLengths:[3,3]},{rows:2,cols:2,wordLengths:[5,5,5]},{rows:1,cols:3,wordLengths:[3]},{rows:2.5,cols:3,wordLengths:[3,3]},{rows:2,cols:2,wordLengths:[8]},{rows:3,cols:3,wordLengths:Array(11).fill(3)}]) assert.equal(checkConfiguration(config,dictionary).valid,false);
});
test('V2 导入核对真实行列、目标数量和长度，不能只相信 config',()=>{
  const wrongSize=clone(sample4); wrongSize.config.cols=5; assert.equal(validateLevel(wrongSize,dictionary).valid,false);
  const wrongLengths=clone(sample4); wrongLengths.config.wordLengths=[4,4,4,4];
  assert.ok(validateLevel(wrongLengths,dictionary).errors.some(e=>e.code==='LENGTHS'));
  const reordered=clone(sample4); reordered.config.wordLengths=[3,5,3,5];
  assert.ok(validateLevel(reordered,dictionary).errors.some(e=>e.code==='LENGTHS'));
  const missing=clone(sample4); delete missing.config; assert.equal(validateLevel(missing,dictionary).valid,false);
});
test('参数传入真实生成器，矩形棋盘与 6～8 字母词复现、校验、通关',()=>{
  for(const config of [{rows:2,cols:3,wordLengths:[3,3]},{rows:2,cols:3,wordLengths:[6]},{rows:2,cols:4,wordLengths:[8]},{rows:3,cols:3,wordLengths:[7,3]}]) {
    const seed='editor-'+config.wordLengths.join('-');
    const result=generateLevel(dictionary,seed,{config});
    assert.equal(result.success,true,JSON.stringify(result.stats)); assert.deepEqual(result.level.config,config);
    assert.deepEqual(result.level.targets.map(t=>t.word.length),config.wordLengths);
    assert.equal(result.validation.stateChecks,2**config.wordLengths.length);
    assert.deepEqual(generateLevel(dictionary,seed,{config}),result);
    const game=new GameSession(result.level,dictionary);
    for(const target of result.level.targets) assert.equal(game.submit(target.path).accepted,true);
    assert.equal(game.total,0);
  }
});
