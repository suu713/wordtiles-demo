import test from 'node:test';
import assert from 'node:assert/strict';
import {clearAppData,DATA_RESET_KEY,PREVIEW_COLLECTION_KEY} from '../dist/core/app-data.js';
import {previewCollectionWords,topUpPreviewCollection} from '../dist/core/collection-preview.js';
import {createWordCollection,COLLECTION_KEY} from '../dist/core/word-collection.js';
import {createPersonalProgress,PERSONAL_PROGRESS_KEY} from '../dist/core/personal-progress.js';
import {collectionTheme} from '../dist/core/collection-themes.js';
import {bankContainsWord,bankWordEntry,createBankDictionary} from '../dist/core/dictionary-banks.js';

function storage(){const data=new Map();let writes=0;return {get length(){return data.size;},get writes(){return writes;},key:i=>[...data.keys()][i]??null,getItem:key=>data.get(key)||null,setItem:(key,value)=>{writes++;data.set(key,value);},removeItem:key=>data.delete(key)};}

test('300词预览由系统随机抽取，去重、排除已收词并覆盖有词条的主题',()=>{
  const existing=[{word:'DOG',language:'english'},{word:'BREAD',language:'english'}],words=previewCollectionWords(existing,300);
  assert.equal(words.length,300);assert.equal(new Set(words).size,300);assert.ok(!words.includes('DOG')&&!words.includes('BREAD'));
  const counts=new Map();for(const word of words){assert.equal(bankContainsWord(word,'web-supplied'),true);const theme=collectionTheme(word,bankWordEntry(word)?.definition);counts.set(theme,(counts.get(theme)||0)+1);}
  assert.equal(counts.size,8);assert.ok([...counts.values()].every(count=>count>0));
  assert.notDeepEqual(previewCollectionWords(existing,300),words);assert.throws(()=>previewCollectionWords([],0));
});

test('批量收词一次保存，保持真实词库准入与去重规则',()=>{
  const local=storage(),collection=createWordCollection(local),before=local.writes;
  assert.equal(collection.collectMany(['CAT','DOG','CAT','<SCRIPT>']),2);assert.equal(local.writes-before,1);
  assert.deepEqual(createWordCollection(local).entries().map(e=>e.word),['CAT','DOG']);
});

test('清除本站数据保留其他键，旧收藏和计时器不能将已清除数据写回',async()=>{
  const local=storage(),session=storage(),collection=createWordCollection(local),progress=createPersonalProgress(local),game={status:'playing',completed:new Set()};
  collection.collect({accepted:true,word:'DOG'});progress.observe(game,{started:true,timeKind:'real',elapsedSeconds:0,hints:0,mistakes:0});
  local.setItem(PREVIEW_COLLECTION_KEY,'300');local.setItem('wordtiles.playtests.v1','records');local.setItem('wordtiles.playtest.profile.v1','model');local.setItem('unrelated','keep');session.setItem('wordtiles.old','discard');session.setItem('unrelated','keep');
  await clearAppData({local,session,database:null,id:'test-reset'});
  for(const key of [COLLECTION_KEY,PERSONAL_PROGRESS_KEY,PREVIEW_COLLECTION_KEY,'wordtiles.playtests.v1','wordtiles.playtest.profile.v1'])assert.equal(local.getItem(key),null);
  assert.equal(local.getItem('unrelated'),'keep');assert.equal(session.getItem('unrelated'),'keep');assert.equal(session.getItem('wordtiles.old'),null);
  assert.equal(JSON.parse(local.getItem(DATA_RESET_KEY)).phase,'complete');
  assert.equal(collection.collect({accepted:true,word:'CAT'}),false);assert.equal(progress.observe(game,{started:true,timeKind:'real',elapsedSeconds:20,hints:1,mistakes:0}),false);progress.flush();
  assert.equal(local.getItem(COLLECTION_KEY),null);assert.equal(local.getItem(PERSONAL_PROGRESS_KEY),null);
});

test('存储已满仍能清除游戏数据，不要求先腾出额外空间',async()=>{
  const local=storage(),write=local.setItem;let full=true;local.setItem=(key,value)=>{if(key===DATA_RESET_KEY&&full){full=false;throw Error('QuotaExceeded');}write(key,value);};
  local.setItem(COLLECTION_KEY,'large collection');await clearAppData({local,database:null,id:'full-reset'});
  assert.equal(local.getItem(COLLECTION_KEY),null);assert.equal(JSON.parse(local.getItem(DATA_RESET_KEY)).phase,'complete');
});

test('已有8词只补292词，保留原单词、来源和首次日期，重复预览不继续加词',()=>{
  const local=storage(),collection=createWordCollection(local,()=> '2026-10-14T04:00:00.000Z');
  collection.collectMany(createBankDictionary([3,4,5,6,7,8,9,10]).words.slice(0,8));
  const before=collection.entries();assert.equal(before.length,8);
  const result=topUpPreviewCollection(collection);assert.equal(result.added,292);assert.equal(result.total,300);
  assert.equal(new Set(collection.entries().map(entry=>entry.language+':'+entry.word)).size,300);
  assert.deepEqual(collection.entries().filter(entry=>before.some(old=>old.word===entry.word)),before);
  const again=topUpPreviewCollection(collection);assert.equal(again.added,0);assert.equal(again.total,300);
  assert.equal(createWordCollection(local).size,300);
});

test('预览不裁剪超过300词的已有收藏',()=>{
  const local=storage(),collection=createWordCollection(local);collection.collectMany(previewCollectionWords([],310));
  const before=collection.entries(),result=topUpPreviewCollection(collection);assert.equal(result.added,0);assert.equal(result.total,310);assert.deepEqual(collection.entries(),before);
});
