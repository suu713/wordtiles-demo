import test from 'node:test';
import assert from 'node:assert/strict';
import {EncouragementBanners} from '../dist/encouragement-banners.js';
import {ENCOURAGEMENT_CONFIG as CONFIG,ENCOURAGEMENT_STORAGE_KEY} from '../dist/core/encouragement-config.js';

const WORDS=['CAT','DOG','OWL','FOX','ANT','BAT','BEE','COW','EEL','EMU','HEN','JAY','RAM','RAT','PIG','YAK','GNU','ELK'];
function session(words=WORDS){return {status:'playing',initial:{targets:words.map(word=>({word}))},completed:new Set(),bonusCompleted:new Set()};}
function storage(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};}
function fixture({startAt=0,...options}={}){
  let now=startAt,id=0;const jobs=new Map(),banners=[],icons=[],events=[],idle=[];
  const rewards=new EncouragementBanners({
    now:()=>now,random:()=>0,reducedMotion:()=>false,
    show:(scene,duration,presentation)=>{const event={scene,duration,...presentation,at:now};banners.push(event);events.push({type:'banner',...event});},
    hide:()=>events.push({type:'hide-banner',at:now}),
    showIcon:(kind,duration,presentation)=>{const event={kind,duration,...presentation,at:now};icons.push(event);events.push({type:'icon',...event});},
    hideIcon:()=>events.push({type:'hide-icon',at:now}),
    onIdle:s=>idle.push(s),setTimer:(fn,delay)=>{const key=++id;jobs.set(key,{at:now+delay,fn});return key;},clearTimer:key=>jobs.delete(key),...options,
  });
  return {rewards,banners,icons,events,idle,get pending(){return jobs.size;},advance(ms){
    const end=now+ms;
    while(true){const next=[...jobs].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;jobs.delete(next[0]);next[1].fn();}
    now=end;
  }};
}
function solve(f,s,word=null,options={}){
  word??=s.initial.targets.find(target=>!s.completed.has(target.word)).word;
  s.completed.add(word);if(s.initial.targets.every(target=>s.completed.has(target.word)))s.status='won';
  return f.rewards.record(s,{accepted:true,word},options);
}
function wrong(f,s,reason='not-target'){return f.rewards.record(s,{accepted:false,reason});}
function extra(f,s,word,isNew=true){if(isNew)s.bonusCompleted.add(word);return f.rewards.record(s,{accepted:false,reason:'extra-word',word,isNew});}
function recover(f,s){for(let i=0;i<3;i++)wrong(f,s);return solve(f,s);}
function bonus(f,s){extra(f,s,'CATS');extra(f,s,'DOGS');return extra(f,s,'OWLS');}
const scenes=f=>f.banners.map(item=>item.scene);
const settle=f=>f.advance(CONFIG.banner.durationMs+CONFIG.banner.minGapMs);

test('场景词池保留，剩一词优先于突破、长词和连击，通关不在局内词池',()=>{
  assert.deepEqual(CONFIG.priority,['almost','recovery','long','advanced','ordinary']);
  assert.deepEqual(CONFIG.scenes.ordinary.words,['Nice!','Great!','Nice Work!']);
  assert.deepEqual(CONFIG.scenes.long.words,CONFIG.scenes.advanced.words);
  assert.deepEqual(CONFIG.scenes.recovery.words,['You Got It!','Well Done!','There You Go!']);
  assert.deepEqual(CONFIG.scenes.bonus.words,['Nice Find!','Clever Find!','Bonus Word!']);
  assert.deepEqual(CONFIG.scenes.almost.words,['Almost There!','One to Go!',"You've Got This!"]);
  assert.equal(CONFIG.scenes.complete,undefined);assert.ok(Object.isFrozen(CONFIG.scenes.almost.words));
});

test('三至五目标的短关不弹普通或高阶连击，只保留符合条件的剩一词',()=>{
  for(const count of [3,4,5]){
    const f=fixture(),s=session(WORDS.slice(0,count));f.rewards.resume(s);
    while(s.status==='playing'){solve(f,s);settle(f);}
    assert.deepEqual(scenes(f),count>=4?['almost']:[]);assert.equal(f.icons.length,0);
  }
});

