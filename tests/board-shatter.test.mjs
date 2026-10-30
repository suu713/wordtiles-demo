import test from 'node:test';
import assert from 'node:assert/strict';
import {BoardShatter,TILE_PIECES,SHATTER_DURATION,SHATTER_TIMING,createTilePieces,createShardMotion,sampleShardMotion} from '../dist/board-shatter.js';

function fixture(options={}){
  let now=0,key=0,removed=0;const timers=new Map(),frames=new Map(),captured=[];
  const tiles=[{cell:0},{cell:1},{cell:2}],panel={append(){}};
  const shatter=new BoardShatter({reducedMotion:()=>false,createLayer:slots=>{captured.push(slots);return {layer:{remove:()=>removed++},particles:options.particles||[]};},setTimer:(fn,delay)=>{const id=++key;timers.set(id,{at:now+delay,fn});return id;},clearTimer:id=>timers.delete(id),requestFrame:fn=>{const id=++key;frames.set(id,fn);return id;},cancelFrame:id=>frames.delete(id),now:()=>now,...options});
  return {shatter,tiles,panel,captured,get removed(){return removed;},get pendingFrames(){return frames.size;},advance(ms){now+=ms;const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(now);for(const [id,job] of [...timers])if(job.at<=now){timers.delete(id);job.fn();}}};
}
test('碎片多边形覆盖整个瓷砖，字母与底图一起分裂',()=>{
  assert.equal(TILE_PIECES.length,32);
  let total=0;
  for(const polygon of TILE_PIECES){
    assert.ok(polygon.every(point=>point.every(value=>value>=0&&value<=100)));
    const area=Math.abs(polygon.reduce((sum,p,i)=>{const next=polygon[(i+1)%polygon.length];return sum+p[0]*next[1]-next[0]*p[1];},0))/2;
    assert.ok(area>0);total+=area;
  }
  assert.equal(total,10000);
});
test('不同大小格子都细分成完整的小碎块，没有大片残留或缺口',()=>{
  for(const divisions of [2,3,4,5]){
    const pieces=createTilePieces(divisions);let area=0;
    for(const polygon of pieces){
      const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]);
      assert.ok(Math.max(...xs)-Math.min(...xs)<=Math.ceil(130/divisions));
      assert.ok(Math.max(...ys)-Math.min(...ys)<=Math.ceil(130/divisions));
      area+=Math.abs(polygon.reduce((sum,p,i)=>{const next=polygon[(i+1)%polygon.length];return sum+p[0]*next[1]-next[0]*p[1];},0))/2;
    }
    assert.equal(area,10000);
  }
});
test('只碎裂从正次数降到零的棋盘格；多次使用、空格及重复渲染不误触发',()=>{
  const f=fixture(),session={status:'playing',counts:[1,2,0]};
  assert.equal(f.shatter.sync(session,f.tiles,f.panel),false);
  session.counts=[0,1,0];assert.equal(f.shatter.sync(session,f.tiles,f.panel),true);
  assert.deepEqual(f.captured,[[f.tiles[0]]]);assert.equal(f.shatter.sync(session,f.tiles,f.panel),false);
  assert.equal(session.status,'playing');assert.deepEqual(session.counts,[0,1,0]);
  f.advance(SHATTER_DURATION);assert.equal(f.removed,1);assert.equal(f.shatter.isRunning(session),false);
});
test('快速连续耗尽新格子时保留前一批碎块，通关只碎裂最后耗尽的棋盘格',()=>{
  const f=fixture(),session={status:'playing',counts:[1,2,0]};f.shatter.sync(session,f.tiles,f.panel);
  session.counts=[0,1,0];f.shatter.sync(session,f.tiles,f.panel);f.advance(200);
  session.counts=[0,0,0];session.status='won';f.shatter.sync(session,f.tiles,f.panel);
  assert.deepEqual(f.captured,[[f.tiles[0]],[f.tiles[1]]]);assert.equal(f.shatter.active.size,2);
  f.advance(SHATTER_DURATION-200);assert.equal(f.shatter.active.size,1);
  f.advance(200);assert.equal(f.shatter.active.size,0);assert.equal(f.removed,2);
});
test('切关和返回大厅清理所有碎块，载入存量进度不回放',()=>{
  const f=fixture(),old={status:'playing',counts:[1,1,0]};
  f.shatter.sync(old,f.tiles,f.panel);old.counts=[0,1,0];f.shatter.sync(old,f.tiles,f.panel);
  const next={status:'playing',counts:[0,2,1]};assert.equal(f.shatter.sync(next,f.tiles,f.panel),false);
  f.advance(SHATTER_DURATION+100);assert.equal(f.removed,1);assert.equal(f.captured.length,1);
  assert.equal(f.pendingFrames,0);
  assert.equal(f.shatter.isRunning(undefined),false);
  next.counts=[0,0,1];assert.equal(f.shatter.sync(next,f.tiles,f.panel),true);f.shatter.cancel();
  assert.equal(f.pendingFrames,0);assert.equal(f.shatter.isRunning(next),false);
});

