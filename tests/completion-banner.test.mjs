import test from 'node:test';
import assert from 'node:assert/strict';
import {CompletionBanner,COMPLETION_BANNER_DURATION} from '../dist/completion-banner.js';
const session=()=>({status:'playing',initial:{targets:[{word:'CAT'},{word:'DOG'}]},completed:new Set()});
function fixture(options={}){
  let time=0,id=0;const timers=new Map(),shown=[],hidden=[],idle=[];
  const effect=new CompletionBanner({view:{show:(art,text,duration)=>shown.push({art:art.id,text,duration}),hide:()=>hidden.push(time)},random:()=>0,
    reducedMotion:()=>false,onIdle:s=>idle.push(s),setTimer:(fn,delay)=>{const key=++id;timers.set(key,{at:time+delay,fn});return key;},clearTimer:key=>timers.delete(key),...options});
  return {effect,shown,hidden,idle,get pending(){return timers.size;},advance(ms){time+=ms;for(const [key,job]of [...timers])if(job.at<=time){timers.delete(key);job.fn();}}};
}
function finish(f,s){s.completed=new Set(['CAT','DOG']);s.status='won';return f.effect.play(s);}
test('全部目标完成后只播放一次，播完才通知结算继续',()=>{
  const f=fixture(),s=session();f.effect.sync(s);assert.equal(f.effect.play(s),false);assert.equal(finish(f,s),true);
  assert.equal(f.effect.play(s),true);assert.equal(f.shown.length,1);assert.equal(f.shown[0].text,'Level Complete!');assert.equal(f.idle.length,0);
  f.advance(COMPLETION_BANNER_DURATION-1);assert.equal(f.effect.isRunning(s),true);f.advance(1);
  assert.equal(f.effect.isRunning(s),false);assert.deepEqual(f.idle,[s]);assert.equal(f.effect.play(s),false);assert.equal(f.shown.length,1);
});
test('清盘兜底但目标未找齐、异常状态和载入已完成关卡不回放',()=>{
  const f=fixture(),s=session();f.effect.sync(s);s.status='won';s.completed.add('CAT');assert.equal(f.effect.play(s),false);
  s.status='anomaly';s.completed.add('DOG');assert.equal(f.effect.play(s),false);
  const restored=session();restored.status='won';restored.completed=new Set(['CAT','DOG']);assert.equal(f.effect.play(restored),false);assert.equal(f.shown.length,0);
});
test('隐藏画面、机器试玩或减弱动态时跳过，不阻塞结算和补播',()=>{
  for(const options of [{isVisible:()=>false},{reducedMotion:()=>true}]){
    const f=fixture(options),s=session();f.effect.sync(s);assert.equal(finish(f,s),false);assert.equal(f.pending,0);assert.equal(f.shown.length,0);assert.equal(f.effect.play(s),false);
  }
});
test('离开或切关会取消旧计时器，不把旧关回调带到新关',()=>{
  const f=fixture(),s=session();f.effect.sync(s);finish(f,s);f.effect.cancel();assert.equal(f.pending,0);f.advance(5000);assert.equal(f.idle.length,0);assert.equal(f.effect.play(s),false);
  const second=session();f.effect.sync(second);finish(f,second);f.effect.sync(session());f.advance(5000);assert.equal(f.idle.length,0);assert.equal(f.pending,0);
});
test('四款每轮各用一次，轮次交界不连续重复',()=>{
  const f=fixture();for(let i=0;i<12;i++){const s=session();f.effect.sync(s);finish(f,s);f.advance(COMPLETION_BANNER_DURATION);}
  for(let i=0;i<12;i+=4)assert.equal(new Set(f.shown.slice(i,i+4).map(item=>item.art)).size,4);
  assert.ok(f.shown.every((item,index)=>!index||item.art!==f.shown[index-1].art));
});