test('长关在第三、第五、八、十一个连续自主目标产生候选，表现额度合计两次',()=>{
  const f=fixture(),s=session(),selected=[];f.rewards.resume(s);
  for(let i=1;i<=11;i++){const result=solve(f,s);if(result)selected.push([i,result.scene,result.banner]);settle(f);}
  assert.deepEqual(selected,[[3,'ordinary',true],[5,'advanced',true],[8,'advanced',false],[11,'advanced',false]]);
  assert.deepEqual(scenes(f),['ordinary','advanced']);assert.equal(f.icons.length,0);
});

test('额外词、重复词和思考不打断连击；错误重置，20秒无新目标优先突破',()=>{
  const f=fixture(),s=session();f.rewards.resume(s);solve(f,s);solve(f,s);
  extra(f,s,'CATS');wrong(f,s,'already-completed');f.advance(20000);
  assert.equal(solve(f,s).scene,'recovery');assert.equal(f.rewards.state.streak,3);
  settle(f);wrong(f,s);assert.equal(f.rewards.state.streak,0);
  solve(f,s);solve(f,s);assert.equal(solve(f,s).scene,'ordinary');
});

test('长词取至少五字母的最长词；部分道具提示不算自主找到，同长词只实际奖励一次',()=>{
  const f=fixture(),s=session(['TABLE','TIGER','ANIMALS',...WORDS.slice(0,6)]);f.rewards.resume(s);
  assert.equal(solve(f,s,'TABLE'),null);assert.equal(solve(f,s,'TIGER'),null);
  assert.equal(solve(f,s,'ANIMALS').scene,'long');
  const g=fixture(),other=session(['TABLE','TIGER',...WORDS.slice(0,6)]);g.rewards.resume(other);
  assert.equal(solve(g,other,'TABLE',{assisted:true}),null);assert.equal(solve(g,other,'TIGER').scene,'long');
  settle(g);assert.equal(g.rewards.state.once.has('long'),true);
});

test('道具收词不推进连击，也不触发长词或突破，仍可触发剩一词',()=>{
  const f=fixture(),s=session(['TABLE','TIGER',...WORDS.slice(0,8)]);f.rewards.resume(s);
  solve(f,s,'CAT');wrong(f,s);solve(f,s,'DOG');for(let i=0;i<3;i++)wrong(f,s);
  f.advance(25000);assert.equal(solve(f,s,'TABLE',{source:'prop'}),null);
  assert.equal(f.rewards.state.streak,0);assert.equal(f.rewards.state.errors,0);assert.equal(f.rewards.progress.totalTargets,3);
  assert.equal(solve(f,s,'TIGER').scene,'long');
  const g=fixture(),other=session(WORDS.slice(0,4));g.rewards.resume(other);
  solve(g,other,null,{source:'prop'});solve(g,other,null,{source:'prop'});
  assert.equal(solve(g,other,null,{source:'prop'}).scene,'almost');assert.equal(solve(g,other,null,{source:'prop'}),null);
  assert.deepEqual(scenes(g),['almost']);assert.equal(g.rewards.state.streak,0);
});

test('三次真实错误后突破；额外、重复不算错误，突破每关实际展示一次',()=>{
  const f=fixture(),s=session();f.rewards.resume(s);wrong(f,s);extra(f,s,'CATS');wrong(f,s,'already-completed');wrong(f,s,'invalid-path');wrong(f,s);
  assert.deepEqual(solve(f,s),{scene:'recovery',banner:true,icon:true});settle(f);
  assert.equal(recover(f,s),null);assert.deepEqual(scenes(f),['recovery']);assert.equal(f.icons[0].kind,'applause');
});

test('20秒按活跃游玩无新目标计算；暂停和隐藏的时间不累计',()=>{
  const f=fixture(),s=session();f.rewards.resume(s);f.advance(9000);f.rewards.cancel();f.advance(40000);f.rewards.resume(s);f.rewards.sync(s);
  extra(f,s,'CATS');wrong(f,s,'already-completed');f.advance(10999);assert.equal(solve(f,s),null);
  f.advance(20000);assert.equal(solve(f,s).scene,'recovery');
});

