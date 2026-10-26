import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parsePlaytestUpload,MAX_PLAYTEST_UPLOAD_LEVELS} from '../dist/core/playtest-import.js';
import {createBankDictionary} from '../dist/core/dictionary-banks.js';
import {generateLevel} from '../dist/core/algorithm2.js';
import {createPlaySession} from '../dist/core/play-session.js';
import {convertWTLevel} from '../dist/core/wt-source-session.js';

const dictionary=createBankDictionary([3,4,5]);
const make=seed=>{
  const result=generateLevel({maxNodesPerAttempt:10000,maxAttempts:30,maxTotalNodes:300000},dictionary,seed,{levelConfig:{rows:2,cols:2,wordLengths:[4]}});
  assert.equal(result.ok,true,result.message);return result.level;
};
const levels=[make(88),make(89),make(90)];
const parse=(value,options)=>parsePlaytestUpload(JSON.stringify(value),options);

test('单关JSON重建原词库范围，不依赖编辑器当前设置，棋盘及目标不变',async()=>{
  const result=await parse(levels[0],{fallbackDictionary:createBankDictionary([6])});
  assert.equal(result.format,'single');assert.equal(result.count,1);
  assert.deepEqual(result.entries[0].level,levels[0]);
  assert.deepEqual(result.entries[0].dictionary,dictionary);
  assert.equal(createPlaySession(result.entries[0].level,result.entries[0].dictionary).status,'playing');
});
test('批量、关序和数组按文件顺序导入，重复关卡不丢失',async()=>{
  const ordered=[levels[2],levels[0],levels[2]],progress=[];
  for(const document of [
    {kind:'generated-level-batch',dictionary,levels:ordered},
    {schemaVersion:1,dictionaries:[dictionary],levels:ordered.map((level,index)=>({level,dictionaryVersion:dictionary.version,number:90-index}))},
    ordered,
  ]){
    const result=await parse(document,{onProgress:(...value)=>progress.push(value)});
    assert.equal(result.count,3);assert.deepEqual(result.entries.map(entry=>entry.level.seed),ordered.map(level=>level.seed));
    assert.deepEqual(result.entries.map(entry=>entry.number),[1,2,3]);
  }
  assert.deepEqual(progress.at(-1),[3,3]);
});
test('损坏关卡整份拒绝，不能通过上传跳过完整校验或换词库',async()=>{
  const bad=structuredClone(levels[1]);bad.board.counts[0]++;
  await assert.rejects(parse({dictionary,levels:[levels[0],bad,levels[2]]}),/第 2 关校验失败/);
  const wrong=structuredClone(dictionary);wrong.words=wrong.words.filter(word=>word!==levels[0].targets[0].word);
  await assert.rejects(parse({dictionary:wrong,levels:[levels[0]]}),/校验失败/);
  const incompatible=structuredClone(levels[0]);incompatible.dictionaryVersion='unrelated-version';
  await assert.rejects(parse(incompatible),/校验失败/);
  const foreign=structuredClone(levels[0]);foreign.source.language='spanish';
  await assert.rejects(parse(foreign),/英语/);
});
test('错误JSON、空文件、统计报告、缺失词库及超量列表给出明确错误',async()=>{
  await assert.rejects(parsePlaytestUpload('{'),/JSON 格式/);
  await assert.rejects(parse([]),/没有关卡/);
  await assert.rejects(parse({job:{game:'web'},levels:[{targets:'CATS',meanSeconds:12}]}),/统计报告|棋盘/);
  await assert.rejects(parse({schemaVersion:1,dictionaries:[],levels:[{level:levels[0],dictionaryVersion:'missing'}]}),/词库版本不一致|找不到/);
  await assert.rejects(parse(Array(MAX_PLAYTEST_UPLOAD_LEVELS+1).fill({})),/10,000/);
});
test('WT导出关卡保留原包规则，验证原始内容后记录可回看的实际位置',async()=>{
  const bank=JSON.parse(await readFile(new URL('../dist/source-levels/english.json',import.meta.url),'utf8'));
  const id=bank.orders.level_list_0[0],level=convertWTLevel(bank.levels[id],{order:'level_list_0',position:1});
  const result=await parse(level,{loadOriginalBank:async()=>bank});
  assert.equal(result.entries[0].originalOrder,'level_list_0');assert.equal(result.entries[0].originalPosition,1);
  assert.deepEqual(result.entries[0].level,level);
  assert.equal(createPlaySession(result.entries[0].level).status,'playing');
  const tampered=structuredClone(level);tampered.source.original.extra_words.push({word:'ZZZZZZZZZZ'});
  await assert.rejects(parse(tampered,{loadOriginalBank:async()=>bank}),/原始配置不一致/);
});
