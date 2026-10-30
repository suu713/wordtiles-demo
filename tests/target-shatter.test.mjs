import test from 'node:test';
import assert from 'node:assert/strict';
import {TargetShatter,TILE_PIECES,SHATTER_DURATION} from '../dist/target-shatter.js';

function fixture(options={}){
  let now=0,key=0,removed=0;const timers=new Map(),classes=new Set(),done=[];
  const container={classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}},panel={append(){}};
  const shatter=new TargetShatter({reducedMotion:()=>false,onDone:session=>done.push(session),createLayer:()=>({remove:()=>removed++}),setTimer:(fn,delay)=>{const id=++key;timers.set(id,{at:now+delay,fn});return id;},clearTimer:id=>timers.delete(id),...options});
  return {shatter,container,panel,classes,done,get removed(){return removed;},advance(ms){now+=ms;for(const [id,job] of [...timers])if(job.at<=now){timers.delete(id);job.fn();}}};
}
test('碎片多边形覆盖整个瓷砖，字母与底图一起分裂',()=>{
  assert.ok(TILE_PIECES.length>=6);
  let total=0;
  for(const polygon of TILE_PIECES){
    assert.ok(polygon.every(point=>point.every(value=>value>=0&&value<=100)));
    const area=Math.abs(polygon.reduce((sum,p,i)=>{const next=polygon[(i+1)%polygon.length];return sum+p[0]*next[1]-next[0]*p[1];},0))/2;
    assert.ok(area>0);total+=area;
  }
  assert.equal(total,10000);
});
test('所有词完成后只碎裂一次，完整播完再释放结算窗口',()=>{
  const f=fixture(),session={status:'playing'};
  assert.equal(f.shatter.play(session,f.container,f.panel),false);
  session.status='won';assert.equal(f.shatter.play(session,f.container,f.panel),true);
  assert.equal(f.shatter.play(session,f.container,f.panel),false);assert.equal(f.shatter.isRunning(session),true);
  assert.equal(f.classes.has('targets-cleared'),true);
  f.advance(SHATTER_DURATION-1);assert.deepEqual(f.done,[]);assert.equal(f.shatter.isRunning(session),true);
  f.advance(1);assert.deepEqual(f.done,[session]);assert.equal(f.removed,1);assert.equal(f.shatter.isRunning(session),false);
  assert.equal(f.shatter.play(session,f.container,f.panel),false);
});
test('切关和返回大厅清理碎片，旧计时不会弹出结算',()=>{
  const f=fixture(),old={status:'won'};
  f.shatter.play(old,f.container,f.panel);f.shatter.cancel();f.advance(SHATTER_DURATION+100);
  assert.deepEqual(f.done,[]);assert.equal(f.classes.has('targets-cleared'),false);assert.equal(f.removed,1);
  assert.equal(f.shatter.isRunning(undefined),false);
  const next={status:'won'};assert.equal(f.shatter.play(next,f.container,f.panel),true);f.advance(SHATTER_DURATION);assert.deepEqual(f.done,[next]);
});
test('减弱动态、隐藏页面或没有可见尺寸时直接进入静态结算',()=>{
  for(const options of [{reducedMotion:()=>true},{isVisible:()=>false},{createLayer:()=>null}]){
    const f=fixture(options),session={status:'won'};
    assert.equal(f.shatter.play(session,f.container,f.panel),false);assert.equal(f.shatter.isRunning(session),false);
    assert.equal(f.classes.has('targets-cleared'),false);f.advance(SHATTER_DURATION+100);assert.deepEqual(f.done,[]);
  }
});
