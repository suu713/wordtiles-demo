import test from 'node:test';
import assert from 'node:assert/strict';
import {createBankDictionary,bankBonusDictionary} from '../dist/core/dictionary-banks.js';
import {createAlgorithmSession,validateAlgorithmLevel} from '../dist/core/algorithm-v1-adapter.js';
import {findWordPaths,validateLevel} from '../dist/core/rules.js';
import {qualityRuntimeContext} from '../dist/core/quality-runtime.js';
import {calculateLevelQuality} from '../dist/core/quality-metrics.js';
import {calculateLevelStatistics} from '../dist/core/level-statistics.js';

const dictionary=createBankDictionary([3,4,5,6,7,8]);
const extras=['LOAN','LEAP','SNAP','SPA','SPAN','PLEA','OLEA','SPAE'];
function fixture(main=dictionary,finalWord='LOANS',fourLetterWord='PANS'){
  const board={rows:3,cols:3,letters:[...'OLEAPANSE'],counts:Array(9).fill(0)};
  const targets=['NAP','LEA','SEA',fourLetterWord,finalWord].map(word=>({word,path:findWordPaths(board.letters,word,null,null,board)[0]}));
  for(const target of targets)for(const cell of target.path)board.counts[cell]++;
  return {schemaVersion:2,seed:0,kind:'web',dictionaryVersion:main.version,
    config:{rows:3,cols:3,wordLengths:targets.map(t=>t.word.length),maxUses:3},board,targets,
    source:{dictionaryOrigin:'wt-workbook',dictionaryVersion:main.version,dictionaryMetadata:main.metadata,sourceSha256:main.metadata.sourceSha256}};
}
const level=fixture();
assert.equal(validateAlgorithmLevel(level,dictionary).valid,true);

test('未入选的必答词和仅额外词都奖励一次，不扣次数、不完成目标',()=>{
  for(const word of extras){
    const session=createAlgorithmSession(level,dictionary),before=session.snapshot();
    const path=findWordPaths(level.board.letters,word,session.counts,null,level.board)[0];
    assert.ok(path,word);
    assert.deepEqual(session.submit(path),{accepted:false,reason:'extra-word',word,isNew:true});
    assert.deepEqual(session.snapshot(),before);
    assert.deepEqual(session.submit(path),{accepted:false,reason:'extra-word',word,isNew:false});
    assert.equal(session.bonusCompleted.size,1);
    assert.deepEqual(session.snapshot(),before);
  }
});

test('识别范围不受生成词长或档位缩小，LOANS 未入选时也算额外词',()=>{
  const main=createBankDictionary([3,4]),session=createAlgorithmSession(fixture(main,'LOAN'),main);
  assert.equal(main.words.includes('LOANS'),false);
  assert.deepEqual(session.submit([1,0,3,6,7]),{accepted:false,reason:'extra-word',word:'LOANS',isNew:true});
  const restricted=createBankDictionary([3],'wt-workbook',[1]),recognition=bankBonusDictionary(restricted);
  assert.equal(restricted.words.includes('SNAP'),false);
  assert.equal(recognition.words.includes('SNAP'),true);
  assert.equal(recognition.words.includes('OLEA'),true);
});

test('目标优先消除，未知词、无效路径与已消耗格子仍拒绝',()=>{
  const session=createAlgorithmSession(level,dictionary),before=session.snapshot();
  assert.deepEqual(session.submit([0,1,4,3,6]),{accepted:false,reason:'not-target',word:'OLPAN'});
  assert.equal(session.submit([0,4]).reason,'invalid-path');
  assert.equal(session.submit([1,2,1]).reason,'invalid-path');
  assert.deepEqual(session.snapshot(),before);
  assert.equal(session.submit([1,0,3,6,7]).accepted,true);
  assert.equal(session.completed.has('LOANS'),true);
  assert.equal(session.bonusCompleted.has('LOANS'),false);
  assert.equal(session.total,before.total-5);
  assert.equal(session.submit([1,0,3,6]).reason,'invalid-path');
});

test('仅额外词即使路径和次数合法，也不能提升为主线目标',()=>{
  const extraTarget=fixture(dictionary,'LOANS','OLEA');
  assert.equal(validateLevel(extraTarget,{words:[...dictionary.words,'OLEA']}).valid,true);
  const report=validateAlgorithmLevel(extraTarget,dictionary);
  assert.equal(report.valid,false);
  assert.equal(report.errors[0].code,'BANK_TARGET_POLICY');
  assert.match(report.errors[0].message,/OLEA/);
  assert.throws(()=>createAlgorithmSession(extraTarget,dictionary),/完整校验/);
});

test('V3、额外词统计与实际提交使用相同集合，同词多路径只统计一次',()=>{
  const session=createAlgorithmSession(level,dictionary),before=session.snapshot();
  const context=qualityRuntimeContext(dictionary),report=calculateLevelQuality(level,context);
  const stats=calculateLevelStatistics(level,session.bonusDictionaryInput);
  assert.equal(report.hardValid,true);
  assert.deepEqual(report.categories.ignoredValidWords,[]);
  assert.deepEqual(report.categories.rewardedExtraWords,stats.extraWords);
  assert.deepEqual(context.extraDictionary.words,session.bonusDictionaryInput.words);
  assert.ok(findWordPaths(level.board.letters,'SPA',null,null,level.board).length>1);
  assert.equal(stats.extraWords.filter(word=>word==='SPA').length,1);
  for(const word of extras)assert.ok(report.categories.rewardedExtraWords.includes(word),word);
  for(const word of stats.extraWords){
    const game=createAlgorithmSession(level,dictionary),path=findWordPaths(level.board.letters,word,game.counts,null,level.board)[0];
    assert.equal(game.submit(path).reason,'extra-word',word);
  }
  assert.equal(stats.extraWords.includes('LOANS'),false);
  assert.equal(report.completeness.reviewDictionary,false);
  assert.equal(report.values.distractorScore,null);
  assert.deepEqual(session.snapshot(),before);
});

test('收集额外词后，目标的 120 种完成顺序均清空棋盘',()=>{
  function* orders(items){if(!items.length){yield [];return;}for(let i=0;i<items.length;i++)for(const rest of orders(items.filter((_,j)=>j!==i)))yield [items[i],...rest];}
  let checked=0;
  for(const order of orders(level.targets)){
    const session=createAlgorithmSession(level,dictionary);
    assert.equal(session.submit([1,0,3,6]).reason,'extra-word');
    for(const target of order)assert.equal(session.submit(target.path).accepted,true);
    assert.equal(session.status,'won');
    assert.deepEqual(session.counts,Array(9).fill(0));
    checked++;
  }
  assert.equal(checked,120);
});
