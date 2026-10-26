import test from 'node:test';
import assert from 'node:assert/strict';
import {createBankDictionary} from '../dist/core/dictionary-banks.js';
import {generateLevel} from '../dist/core/algorithm2.js';
import {createAlgorithmSession,refreshWorkbookEntry} from '../dist/core/algorithm-v1-adapter.js';
import {LevelSequence} from '../dist/core/level-sequence.js';
import {collectionTheme} from '../dist/core/collection-themes.js';

const dictionary=createBankDictionary([3,4,5,6,7,8]),result=generateLevel({maxNodesPerAttempt:10000,maxAttempts:30,maxTotalNodes:300000},dictionary,88,{levelConfig:{rows:2,cols:2,wordLengths:[4]}});
assert.equal(result.ok,true,result.message);
function historical(){
  const oldDictionary={...structuredClone(dictionary),version:'wt-workbook-previous',metadata:{...dictionary.metadata,sourceSha256:'previous',sourceVersion:'wt-workbook-previous'}};
  const level={...structuredClone(result.level),dictionaryVersion:oldDictionary.version,source:{...result.level.source,dictionaryVersion:oldDictionary.version,dictionaryMetadata:oldDictionary.metadata,sourceSha256:'previous',editorNumber:100,edited:true}};
  return {level,dictionary:oldDictionary};
}
test('替换工作簿后重绑兼容历史关卡，字母、次数、目标路径和编辑信息不变',()=>{
  const previous=historical(),before=structuredClone(previous),entry=refreshWorkbookEntry(previous);
  assert.deepEqual(previous,before);assert.equal(entry.dictionary.version,dictionary.version);assert.equal(entry.level.dictionaryVersion,dictionary.version);
  assert.equal(entry.level.source.sourceSha256,dictionary.metadata.sourceSha256);assert.equal(entry.level.source.editorNumber,100);assert.equal(entry.level.source.edited,true);
  assert.deepEqual(entry.level.board,previous.level.board);assert.deepEqual(entry.level.targets,previous.level.targets);assert.equal(entry.level.seed,previous.level.seed);
  const session=createAlgorithmSession(entry.level,entry.dictionary);for(const target of session.initial.targets)assert.equal(session.submit(target.path).accepted,true);assert.equal(session.status,'won');
  assert.equal(refreshWorkbookEntry({level:result.level,dictionary}).level,result.level);
});
test('历史关序升级保留关号，失效目标和损坏格子不能通过换版本绕过校验',()=>{
  const previous=historical(),sequence=new LevelSequence();sequence.insert(previous,{number:100});
  const restored=new LevelSequence();assert.deepEqual(restored.restore(sequence.serialize(),createAlgorithmSession,{migrateEntry:refreshWorkbookEntry}),{restored:1,rejected:0});
  assert.equal(restored.list('wt-workbook')[0].number,100);assert.equal(restored.list('wt-workbook')[0].dictionary.version,dictionary.version);
  const bad=historical();bad.level.targets[0].word='ZZZFAKE';assert.throws(()=>refreshWorkbookEntry(bad),/无法接入/);
  const corrupt=historical();corrupt.level.board.counts[0]++;assert.throws(()=>refreshWorkbookEntry(corrupt),/无法接入/);
});
test('新版多细分类优先使用工作簿语义，并保持原有八个收藏主题',()=>{
  for(const [category,theme] of [['水果、树木','food'],['鸟类、动作与行为','animals'],['家居与日用品','everyday'],['航海与船舶、动作与行为','travel'],['认知与心理、情感','people'],['交流与传播','actions'],['植物','nature']])
    assert.equal(collectionTheme('EXAMPLE',{category,definitionZh:'通用释义'}),theme);
});
