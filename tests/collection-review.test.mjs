import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionTheme,collectedWords,collectionGroups} from '../dist/core/collection-themes.js';
import {createPersonalProgress,PERSONAL_PROGRESS_KEY} from '../dist/core/personal-progress.js';
import {reviewWeek,summarizeWeek,weeklyHighlights,reviewDuration} from '../dist/core/weekly-review.js';

const storageFor=()=>{const values=new Map();return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};};
const snapshot=(seconds=0,extra={})=>({started:true,timeKind:'real',finished:false,elapsedSeconds:seconds,hints:0,mistakes:0,...extra});
const entry=(word,date,origin='web-supplied')=>({word,language:'english',firstFoundAt:new Date(date).toISOString(),origin});

test('收藏主题使用常见词义和原包首义，未知词与其他语言不硬分',()=>{
  for(const [word,definition,theme] of [['BREAD','food','food'],['CHAIR','furniture','everyday'],['SNOW','weather','nature'],['DOG','animal','animals'],['TRAIN','railway','travel'],['HAPPY','feeling','people'],['JUMP','vi. move quickly','actions'],['APPLES','fruit','food']])assert.equal(collectionTheme(word,definition),theme);
  assert.equal(collectionTheme('UNFAMILIAR','A geological mineral'),'nature');
  assert.equal(collectionTheme('UNFAMILIAR','A small mammal / An edible dish'),'animals');
  assert.equal(collectionTheme('UNFAMILIAR','An obscure term'),'discoveries');
  assert.equal(collectionTheme('PANE','bread','portuguese'),'discoveries');
});

test('收藏卡片仅来自已收词，跨原包同词合并并保留最早日期，不修改原日历数据',()=>{
  const entries=[entry('APPLE','2026-10-14T10:00:00'),entry('APPLE','2026-10-12T10:00:00','zen'),entry('DOG','2026-10-15T10:00:00')],before=structuredClone(entries);
  const words=collectedWords(entries,(word,origin)=>({definition:origin==='zen'?'A fruit':word==='DOG'?'animal':''}));
  assert.equal(words.length,2);assert.equal(words[0].firstFoundAt,entries[1].firstFoundAt);assert.equal(words[0].definition,'A fruit');
  assert.deepEqual(collectionGroups(words).map(group=>group.id),['food','animals']);
  assert.deepEqual(entries,before);assert.equal(words.some(word=>word.word==='BREAD'),false);
  const timezoneEntries=[{...entries[0],firstFoundAt:'2026-10-12T01:00:00+08:00'},{...entries[0],firstFoundAt:'2026-10-11T22:00:00Z'}];
  assert.equal(collectedWords(timezoneEntries)[0].firstFoundAt,timezoneEntries[0].firstFoundAt);
});

test('周回顾以本地周一为界，正确跨年并可浏览上一周',()=>{
  const now=new Date(2027,0,3,18),week=reviewWeek(now);
  assert.equal(week.days[0].key,'2026-12-28');assert.equal(week.days[6].key,'2027-01-03');
  assert.equal(week.end.getDay(),1);assert.equal(reviewWeek(now,-1).days[0].key,'2026-12-21');
});

test('周回顾按首次发现统计新词，只合计手动试玩，忽略未来词和机器记录',()=>{
  const now=new Date(2026,9,16,12),words=collectedWords([entry('APPLE','2026-10-12T10:00:00'),entry('DOG','2026-10-15T10:00:00'),entry('BREAD','2026-10-10T10:00:00'),entry('CAKE','2026-10-18T10:00:00')]);
  const sessions=[{mode:'manual',days:{'2026-10-14':{seconds:65,hints:2,targets:3,starts:1,completedLevels:1}}},{mode:'rules',days:{'2026-10-14':{seconds:999,hints:99,targets:99,starts:99,completedLevels:99}}}];
  const summary=summarizeWeek(words,sessions,now);
  assert.equal(summary.words,2);assert.equal(summary.levels,1);assert.equal(summary.seconds,65);assert.equal(summary.hints,2);assert.equal(summary.activeDays,3);
  assert.equal(summarizeWeek(words,sessions,now,-1).words,1);assert.equal(summary.hasPlayData,true);
});