test('初速度按碎片位置向四周发散，每片都有独立角速度及1至1.5秒寿命',()=>{
  const motions=TILE_PIECES.map(points=>createShardMotion(points,405,720,()=>.5));
  assert.ok(motions.some(m=>m.vx<0)&&motions.some(m=>m.vx>0));
  assert.ok(motions.some(m=>m.vy<0)&&motions.some(m=>m.vy>0));
  for(const [index,motion] of motions.entries()){
    const points=TILE_PIECES[index],cx=points.reduce((sum,p)=>sum+p[0],0)/points.length-50,cy=points.reduce((sum,p)=>sum+p[1],0)/points.length-50;
    if(Math.hypot(cx,cy)>=8)assert.ok(cx*motion.vx+cy*motion.vy>0);
    assert.ok(Math.abs(motion.angularVelocity)>=90);assert.ok(motion.gravity>0);
  }
  for(const value of [0,.17,.6,1]){
    const motion=createShardMotion(TILE_PIECES[0],405,720,()=>value);
    assert.ok(motion.lifetime>=1000&&motion.lifetime<=1500);
  }
});

test('匀速水平运动、持续重力加速和匀速旋转；上抛碎块过顶点后自然下落',()=>{
  const motion=createShardMotion(TILE_PIECES[0],405,720,()=>.5);
  const [a,b,c]=[200,400,600].map(age=>sampleShardMotion(motion,age));
  assert.ok(Math.abs((c.x-b.x)-(b.x-a.x))<1e-9);
  assert.ok(Math.abs(c.y-2*b.y+a.y-motion.gravity*.2**2)<1e-9);
  assert.ok(Math.abs((c.angle-b.angle)-(b.angle-a.angle))<1e-9);
  assert.ok(motion.vy<0);
  const peak=-motion.vy/motion.gravity*1000,top=sampleShardMotion(motion,peak);
  assert.ok(sampleShardMotion(motion,peak-30).y>top.y);
  assert.ok(sampleShardMotion(motion,peak+30).y>top.y);
  assert.equal(sampleShardMotion(motion,motion.lifetime*.8).opacity,1);
  assert.equal(sampleShardMotion(motion,motion.lifetime).opacity,0);
});

test('延迟出生后按实际寿命移除粒子，低帧率不延长寿命',()=>{
  let removed=0;const element={style:{},remove:()=>removed++};
  const particle={element,delay:100,lifetime:1100,vx:100,vy:-100,gravity:1000,angularVelocity:-180};
  const f=fixture({particles:[particle]}),session={status:'playing',counts:[1,0,0]};
  f.shatter.sync(session,f.tiles,f.panel);session.counts=[0,0,0];f.shatter.sync(session,f.tiles,f.panel);f.advance(50);assert.equal(element.style.transform,undefined);
  f.advance(650);assert.match(element.style.transform,/translate\(60px,120px\) rotate\(-108deg\)/);
  f.advance(500);assert.equal(removed,1);assert.equal(f.pendingFrames,0);
  f.advance(SHATTER_DURATION-1200);assert.equal(f.shatter.active.size,0);
  assert.equal(SHATTER_DURATION,SHATTER_TIMING.maxLife+SHATTER_TIMING.wave+SHATTER_TIMING.settle);
});
test('减弱动态、隐藏页面或没有可见尺寸时直接清格，不创建碎块',()=>{
  for(const options of [{reducedMotion:()=>true},{isVisible:()=>false},{createLayer:()=>null}]){
    const f=fixture(options),session={status:'playing',counts:[1,1,0]};f.shatter.sync(session,f.tiles,f.panel);
    session.counts=[0,0,0];assert.equal(f.shatter.sync(session,f.tiles,f.panel),false);assert.equal(f.shatter.isRunning(session),false);
    assert.equal(f.pendingFrames,0);
  }
});