test('三个不同额外词触发一次奖励，重复额外词不推进里程碑或连击',()=>{
  const f=fixture(),s=session();f.rewards.resume(s);solve(f,s);extra(f,s,'CATS');extra(f,s,'CATS',false);extra(f,s,'DOGS');
  assert.equal(f.banners.length,0);assert.deepEqual(extra(f,s,'OWLS'),{scene:'bonus',banner:true,icon:true});
  settle(f);extra(f,s,'FOXES');assert.deepEqual(scenes(f),['bonus']);assert.equal(f.icons[0].kind,'thumbs');assert.equal(f.rewards.state.streak,1);
});

test('同次剩一词压过突破和长词，未选择场景不会单独补播',()=>{
  const f=fixture(),s=session(['CAT','DOG','TABLE','OWL']);f.rewards.resume(s);solve(f,s);solve(f,s);for(let i=0;i<3;i++)wrong(f,s);
  assert.deepEqual(solve(f,s,'TABLE'),{scene:'almost',banner:true,icon:false});
  settle(f);assert.deepEqual(scenes(f),['almost']);assert.equal(f.pending,0);
});

test('同次突破优先于长词和连击，剩一词优先于第五个高阶连击',()=>{
  const f=fixture(),s=session(['CAT','DOG','TABLE',...WORDS.slice(3,10)]);f.rewards.resume(s);solve(f,s);solve(f,s);f.advance(20000);
  assert.equal(solve(f,s,'TABLE').scene,'recovery');assert.deepEqual(scenes(f),['recovery']);
  const g=fixture(),other=session(WORDS.slice(0,6));g.rewards.resume(other);
  for(let i=0;i<4;i++){solve(g,other);settle(g);}assert.equal(solve(g,other).scene,'almost');
});

test('短关表现激励共用一次额度，剩一词拥有独立一次额度',()=>{
  const f=fixture(),s=session(['TABLE','CAT','DOG','OWL','FOX']);f.rewards.resume(s);solve(f,s,'TABLE');settle(f);
  assert.deepEqual(bonus(f,s),{scene:'bonus',banner:false,icon:false});assert.equal(f.rewards.state.performanceCount,1);
  solve(f,s,'CAT');solve(f,s,'DOG');assert.equal(solve(f,s,'OWL').banner,true);settle(f);solve(f,s);
  assert.deepEqual(scenes(f),['long','almost']);assert.equal(f.rewards.state.almostCount,1);assert.equal(f.rewards.state.bannerCount,2);
});

test('长关连击、长词、突破、额外词合计两次表现额度，剩一词仍独立',()=>{
  const f=fixture(),s=session(['CAT','DOG','OWL','TABLE',...WORDS.slice(3,10)]);f.rewards.resume(s);
  solve(f,s);solve(f,s);solve(f,s);settle(f);solve(f,s,'TABLE');settle(f);
  assert.deepEqual(recover(f,s),{scene:'recovery',banner:false,icon:false});assert.equal(bonus(f,s).banner,false);
  while(s.initial.targets.length-s.completed.size>1)solve(f,s,null,{source:'prop'});
  assert.deepEqual(scenes(f),['ordinary','long','almost']);assert.equal(f.rewards.state.performanceCount,2);assert.equal(f.rewards.state.almostCount,1);
});

test('统一硬CD从整组完全消失后起算8秒，边界前跳过且不消耗额度',()=>{
  const f=fixture(),s=session(['CAT','DOG','OWL','TABLE','TIGER',...WORDS.slice(3,10)]);f.rewards.resume(s);solve(f,s);solve(f,s);solve(f,s);
  const text=f.rewards.progress.lastText;f.advance(9100-1);
  assert.deepEqual(solve(f,s,'TABLE'),{scene:'long',banner:false,icon:false});
  assert.equal(f.rewards.state.performanceCount,1);assert.equal(f.rewards.state.once.has('long'),false);assert.equal(f.rewards.progress.lastText,text);
  f.advance(1);assert.equal(solve(f,s,'TIGER').banner,true);assert.equal(f.banners[1].at-f.banners[0].at,9100);
  assert.deepEqual(scenes(f),['ordinary','long']);
});

