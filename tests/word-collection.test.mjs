import test from 'node:test';
import assert from 'node:assert/strict';
import {createWordCollection,COLLECTION_KEY} from '../dist/core/word-collection.js';
import {WORD_ENTRIES} from '../dist/core/word-source.js';
import {WORD_BANK_ORIGIN} from '../dist/core/dictionary-banks.js';
function memory(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};}

test('目标词和有效额外词去重收录，刷新后恢复，不清空其他浏览器数据',()=>{
  const storage=memory();storage.setItem('unrelated','keep');const collection=createWordCollection(storage,()=> '2026-10-10T12:00:00.000Z');
  assert.equal(collection.collect({accepted:true,word:'CAT',status:'playing'}),true);
  assert.equal(collection.collect({accepted:false,reason:'extra-word',word:'DOG',isNew:true}),true);
  assert.equal(collection.collect({accepted:true,word:'cat'}),false);
  const restored=createWordCollection(storage);assert.deepEqual(restored.entries().map(e=>e.word),['CAT','DOG']);
  assert.equal(restored.size,2);assert.equal(storage.getItem('unrelated'),'keep');assert.equal(restored.persistent,true);
});
test('错误、取消、重复目标、错误消耗和状态异常不收录',()=>{
  const collection=createWordCollection(memory());
  for(const result of [null,{accepted:false,reason:'not-target',word:'CAT'},{accepted:false,reason:'different-consumption',word:'CAT'},
    {accepted:false,reason:'already-completed',word:'CAT'},{accepted:true,word:'CAT',status:'anomaly'},{accepted:true,word:'<script>'}]) assert.equal(collection.collect(result),false);
  assert.equal(collection.size,0);
});
test('仅工作簿中的英语词可收录；其他语言和伪造来源被拒绝',()=>{
  const collection=createWordCollection(memory());
  const [required,extra]=[WORD_ENTRIES.find(e=>e.role==='required').word,WORD_ENTRIES.find(e=>e.role==='extra').word];
  assert.equal(collection.collect({accepted:true,word:required},'english',WORD_BANK_ORIGIN),true,required);
  assert.equal(collection.collect({accepted:false,reason:'extra-word',word:extra,isNew:true},'english',WORD_BANK_ORIGIN),true,extra);
  assert.equal(collection.collect({accepted:true,word:'CAT'},'russian',WORD_BANK_ORIGIN),false);
  assert.equal(collection.collect({accepted:true,word:'ZZZNOTINBANK'},'english',WORD_BANK_ORIGIN),false);
  assert.equal(collection.size,2);
  const migrated=createWordCollection(memory());assert.equal(migrated.collect({accepted:true,word:required},'english','wt-package'),true);
  assert.equal(migrated.entries()[0].origin,WORD_BANK_ORIGIN);
});
test('存储禁用或额度不足时继续本次收录，不影响游戏提交',()=>{
  const unavailable={getItem(){throw new Error('blocked');},setItem(){throw new Error('quota');}};
  const collection=createWordCollection(unavailable);assert.equal(collection.persistent,false);
  assert.equal(collection.collect({accepted:true,word:'CAT'}),true);assert.equal(collection.size,1);assert.equal(collection.persistent,false);
});
test('破损旧数据与非法词条不会显示或执行，正常收录可重新保存',()=>{
  const storage=memory();storage.setItem(COLLECTION_KEY,'{bad');const collection=createWordCollection(storage);
  assert.equal(collection.size,0);collection.collect({accepted:true,word:'DOG'});assert.equal(collection.persistent,true);
  const restored=createWordCollection(storage);const entries=restored.entries();entries[0].word='CHANGED';assert.equal(restored.entries()[0].word,'DOG');
});
