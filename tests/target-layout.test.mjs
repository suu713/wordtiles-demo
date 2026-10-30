import test from 'node:test';
import assert from 'node:assert/strict';
import {planTargetLayout} from '../dist/core/target-rows.js';

const settings={width:377,height:232,minSlot:30.3,maxSlot:44.5,letterGap:1.62,wordGap:16.2,rowGap:5.67};
function check(lengths,layout){
  assert.deepEqual(layout.rows.flat().sort((a,b)=>a-b),lengths.map((_,index)=>index));
  for(const row of layout.rows){
    const letters=layout.columns?.reduce((sum,length)=>sum+length,0)??row.reduce((sum,index)=>sum+lengths[index],0);
    const words=layout.columns?2:row.length;
    assert.ok(letters*layout.slot+(letters-words)*settings.letterGap+(words-1)*settings.wordGap<=settings.width+.01);
  }
}
test('五个长短目标放大后完整展示，无溢出且不修改词长输入',()=>{
  const lengths=[3,3,4,7,8],layout=planTargetLayout(lengths,settings);
  check(lengths,layout);assert.ok(layout.slot>=38);assert.equal(layout.rows.length,5);assert.equal(layout.scroll,false);assert.deepEqual(lengths,[3,3,4,7,8]);
});
test('参考图的十二个目标以两列六行排布，词序在各列内保持稳定',()=>{
  const lengths=[3,3,3,3,4,4,4,4,4,5,5,6],layout=planTargetLayout(lengths,settings);
  check(lengths,layout);assert.deepEqual(layout.columns,[4,6]);assert.equal(layout.rows.length,6);assert.equal(layout.scroll,false);
  assert.deepEqual(layout.rows.map(row=>row[0]),[0,1,2,3,4,5]);assert.deepEqual(layout.rows.map(row=>row[1]),[6,7,8,9,10,11]);
});
test('大量长目标保留可读字号并允许滚动，每个词只出现一次',()=>{
  const lengths=Array.from({length:18},(_,index)=>index<8?8:10),layout=planTargetLayout(lengths,settings);
  check(lengths,layout);assert.ok(layout.slot>=29);assert.equal(layout.scroll,true);
});