test('CD撞上剩一词也必须跳过，不排队、无图标单独补播',()=>{
  const f=fixture(),s=session(['TABLE','CAT','DOG','OWL']);f.rewards.resume(s);solve(f,s,'TABLE');solve(f,s,'CAT');
  assert.deepEqual(solve(f,s,'DOG'),{scene:'almost',banner:false,icon:false});assert.equal(f.rewards.state.almostCount,0);
  f.advance(60000);assert.deepEqual(scenes(f),['long']);assert.equal(f.icons.length,0);assert.equal(f.pending,0);
});

test('横幅和图标共用硬CD，图标更晚消失时从图标结束计时',()=>{
  const config={...CONFIG,icon:{...CONFIG.icon,durationMs:2200}},f=fixture({config}),s=session();f.rewards.resume(s);recover(f,s);
  f.advance(1100);assert.equal(f.rewards.banner,null);assert.ok(f.rewards.icon);assert.equal(bonus(f,s).icon,false);
  f.advance(1100);assert.equal(f.rewards.progress.lastGroupEndedAt,2200);
  const other=session();f.rewards.resume(other);f.advance(7999);assert.equal(recover(f,other).banner,false);
  f.advance(1);assert.equal(bonus(f,other).banner,true);assert.equal(f.banners[1].at,10200);
});

test('切关取消当前组并保留硬CD，返回已有会话也不恢复额度',()=>{
  const f=fixture(),s=session(['TABLE',...WORDS]);f.rewards.resume(s);solve(f,s,'TABLE');f.advance(500);
  const other=session();f.rewards.resume(other);assert.equal(f.pending,0);assert.equal(f.rewards.progress.lastGroupEndedAt,500);assert.equal(recover(f,other).banner,false);
  f.advance(7999);assert.equal(bonus(f,other).banner,false);f.advance(1);f.rewards.resume(s);
  assert.equal(f.rewards.state.performanceCount,1);assert.equal(f.rewards.state.once.has('long'),true);assert.equal(recover(f,s).banner,true);assert.deepEqual(f.idle,[]);
});

test('实际显示才扣额度；不可见或减弱动态不扣任何额度，不安排延后播放',()=>{
  for(const options of [{isVisible:()=>false},{reducedMotion:()=>true}]){
    const f=fixture(options),s=session();f.rewards.resume(s);
    assert.deepEqual(recover(f,s),{scene:'recovery',banner:false,icon:false});
    assert.equal(f.rewards.state.performanceCount,0);assert.equal(f.rewards.state.iconCount,0);assert.equal(f.rewards.state.once.has('recovery'),false);
    assert.equal(f.rewards.progress.lastIconAt,null);assert.equal(f.rewards.progress.lastGroupEndedAt,null);f.advance(60000);assert.equal(f.pending,0);
  }
});

test('点赞和鼓掌共享60秒CD，跨关保留，59.999秒不出图标，60秒可出',()=>{
  const f=fixture(),first=session();f.rewards.resume(first);assert.equal(recover(f,first).icon,true);
  f.advance(59999);const second=session();f.rewards.resume(second);assert.deepEqual(bonus(f,second),{scene:'bonus',banner:true,icon:false});
  f.rewards.cancel();f.advance(8000);const third=session();f.rewards.resume(third);assert.equal(bonus(f,third).icon,true);
  assert.deepEqual(f.icons.map(icon=>icon.kind),['applause','thumbs']);
  const g=fixture(),a=session();g.rewards.resume(a);recover(g,a);g.advance(60000);const b=session();g.rewards.resume(b);assert.equal(bonus(g,b).icon,true);
});

test('每关图标合计最多一次，即使60秒已到也不能再出另一种图标',()=>{
  const f=fixture(),s=session();f.rewards.resume(s);recover(f,s);f.advance(60000);
  assert.deepEqual(bonus(f,s),{scene:'bonus',banner:true,icon:false});assert.equal(f.rewards.state.iconCount,1);assert.equal(f.icons.length,1);
  assert.equal(f.icons[0].at,f.banners[0].at);
});

