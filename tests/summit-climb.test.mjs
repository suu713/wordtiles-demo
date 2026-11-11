import test from 'node:test';
import assert from 'node:assert/strict';
import {SUMMIT_KEY,SUMMIT_STEPS,createSummitProgress} from '../dist/core/summit-progress.js';
import {SummitClimb} from '../dist/summit-climb.js';
import {SUMMIT_TIMING,SUMMIT_DURATION,summitFrame,summitPoint,summitCoin} from '../dist/summit-motion.js';
import {DATA_RESET_KEY} from '../dist/core/app-data.js';

function memory(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
function session(){return {status:'playing',completed:new Set(),initial:{targets:[{word:'CAT'},{word:'DOG'}]}};}
function fixture(options={}){
  const storage=memory(),progress=createSummitProgress(storage),shown=[],hidden=[],idle=[];let id=0;
  const effect=new SummitClimb({progress,view:{show:(award,mode)=>shown.push({award,mode}),hide:()=>hidden.push(true)},id:()=>String(++id),reducedMotion:()=>false,onIdle:s=>idle.push(s),...options});
  return {storage,progress,effect,shown,hidden,idle};
}
function win(f,s){s.completed=new Set(['CAT','DOG']);s.status='won';return f.effect.play(s);}

test('真实通关只推进一段并奖励一次；重播展示和继续不会再加进度或金币',()=>{
  const f=fixture(),s=session();f.effect.sync(s);assert.equal(win(f,s),true);assert.equal(f.effect.play(s),true);
  assert.equal(f.progress.snapshot().totalSteps,1);assert.equal(f.progress.snapshot().coins,15);assert.equal(f.shown.length,1);
  f.effect.replay();f.effect.replay();assert.equal(f.shown.length,3);assert.equal(f.progress.snapshot().coins,15);
  assert.equal(f.effect.isRunning(s),true);assert.equal(f.idle.length,0);f.effect.finish();
  assert.equal(f.effect.isRunning(s),false);assert.deepEqual(f.idle,[s]);assert.equal(f.effect.play(s),false);
});

test('预览可连续爬到峰顶并开始下一座山，始终不写入真实登山进度',()=>{
  const f=fixture();assert.equal(f.effect.preview(),true);
  for(let i=1;i<SUMMIT_STEPS;i++)assert.equal(f.effect.advancePreview(),true);
  const peak=f.shown.at(-1).award;assert.equal(peak.toStep,12);assert.equal(peak.peak,true);assert.equal(peak.peaks,1);
  f.effect.advancePreview();assert.equal(f.shown.at(-1).award.fromStep,0);assert.equal(f.shown.at(-1).award.toStep,1);
  assert.equal(f.progress.snapshot().totalSteps,0);assert.equal(f.progress.snapshot().coins,0);assert.equal(f.storage.getItem(SUMMIT_KEY),null);
  f.effect.finish();assert.deepEqual(f.idle,[]);
});

test('首次载入已完成关卡、目标未找齐的清盘兜底、机器隐藏界面均不触发登山',()=>{
  const f=fixture(),restored=session();restored.status='won';restored.completed=new Set(['CAT','DOG']);assert.equal(f.effect.play(restored),false);
  const partial=session();f.effect.sync(partial);partial.status='won';partial.completed.add('CAT');assert.equal(f.effect.play(partial),false);
  const machine=fixture({isVisible:()=>false}),s=session();machine.effect.sync(s);assert.equal(win(machine,s),false);assert.equal(machine.progress.snapshot().totalSteps,0);
  assert.equal(f.progress.snapshot().totalSteps,0);assert.equal(f.shown.length,0);
});

test('切关和离开取消展示，不弹回旧结算；减弱动态仍记录真实通关并立即继续',()=>{
  const f=fixture(),s=session();f.effect.sync(s);win(f,s);f.effect.sync(session());
  assert.equal(f.effect.isRunning(s),false);assert.equal(f.hidden.length,1);assert.deepEqual(f.idle,[]);assert.equal(f.effect.play(s),false);
  const reduced=fixture({reducedMotion:()=>true}),r=session();reduced.effect.sync(r);assert.equal(win(reduced,r),false);
  assert.equal(reduced.progress.snapshot().totalSteps,1);assert.equal(reduced.shown.length,0);
  f.effect.prepareDataReset();assert.equal(f.effect.preview(),false);
});

test('跨刷新恢复进度、相同奖励标识去重；独立页面推进时读取已有最新进度',()=>{
  const storage=memory(),a=createSummitProgress(storage),b=createSummitProgress(storage);
  a.award('first');assert.equal(a.award('first'),null);b.award('second');
  const restored=createSummitProgress(storage);assert.equal(restored.snapshot().totalSteps,2);assert.equal(restored.snapshot().coins,30);
  for(let i=2;i<12;i++)restored.award('stage-'+i);
  assert.equal(restored.snapshot().totalSteps,12);assert.equal(restored.snapshot().coins,180);
  const next=restored.award('new-mountain');assert.equal(next.fromStep,0);assert.equal(next.toStep,1);assert.equal(next.peaks,1);
});

test('存储写满仍保留本次连续攀登；损坏数据不接受，清除数据后旧实例不能回写',()=>{
  const storage=memory();storage.setItem(SUMMIT_KEY,JSON.stringify({version:1,totalSteps:-1,coins:99999999999,recent:[]}));
  const p=createSummitProgress(storage);assert.equal(p.snapshot().totalSteps,0);p.award('one');
  const write=storage.setItem;storage.setItem=()=>{throw Error('full');};p.award('two');p.award('three');
  assert.equal(p.snapshot().totalSteps,3);assert.equal(p.snapshot().coins,45);assert.equal(p.persistent,false);
  storage.setItem=write;storage.setItem(DATA_RESET_KEY,'reset');assert.equal(p.award('late'),null);
});

test('山路在多次转弯中持续上升，起点和终点准确，人物随山路切换朝向',()=>{
  const first=summitPoint(0),last=summitPoint(1);assert.equal(first.x,110);assert.equal(first.y,445);assert.equal(last.x,302);assert.equal(last.y,104);
  let y=first.y;const directions=new Set();
  for(let i=0;i<=200;i++){const p=summitPoint(i/200);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(p.y<=y+.000001);assert.ok(p.x>=100&&p.x<=470);y=p.y;directions.add(p.facing);}
  assert.deepEqual([...directions].sort(),[-1,1]);assert.deepEqual(summitPoint(-10),first);assert.deepEqual(summitPoint(10),last);
});

test('金币等攀登到位后再出发，到达顶部才更新数字，结束后全部粒子消失',()=>{
  const award={fromStep:2,toStep:3,coinsBefore:30,coinsAfter:45,reward:15};
  const intro=summitFrame(0,award);assert.equal(intro.walking,false);assert.equal(intro.displayCoins,30);
  const walk=summitFrame(SUMMIT_TIMING.intro+500,award);assert.equal(walk.walking,true);assert.ok(walk.fraction>2/12&&walk.fraction<3/12);assert.equal(walk.rewardStarted,false);
  const rewardAt=SUMMIT_TIMING.intro+SUMMIT_TIMING.walk+SUMMIT_TIMING.rewardPause;
  assert.equal(summitFrame(rewardAt+SUMMIT_TIMING.coinFlight-1,award).displayCoins,30);
  assert.ok(summitFrame(rewardAt+SUMMIT_TIMING.coinFlight,award).displayCoins>30);
  const end=summitFrame(SUMMIT_DURATION,award);assert.equal(end.done,true);assert.equal(end.fraction,3/12);assert.equal(end.displayCoins,45);assert.ok(end.arrivals.every(p=>p===1));
  const source={x:120,y:400},destination={x:280,y:40};assert.equal(summitCoin(source,destination,0).opacity,0);
  const finish=summitCoin(source,destination,1);assert.equal(finish.x,280);assert.equal(finish.y,40);assert.equal(finish.opacity,0);
});
