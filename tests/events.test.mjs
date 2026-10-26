import test from 'node:test';
import assert from 'node:assert/strict';
import {createEventProgress,EVENTS_KEY,WHEEL_REWARDS,WEEKLY_STAGES,eventDate,eventWeek} from '../dist/core/event-progress.js';
import {createDailyPuzzle} from '../dist/core/daily-puzzle.js';
import {clearAppData} from '../dist/core/app-data.js';

function storage(){const values=new Map();return {get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}

test('免费与加转共六次，中奖格翻倍、金币即时保存，刷新不重复派奖',()=>{
  const local=storage(),now=()=>new Date(2026,9,19,12),events=createEventProgress(local,{now,random:()=>0});
  let total=0;for(let i=0;i<6;i++){const result=events.spin();assert.equal(result.slice,0);assert.equal(result.coins,10*2**i);total+=result.coins;}
  assert.equal(events.spin(),null);assert.equal(events.snapshot().coins,total);assert.equal(events.snapshot().wheel.spins,6);
  const restored=createEventProgress(local,{now});assert.equal(restored.snapshot().coins,total);assert.equal(restored.spin(),null);assert.equal(restored.snapshot().wheel.rewards[0],640);
});

test('转盘按当前奖励反比选择，每个格子可命中，次日刷新且保留金币',()=>{
  const weights=WHEEL_REWARDS.map(value=>100/value),sum=weights.reduce((a,b)=>a+b);let before=0;
  weights.forEach((weight,index)=>{const events=createEventProgress(storage(),{now:()=>new Date(2026,9,19),random:()=>(before+weight/2)/sum});assert.equal(events.spin().slice,index);before+=weight;});
  const local=storage();let day=new Date(2026,9,19,23,59);const events=createEventProgress(local,{now:()=>day,random:()=>0});events.spin();day=new Date(2026,9,20,0,0);
  assert.equal(events.snapshot().coins,10);assert.equal(events.snapshot().wheel.spins,0);assert.deepEqual(events.snapshot().wheel.rewards,WHEEL_REWARDS);
});

test('周活动分档扣进度、溢出延续、最后一档循环，新周重置且保留奖励',()=>{
  let day=new Date(2026,9,19,12);const events=createEventProgress(storage(),{now:()=>day});
  assert.equal(events.claimWeekly(),null);events.addWeeklyItems(20);assert.equal(events.claimWeekly(),20);assert.equal(events.claimWeekly(),null);assert.equal(events.weeklyStatus().progress,5);
  const total=WEEKLY_STAGES.reduce((sum,row)=>sum+row.target,0);events.addWeeklyItems(total-20+240);
  for(let i=1;i<16;i++)assert.equal(events.claimWeekly(),WEEKLY_STAGES[i].coins);assert.equal(events.weeklyStatus().progress,240);assert.equal(events.claimWeekly(),250);assert.equal(events.weeklyStatus().progress,0);assert.equal(events.claimWeekly(),null);
  const coins=events.snapshot().coins;day=new Date(2026,9,26);assert.equal(events.weeklyStatus().progress,0);assert.equal(events.weeklyStatus().number,1);assert.equal(events.snapshot().coins,coins);
});

test('日题存档和宝石幂等合并，完成日期保留，领取奖励仅消耗50枚',()=>{
  const local=storage(),events=createEventProgress(local,{now:()=>new Date(2026,9,19)}),record={levelId:123,gemCells:[0,1,2],paths:[[0,1]],gemCount:2,finished:false};
  events.saveDaily(record);events.saveDaily(record);assert.equal(events.snapshot().gems,2);assert.equal(events.daily().paths.length,1);
  events.saveDaily({...record,paths:[[2,1]],gemCount:3,finished:true});assert.equal(events.snapshot().gems,3);assert.equal(events.daily().finished,true);assert.equal(events.claimGems(),false);
  const saved=JSON.parse(local.getItem(EVENTS_KEY));saved.gems=103;local.setItem(EVENTS_KEY,JSON.stringify(saved));assert.equal(events.claimGems(),true);assert.equal(events.snapshot().gems,53);assert.equal(events.snapshot().coins,40);assert.equal(events.claimGems(),true);assert.equal(events.snapshot().gems,3);assert.equal(events.claimGems(),false);
});

test('清空数据同时清除活动，旧活动对象不能把奖励或进度写回',async()=>{
  const local=storage(),events=createEventProgress(local);events.spin();await clearAppData({local,database:null,id:'events-reset'});
  assert.equal(local.getItem(EVENTS_KEY),null);assert.equal(events.spin(),null);assert.equal(events.addWeeklyItems(3),false);assert.equal(local.getItem(EVENTS_KEY),null);
});

test('日题由工作簿按本地日期生成，规格和目标可还原且全词均可通关',()=>{
  assert.equal(eventDate(new Date(2026,9,19)),'2026-10-19');assert.equal(eventWeek(new Date(2026,9,25,23)).key,'2026-10-19');assert.equal(eventWeek(new Date(2026,9,26)).key,'2026-10-26');
  for(const day of ['2026-10-19','2026-10-20','2027-02-28']){const {session}=createDailyPuzzle(day);assert.equal(session.initial.schemaVersion,2);assert.equal(session.dictionary.metadata.origin,'wt-workbook');for(const target of session.initial.targets)assert.equal(session.submit(target.path).accepted,true);assert.equal(session.status,'won');assert.ok(session.counts.every(count=>count===0));}
});
