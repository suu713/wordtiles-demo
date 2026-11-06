import test from 'node:test';
import assert from 'node:assert/strict';
import {WordReadout,WORD_FEEDBACK_TIMING} from '../dist/word-readout.js';

function fixture(){
  let now=0,id=0,expired=0;const jobs=new Map(),classes=new Set(),animations=[];
  const element={children:[],ownerDocument:{createElement:()=>({textContent:''})},classList:{add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),contains:name=>classes.has(name)},
    get textContent(){return this.children.map(child=>child.textContent).join('');},replaceChildren(...children){this.children=children;},
    animate(){const animation={cancelled:false,cancel(){this.cancelled=true;}};animations.push(animation);return animation;}};
  const readout=new WordReadout(element,{reducedMotion:()=>false,onExpire:()=>expired++,setTimer:(fn,ms)=>{const key=++id;jobs.set(key,{fn,at:now+ms});return key;},clearTimer:key=>jobs.delete(key)});
  return {readout,element,animations,get expired(){return expired;},get pending(){return jobs.size;},advance(ms){now+=ms;for(const [key,job] of [...jobs])if(job.at<=now){jobs.delete(key);job.fn();}}};
}

test('错误词在重绘中保留到展示结束，随后自动清空，没有目标或次数写入',()=>{
  const f=fixture();f.readout.select('KAN');f.readout.reject('KAN');f.readout.select('');
  assert.equal(f.element.textContent,'KAN');assert.equal(f.element.classList.contains('rejected-word'),true);
  f.advance(WORD_FEEDBACK_TIMING.rejected-1);assert.equal(f.element.textContent,'KAN');f.advance(1);
  assert.equal(f.element.textContent,'');assert.equal(f.expired,1);assert.equal(f.pending,0);
});

test('新连接立即接管错误词框，旧倒计时不会清掉正在连接的新单词',()=>{
  const f=fixture();f.readout.reject('KAN');f.advance(100);f.readout.select('K');f.readout.select('KE');
  f.advance(2000);assert.equal(f.element.textContent,'KE');assert.equal(f.expired,0);assert.equal(f.readout.mode,'');
  assert.equal(f.element.classList.contains('rejected-word'),false);assert.ok(f.animations[0].cancelled);
});

test('重复词使用独立短提示，同词再次操作会重新计时，退出清理后不会回写界面',()=>{
  const f=fixture();f.readout.repeat('KEN');assert.equal(f.element.classList.contains('repeated-word'),true);assert.equal(f.element.classList.contains('rejected-word'),false);
  f.advance(300);f.readout.repeat('KEN');f.advance(WORD_FEEDBACK_TIMING.repeated-1);assert.equal(f.element.textContent,'KEN');
  f.readout.clear();f.advance(2000);assert.equal(f.element.textContent,'');assert.equal(f.expired,0);assert.equal(f.pending,0);
});

test('逐字节点保留真实字框；重复布局不重启动画，提交前可固定文字几何位置',()=>{
  const f=fixture();f.readout.select('EYE');const nodes=f.element.children;
  assert.deepEqual(nodes.map(node=>node.textContent),['E','Y','E']);f.readout.select('EYE');assert.equal(f.element.children,nodes);assert.equal(f.animations.length,1);
  f.readout.freeze();assert.equal(f.animations[0].cancelled,true);assert.equal(f.element.textContent,'EYE');
});