test('表现额度耗尽时图标也不显示；图标必须附着于同次实际横幅',()=>{
  const f=fixture(),s=session();f.rewards.resume(s);solve(f,s);solve(f,s);solve(f,s);settle(f);solve(f,s);solve(f,s);settle(f);
  assert.deepEqual(recover(f,s),{scene:'recovery',banner:false,icon:false});assert.equal(f.icons.length,0);assert.equal(f.rewards.progress.lastIconAt,null);
});

test('通关不替换已有横幅，不另叠局内赞赏或手势，原组自然结束后空闲',()=>{
  const f=fixture(),s=session(WORDS.slice(0,4));f.rewards.resume(s);solve(f,s);solve(f,s);solve(f,s);
  assert.equal(solve(f,s),null);assert.deepEqual(scenes(f),['almost']);assert.equal(f.icons.length,0);assert.equal(f.rewards.banner.scene,'almost');
  f.advance(1100);assert.equal(f.rewards.isRunning(s),false);assert.deepEqual(f.idle,[s]);
  const g=fixture(),other=session(['CAT','DOG','TABLE']);g.rewards.resume(other);solve(g,other);solve(g,other);assert.equal(recover(g,other),null);assert.equal(g.banners.length,0);
});

test('已完成会话和清盘兜底不触发通关横幅；首个事件在渲染前到达仍正确',()=>{
  const f=fixture(),done=session(['CAT']);done.completed.add('CAT');done.status='won';f.rewards.sync(done);assert.equal(f.banners.length,0);
  const g=fixture(),s=session(['TABLE','CAT','DOG']);assert.equal(solve(g,s,'TABLE').scene,'long');assert.equal(g.rewards.progress.totalTargets,1);
  const h=fixture(),other=session(['CAT','DOG']);h.rewards.resume(other);other.completed.add('CAT');other.status='won';assert.equal(h.rewards.record(other,{accepted:true,word:'CAT'}),null);assert.equal(h.banners.length,0);
});

test('持久化硬CD和60秒图标CD；刷新发生于显示中也不会重置',()=>{
  const saved=storage(),f=fixture({storage:saved}),s=session();f.rewards.resume(s);recover(f,s);
  const state=JSON.parse(saved.getItem(ENCOURAGEMENT_STORAGE_KEY));assert.equal(state.version,2);assert.equal(state.lastIconAt,0);assert.equal(state.lastGroupEndedAt,1100);
  const g=fixture({storage:saved,startAt:100}),other=session();g.rewards.resume(other);assert.equal(recover(g,other).banner,false);g.advance(9000);
  assert.deepEqual(bonus(g,other),{scene:'bonus',banner:true,icon:false});
  const h=fixture({storage:saved,startAt:60000}),third=session();h.rewards.resume(third);assert.equal(recover(h,third).icon,true);
});

test('旧版图标目标计数不能误作时间戳；损坏存储不影响游玩',()=>{
  const saved=storage();saved.setItem(ENCOURAGEMENT_STORAGE_KEY,JSON.stringify({version:1,totalTargets:50,lastIconAt:50,lastText:'Nice!'}));
  const f=fixture({storage:saved}),s=session();f.rewards.resume(s);assert.equal(recover(f,s).icon,true);assert.equal(f.rewards.progress.totalTargets,51);
  const broken=fixture({storage:{getItem:()=>'{bad',setItem:()=>{throw Error('full');}}}),other=session();broken.rewards.resume(other);assert.equal(recover(broken,other).icon,true);
});

test('随机文案按场景选，跨关排除上一条实际文案；重复提交不耗额度',()=>{
  const saved=storage(),texts=[];
  for(const [index,random]of [()=>0,()=>0,()=>.9999999].entries()){
    const f=fixture({storage:saved,random,startAt:index*10000}),s=session(['TABLE','CAT','DOG']);f.rewards.resume(s);solve(f,s,'TABLE');
    f.rewards.record(s,{accepted:true,word:'TABLE'});assert.equal(f.rewards.state.performanceCount,1);assert.equal(f.rewards.progress.totalTargets,index+1);texts.push(f.banners[0].text);f.advance(1100);
  }
  assert.deepEqual(texts,['Fantastic!','Brilliant!','Impressive!']);
});