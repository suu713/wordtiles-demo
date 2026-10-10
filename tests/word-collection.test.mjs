import test from 'node:test';
import assert from 'node:assert/strict';
import {createWordCollection,COLLECTION_KEY} from '../dist/core/word-collection.js';
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
test('五语言原包可收录，语言和单词共同去重，同形词不丢失',()=>{
  const collection=createWordCollection(memory());
  for(const [word,language] of [['CAT','english'],['CAT','turkish'],['ПОЛ','russian'],['AÑO','spanish'],['PÃO','portuguese']]) assert.equal(collection.collect({accepted:true,word},language),true);
  assert.equal(collection.size,5);assert.equal(collection.collect({accepted:true,word:'CAT'},'unknown'),false);
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