test('回顾亮点与时长仅由真实统计产生，空周不捏造亮点',()=>{
  const now=new Date(2026,9,16,12),empty=summarizeWeek([],[],now);
  assert.deepEqual(weeklyHighlights(empty),[]);assert.equal(empty.hasPlayData,false);
  const words=collectedWords([entry('APPLE','2026-10-14T10:00:00'),entry('BLUEBERRY','2026-10-14T10:00:00')]);
  const highlights=weeklyHighlights(summarizeWeek(words,[],now));
  assert.equal(highlights.length,3);assert.match(highlights[1].text,/BLUEBERRY.*9 字母/);
  assert.equal(reviewDuration(272),'4:32');assert.equal(reviewDuration(3621),'1时0分');
});

test('个人试玩从开始计时，重复快照不重复记关；机器与未开始会话不入账',()=>{
  const storage=storageFor(),now=new Date(2026,9,16,12),progress=createPersonalProgress(storage,{now:()=>now}),session={completed:new Set(),status:'playing'};
  assert.equal(progress.observe(session,{...snapshot(),started:false}),false);
  assert.equal(progress.observe(session,{...snapshot(),timeKind:'virtual'}),false);assert.equal(progress.entries().length,0);
  progress.observe(session,snapshot());session.completed.add('DOG');now.setSeconds(12);
  progress.observe(session,snapshot(12,{hints:1,mistakes:2}));session.status='won';now.setSeconds(20);
  progress.observe(session,snapshot(20,{hints:1,mistakes:2,finished:true}));progress.observe(session,snapshot(20,{hints:1,mistakes:2,finished:true}));
  assert.deepEqual(progress.entries()[0].days['2026-10-16'],{seconds:20,hints:1,mistakes:2,targets:1,completedLevels:1,starts:1});
  const restored=createPersonalProgress(storage);assert.deepEqual(restored.entries(),progress.entries());
});

test('跨周午夜的真实专注时间分到两天，暂停间隔不计时',()=>{
  const storage=storageFor(),date=new Date(2026,9,18,23,59,58),progress=createPersonalProgress(storage,{now:()=>date}),session={completed:new Set(),status:'playing'};
  progress.observe(session,snapshot());date.setSeconds(date.getSeconds()+4);progress.observe(session,snapshot(4));
  date.setHours(9);progress.observe(session,snapshot(4));date.setSeconds(date.getSeconds()+2);progress.observe(session,snapshot(6));progress.flush();
  const days=progress.entries()[0].days;assert.equal(days['2026-10-18'].seconds,2);assert.equal(days['2026-10-19'].seconds,4);
  assert.equal(summarizeWeek([],progress.entries(),date,-1).seconds,2);assert.equal(summarizeWeek([],progress.entries(),date).seconds,4);
});

test('多个浏览器页签分别记录时互相保留，无效数据与存储不可用不影响试玩',()=>{
  const storage=storageFor(),date=new Date(2026,9,16,12),a=createPersonalProgress(storage,{now:()=>date}),b=createPersonalProgress(storage,{now:()=>date});storage.setItem('other','keep');
  a.observe({completed:new Set(),status:'playing'},snapshot());b.observe({completed:new Set(),status:'playing'},snapshot());
  assert.equal(createPersonalProgress(storage).entries().length,2);assert.equal(storage.getItem('other'),'keep');
  storage.setItem(PERSONAL_PROGRESS_KEY,JSON.stringify({version:1,sessions:[{mode:'manual',id:'bad',days:{}}]}));assert.equal(createPersonalProgress(storage).entries().length,0);
  const memory=createPersonalProgress({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},{now:()=>date});
  memory.observe({completed:new Set(),status:'playing'},snapshot());assert.equal(memory.entries().length,1);assert.equal(memory.persistent,false);
});

test('Zen自由字母池的手动目标同样计入本人记录',()=>{
  const storage=storageFor(),progress=createPersonalProgress(storage),session={completedCount:2,status:'won'};
  progress.observe(session,snapshot(15,{finished:true}));const totals=Object.values(progress.entries()[0].days)[0];
  assert.equal(totals.targets,2);assert.equal(totals.completedLevels,1);
});

test('跨午夜只产生提示事件的日期仍然属于真实试玩活跃日',()=>{
  const summary=summarizeWeek([],[{mode:'manual',days:{'2026-10-12':{hints:1}}}],new Date(2026,9,16,12));
  assert.equal(summary.hints,1);assert.equal(summary.activeDays,1);assert.equal(summary.hasPlayData,true);assert.equal(summary.levels,0);
});
