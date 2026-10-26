import test from 'node:test';
import assert from 'node:assert/strict';
import {createDailyPuzzle,dailyPuzzleRecordId} from '../dist/core/daily-puzzle.js';
import {WORD_BANK_ORIGIN} from '../dist/core/dictionary-banks.js';
import {createEventProgress} from '../dist/core/event-progress.js';

test('每日谜题仅由 WT 工作簿生成，同一天可复现且能真实通关',()=>{
  const day='2026-10-20',first=createDailyPuzzle(day),again=createDailyPuzzle(day,first.seed);
  assert.equal(first.levelId,dailyPuzzleRecordId(day));
  assert.notEqual(first.seed,`daily-${day}`);
  assert.equal(first.session.dictionary.metadata.origin,WORD_BANK_ORIGIN);
  assert.deepEqual(first.session.initial,again.session.initial);
  for(const target of first.session.initial.targets)assert.equal(first.session.submit(target.path).accepted,true);
  assert.equal(first.session.status,'won');
  assert.ok(first.session.counts.every(count=>count===0));
});

test('每日随机种子写入本地进度，刷新后可重建同一棋盘',()=>{
  const day='2026-10-20',first=createDailyPuzzle(day),values=new Map();
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const progress=createEventProgress(storage,{now:()=>new Date(2026,9,20)});
  progress.saveDaily({levelId:first.levelId,seed:first.seed,gemCells:[0,1,2],paths:[],gemCount:0,finished:false});
  const restored=createEventProgress(storage,{now:()=>new Date(2026,9,20)}),again=createDailyPuzzle(day,restored.daily().seed);
  assert.equal(restored.daily().seed,first.seed);
  assert.deepEqual(again.session.initial,first.session.initial);
});

test('旧来源的当日谜题存档被工作簿题替换，同时保留已领取的宝石进度',()=>{
  const storage=new Map(),local={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  const events=createEventProgress(local,{now:()=>new Date(2026,9,20)});
  events.saveDaily({levelId:'old-package-level',seed:'old-fixed-seed',gemCells:[0,1,2],paths:[[0,1]],gemCount:1,finished:true});
  const daily=createDailyPuzzle('2026-10-20');
  events.saveDaily({levelId:daily.levelId,seed:daily.seed,gemCells:[2,3,4],paths:[],gemCount:0,finished:false});
  assert.equal(events.daily().levelId,daily.levelId);
  assert.equal(events.daily().seed,daily.seed);
  assert.deepEqual(events.daily().paths,[]);
  assert.equal(events.daily().finished,false);
  assert.equal(events.snapshot().gems,1);
});
