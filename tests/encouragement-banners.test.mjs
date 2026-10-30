import test from 'node:test';
import assert from 'node:assert/strict';
import {EncouragementBanners,ENCOURAGEMENT_TIMING} from '../dist/encouragement-banners.js';

function fixture(options={}){
  let now=0,id=0;const jobs=new Map(),shown=[],idle=[];
  const banners=new EncouragementBanners({reducedMotion:()=>false,show:kind=>shown.push({kind,at:now}),onIdle:session=>idle.push(session),setTimer:(fn,delay)=>{const key=++id;jobs.set(key,{at:now+delay,fn});return key;},clearTimer:key=>jobs.delete(key),...options});
  return {banners,shown,idle,get pending(){return jobs.size;},advance(ms){const end=now+ms;while(true){const next=[...jobs].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;jobs.delete(next[0]);next[1].fn();}now=end;}};
}
const correct={accepted:true};

test('只累计新的正确目标词；错误清零，重复词和额外词不刷次数',()=>{
  const f=fixture(),session={status:'playing'};
  f.banners.record(session,correct);f.banners.record(session,correct);
  f.banners.record(session,{accepted:false,reason:'extra-word'});
  f.banners.record(session,{accepted:false,reason:'already-completed'});
  assert.equal(f.banners.streak,2);assert.equal(f.shown.length,0);
  f.banners.record(session,{accepted:false,reason:'not-target'});
  assert.equal(f.banners.streak,0);
  f.banners.record(session,correct);f.banners.record(session,correct);assert.equal(f.shown.length,0);
  f.banners.record(session,correct);f.advance(ENCOURAGEMENT_TIMING.streakDelay);assert.deepEqual(f.shown,[{kind:'streak',at:ENCOURAGEMENT_TIMING.streakDelay}]);
  f.banners.dismissStreak();
  for(let i=0;i<3;i++)f.banners.record(session,correct);
  f.advance(ENCOURAGEMENT_TIMING.streakDelay);assert.equal(f.shown.length,2);assert.equal(f.banners.streak,6);
});

test('第三次正确后先等目标开始落字，180ms 后才显示连对横幅',()=>{
  const f=fixture(),session={status:'playing'};
  for(let i=0;i<3;i++)f.banners.record(session,correct);
  f.advance(179);assert.equal(f.shown.length,0);assert.equal(f.banners.isRunning(session),true);
  f.advance(1);assert.deepEqual(f.shown,[{kind:'streak',at:180}]);
  f.advance(ENCOURAGEMENT_TIMING.streak-1);assert.equal(f.banners.isRunning(session),true);
  f.advance(1);assert.equal(f.banners.isRunning(session),false);assert.equal(f.pending,0);
});

test('第三次正确同时通关时，绿色横幅后排入红色横幅，播完才释放碎裂',()=>{
  const f=fixture(),session={status:'playing'};
  for(let i=0;i<3;i++)f.banners.record(session,correct);
  session.status='won';f.advance(995);assert.equal(f.banners.complete(session),true);
  assert.equal(f.banners.complete(session),false);
  const streakEnd=ENCOURAGEMENT_TIMING.streakDelay+ENCOURAGEMENT_TIMING.streak;
  f.advance(streakEnd-996);assert.equal(f.shown.length,1);assert.equal(f.idle.length,0);
  f.advance(1);assert.deepEqual(f.shown,[{kind:'streak',at:ENCOURAGEMENT_TIMING.streakDelay},{kind:'complete',at:streakEnd}]);
  f.advance(ENCOURAGEMENT_TIMING.complete-1);assert.equal(f.banners.isRunning(session),true);assert.equal(f.idle.length,0);
  f.advance(1);assert.equal(f.banners.isRunning(session),false);assert.deepEqual(f.idle,[session]);assert.equal(f.pending,0);
});

test('通关横幅只播一次，切回已完成会话也不重复',()=>{
  const f=fixture(),session={status:'playing'};
  assert.equal(f.banners.complete(session),false);session.status='won';assert.equal(f.banners.complete(session),true);
  f.advance(ENCOURAGEMENT_TIMING.complete);assert.equal(f.banners.complete(session),false);
  f.banners.sync({status:'playing'});f.banners.sync(session);
  assert.equal(f.banners.complete(session),false);assert.equal(f.shown.length,1);
});

test('切关取消队列和延迟，旧会话不会推动新关结算',()=>{
  const f=fixture(),first={status:'playing'};
  for(let i=0;i<3;i++)f.banners.record(first,correct);
  first.status='won';f.banners.complete(first);
  const second={status:'playing'};f.banners.sync(second);f.advance(10000);
  assert.equal(f.pending,0);assert.equal(f.banners.streak,0);assert.deepEqual(f.idle,[]);assert.equal(f.shown.length,0);
  assert.equal(f.banners.isRunning(second),false);
});

test('开始下一次连接可收起连对横幅，但不能提前结束通关横幅',()=>{
  const f=fixture(),session={status:'playing'};
  for(let i=0;i<3;i++)f.banners.record(session,correct);
  f.banners.dismissStreak();assert.equal(f.banners.isRunning(session),false);assert.equal(f.banners.streak,3);
  f.advance(ENCOURAGEMENT_TIMING.streakDelay);assert.equal(f.shown.length,0);assert.equal(f.pending,0);
  session.status='won';f.banners.complete(session);f.banners.dismissStreak();assert.equal(f.banners.isRunning(session),true);
});

test('减弱动态或页面不可见时不阻塞完成流程；隐藏时取消后不回放旧横幅',()=>{
  for(const options of [{reducedMotion:()=>true},{isVisible:()=>false}]){
    const f=fixture(options),session={status:'playing'};
    for(let i=0;i<3;i++)f.banners.record(session,correct);
    session.status='won';assert.equal(f.banners.complete(session),false);
    assert.equal(f.banners.isRunning(session),false);assert.equal(f.shown.length,0);assert.equal(f.pending,0);
  }
  const f=fixture(),session={status:'won'};f.banners.complete(session);f.banners.cancel();f.advance(5000);
  assert.equal(f.banners.complete(session),false);assert.deepEqual(f.idle,[]);assert.equal(f.pending,0);
});
