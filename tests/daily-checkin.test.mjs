import test from 'node:test';
import assert from 'node:assert/strict';
import {createDailyCheckin,CHECKIN_KEY} from '../dist/core/daily-checkin.js';
function store(days=[]){const values=new Map([[CHECKIN_KEY,JSON.stringify({version:1,days})]]);return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};}

test('同一天重复签到与重载只记一次，未签到不自动制造记录',()=>{
  const storage=store(),now=()=>new Date(2026,10,4,12),a=createDailyCheckin(storage,{now});
  assert.equal(a.snapshot().signed,false);assert.equal(a.snapshot().streak,0);
  assert.equal(a.checkIn().added,true);assert.equal(a.checkIn().added,false);
  const b=createDailyCheckin(storage,{now});assert.equal(b.snapshot().streak,1);assert.equal(b.snapshot().signed,true);
  assert.deepEqual(JSON.parse(storage.getItem(CHECKIN_KEY)).days,['2026-11-04']);
});

test('连续天数按本地日期计算，跨月、跨年与中断正确',()=>{
  let today=new Date(2026,11,31,23,59);const storage=store(['2026-12-30']),progress=createDailyCheckin(storage,{now:()=>today});
  assert.equal(progress.snapshot().streak,1);assert.equal(progress.checkIn().streak,2);
  today=new Date(2027,0,1,0,1);assert.equal(progress.snapshot().signed,false);assert.equal(progress.checkIn().streak,3);
  today=new Date(2027,0,3,12);assert.equal(progress.snapshot().streak,0);assert.equal(progress.checkIn().streak,1);
});

test('未满七天始终今天在首位，日期顺排且礼物仍对应真实周三五日',()=>{
  const progress=createDailyCheckin(store(['2026-11-02']),{now:()=>new Date(2026,10,3,12)}),result=progress.checkIn();
  assert.equal(result.streak,2);assert.equal(result.totalDays,2);assert.equal(result.weekMode,'today-first');
  assert.equal(result.week[0].date,'2026-11-03');assert.equal(result.week[6].date,'2026-11-09');
  assert.deepEqual(result.week.map(day=>day.label),['Tue','Wed','Thu','Fri','Sat','Sun','Mon']);
  assert.deepEqual(result.week.map(day=>day.signed),[true,false,false,false,false,false,false]);
  assert.deepEqual(result.week.map(day=>day.today),[true,false,false,false,false,false,false]);
  assert.deepEqual(result.week.map(day=>day.gift),[false,true,false,true,false,true,false]);
});

test('第七次签到后按周一至周日排序，第六次和未签到前仍以今天开始',()=>{
  const storage=store(['2026-10-29','2026-10-30','2026-10-31','2026-11-01','2026-11-02','2026-11-03']);
  const progress=createDailyCheckin(storage,{now:()=>new Date(2026,10,4,12)});
  assert.equal(progress.snapshot().totalDays,6);assert.equal(progress.snapshot().week[0].today,true);
  const seventh=progress.checkIn();assert.equal(seventh.totalDays,7);assert.equal(seventh.weekMode,'calendar');
  assert.deepEqual(seventh.week.map(day=>day.label),['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);
  assert.equal(seventh.week[0].date,'2026-11-02');assert.equal(seventh.week[2].today,true);
  assert.deepEqual(createDailyCheckin(storage,{now:()=>new Date(2026,10,4,12)}).snapshot().week,seventh.week);
});

test('累计满七天后中断连续签到仍保留自然周排序，未来日期不计入累计门槛',()=>{
  const history=['2026-10-01','2026-10-03','2026-10-06','2026-10-10','2026-10-14','2026-10-18','2026-11-04'];
  const progress=createDailyCheckin(store(history),{now:()=>new Date(2026,10,4,12)});
  assert.equal(progress.snapshot().streak,1);assert.equal(progress.snapshot().weekMode,'calendar');
  const partial=createDailyCheckin(store(['2026-11-03',...history.map(day=>day.replace('2026-','2027-'))]),{now:()=>new Date(2026,10,4,12)});
  assert.equal(partial.snapshot().totalDays,1);assert.equal(partial.snapshot().week[0].today,true);
});

test('初次周三或周日签到都没有今天之前的空位',()=>{
  for(const day of [4,8]){
    const progress=createDailyCheckin(store(),{now:()=>new Date(2026,10,day,12)}),before=progress.snapshot();
    assert.equal(before.week[0].today,true);assert.equal(before.week[0].signed,false);
    const result=progress.checkIn();assert.equal(result.week[0].signed,true);assert.equal(result.week[0].date,result.today);
  }
});

test('周日到周一换周不打断连续签到',()=>{
  const progress=createDailyCheckin(store(['2026-11-07','2026-11-08']),{now:()=>new Date(2026,10,9,12)}),result=progress.checkIn();
  assert.equal(result.streak,3);assert.equal(result.week[0].today,true);assert.equal(result.week[0].date,'2026-11-09');
});

test('损坏和无效日期被排除；无存储时维持当前会话但不假称已保存',()=>{
  const s=store(['2026-02-30','invalid','2026-11-03','2026-11-03']);
  const p=createDailyCheckin(s,{now:()=>new Date(2026,10,4,12)});assert.equal(p.checkIn().streak,2);
  const broken=createDailyCheckin({getItem:()=>'{broken',setItem:()=>{throw Error('full');}},{now:()=>new Date(2026,10,4,12)});
  assert.equal(broken.checkIn().saved,false);assert.equal(broken.snapshot().streak,1);assert.equal(broken.checkIn().added,false);
  broken.reload();assert.equal(broken.snapshot().streak,1);
  const memory=createDailyCheckin(undefined,{now:()=>new Date(2026,10,4,12)});memory.checkIn();memory.reload();assert.equal(memory.snapshot().signed,true);
});

test('另一个页面签到后可重新读取同一份记录',()=>{
  const s=store(),options={now:()=>new Date(2026,10,4,12)},a=createDailyCheckin(s,options),b=createDailyCheckin(s,options);
  a.checkIn();b.reload();assert.equal(b.snapshot().signed,true);assert.equal(b.checkIn().added,false);
});
