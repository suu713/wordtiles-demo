import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {convertWTLevel,validateWTLevel,WTSourceSession,WT_RUNTIME} from '../dist/core/wt-source-session.js';
import {createPlaySession} from '../dist/core/play-session.js';
import {SimulationRun,seededRandom} from '../dist/core/playtest.js';
import {simulateLevelBatch} from '../dist/core/playtest-batch.js';
import {calculateLevelStatistics} from '../dist/core/level-statistics.js';
import {calculateLevelSolutions} from '../dist/core/level-solutions.js';
import {spatialLevelMetrics} from '../dist/core/spatial-perception.js';
import {analyzePlayedLevel} from '../dist/core/playtest-analysis.js';
import {analysisSheets} from '../dist/core/playtest-export.js';
import {createLetterHints} from '../dist/core/letter-hints.js';
const bytes=await readFile(new URL('../dist/source-levels/english.json',import.meta.url));
const bank=JSON.parse(bytes),catalogue=JSON.parse(await readFile(new URL('../dist/source-levels/catalogue.json',import.meta.url)));
const make=(id,options)=>new WTSourceSession(convertWTLevel(bank.levels[id],{position:1,order:'all',sha256:catalogue.sha256}),options);
const synthetic={id:999999,width:3,height:2,letters:'CAT,AAA',target_words:[{word:'CAT',type:0},{word:'AAA',type:0}],extra_words:[{word:'TAC',type:0}],obstacles:[]};

test('1.4.0 英文原包完整保留 3,459 个配置及四张主线和每日表',()=>{
  assert.equal(catalogue.version,'1.4.0');assert.equal(Object.keys(bank.levels).length,3459);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),catalogue.languages[0].sha256);
  assert.equal(catalogue.sha256,'01f0e935e537cb6883fd9587b32ccfdc282f8d7928dbf0ece30262216ed4d43f');
  for(const [key,length] of Object.entries({level_list_0:1500,level_list_1:1500,level_list_2:1000,level_list_3:1000,daily_puzzle_level_list:366,all:3459})){
    assert.equal(bank.orders[key].length,length);assert.ok(bank.orders[key].every(id=>bank.levels[id]));
  }
  assert.deepEqual(bank.orders.main,bank.orders.level_list_0);assert.equal(bank.orders.level_list_0[0],191596);assert.equal(bank.orders.level_list_2[0],89);
  assert.equal(new Set(bank.orders.all).size,3459);assert.equal(Object.values(bank.levels).filter(l=>l.obstacles.length).length,423);
});

test('第一关 ICE / JOB / SUN 可完成，导出仍是初始原包配置',()=>{
  const session=make(191596),initial=structuredClone(session.initial);
  assert.deepEqual(session.initial.targets.map(t=>t.word),['ICE','JOB','SUN']);
  while(session.status==='playing')assert.equal(session.submit(session.hint().path).accepted,true);
  assert.equal(session.victoryReason,'all-targets');assert.equal(session.total,0);assert.deepEqual(session.exportInitial,initial);
  assert.equal(createPlaySession(initial).initial.source.runtime,WT_RUNTIME);
});

test('相同单词可走不同格子集合，扣除整个原路径并集；额外词不扣次数',()=>{
  const a=new WTSourceSession(convertWTLevel(synthetic),{rng:()=>.1}),b=new WTSourceSession(convertWTLevel(synthetic),{rng:()=>.1});
  const before=a.snapshot();assert.equal(a.submit([2,1,0]).reason,'extra-word');assert.deepEqual(a.counts,before.counts);assert.equal(a.completed.size,0);
  assert.equal(a.submit([2,1,0]).isNew,false);
  assert.equal(a.submit([1,4,5]).accepted,true);assert.equal(b.submit([3,4,5]).accepted,true);
  assert.deepEqual(a.counts,b.counts);assert.deepEqual(a.counts,[1,1,1,0,0,0]);
  assert.equal(a.submit([0,1,2]).status,'won');
  assert.deepEqual(calculateLevelStatistics(a.initial).tileUses,a.initial.board.counts);
  assert.equal(calculateLevelSolutions(a.initial).count,1);
});

test('113778：8 个目标中开局仅 5 个可连，完成 5 个开帘后仍需收齐全部',()=>{
  const s=make(113778,{rng:()=>.5});assert.equal(s.pending.length,8);assert.equal(s.availableTargets.length,5);
  const locked=s.blockedCells;assert.ok(locked.length);assert.equal(s.submit([locked[0]]).reason,'invalid-path');
  for(const [index,word] of ['DAD','OLD','COLD','HOLD','LOCK'].entries()){
    const path=s.pathsFor(word).find(p=>p.every(i=>s.playableCounts[i]>0));assert.ok(path);assert.equal(s.submit(path).accepted,true);
    if(index<4)assert.deepEqual(s.blockedCells,locked);
  }
  assert.equal(s.blockedCells.length,0);assert.equal(s.completed.size,5);assert.equal(s.status,'playing');
  while(s.status==='playing')s.submit(s.hint().path);
  assert.equal(s.completed.size,8);assert.equal(s.victoryReason,'all-targets');
});

test('完整揭词也结算目标与帘子；清盘兜底与普通通关分别记录',()=>{
  const s=make(113778),hints=createLetterHints(s.initial.targets,{random:()=>0});
  while(s.completed.size<5){const revealed=hints.reveal(1,s.completed);assert.equal(revealed.length,1);const word=revealed[0].word;if([...word].every((_,i)=>hints.has(word,i)))s.collectRevealedTarget(word);}
  assert.equal(s.blockedCells.length,0);
  const fallback=make(191596);fallback.counts.fill(0);assert.equal(fallback.audit(),true);assert.equal(fallback.status,'won');assert.equal(fallback.completed.size,0);assert.equal(fallback.victoryReason,'empty-grid');
  const corrupt=make(191596);corrupt.counts=[];assert.equal(corrupt.audit(),false);assert.equal(corrupt.status,'anomaly');
});

test('篡改原包派生数据不能通过验证，生成评分与原包计数口径不混用',()=>{
  const level=convertWTLevel(synthetic);level.board.counts[1]++;assert.equal(validateWTLevel(level).valid,false);assert.throws(()=>createPlaySession(level));
  const metrics=spatialLevelMetrics(convertWTLevel(synthetic));assert.equal(metrics.progressionApplicable,true);assert.equal(metrics.recognitionCorrectionRuntime,'wt-original-rules');assert.ok(Number.isFinite(metrics.meanCorrectedRecognition));
});
test('原包推进校正使用真实开帘规则，缺少开帘认识词时保留阻挡，不修改初始关卡',()=>{
  const session=make(113778),initial=session.initial,before=JSON.stringify(initial),visible=new Set(session.availableTargets.map(target=>target.word)),hidden=initial.targets.find(target=>!visible.has(target.word)).word;
  const half=spatialLevelMetrics(initial,{knowledgeRate:.5}),all=spatialLevelMetrics(initial,{knowledgeRate:1});
  assert.equal(JSON.stringify(initial),before);assert.equal(half.words.find(word=>word.word===hidden).correctedRecognitionProbability,0);assert.ok(all.words.find(word=>word.word===hidden).correctedRecognitionProbability>0);
  assert.ok(all.words.find(word=>word.word===hidden).meanFirstHalfExposureTurn>=5);assert.equal(all.meanKnownRecognition,half.meanKnownRecognition);assert.equal(session.completed.size,0);
  assert.equal(spatialLevelMetrics(initial,{knowledgeRate:0}).meanCorrectedRecognition,null);
});

test('3,459 关按三种独立选择顺序完整清盘，无死路、少收词或负次数',()=>{
  for(const raw of Object.values(bank.levels))for(const seed of [1,19,333]){
    const rng=seededRandom(raw.id+seed),s=new WTSourceSession(convertWTLevel(raw),{rng});let steps=0;
    while(s.status==='playing'&&steps++<19){
      const available=s.availableTargets;assert.ok(available.length,'no visible target '+raw.id);
      const t=available[Math.floor(rng()*available.length)],paths=s.pathsFor(t.word).filter(p=>p.every(i=>s.playableCounts[i]>0));
      assert.equal(s.submit(paths[Math.floor(rng()*paths.length)]).accepted,true,'failed '+raw.id);
    }
    assert.equal(s.status,'won','status '+raw.id);assert.equal(s.victoryReason,'all-targets','fallback '+raw.id);
    assert.equal(s.completed.size,raw.target_words.length);assert.ok(s.counts.every(n=>n===0));
  }
});

test('模拟只能扫描未锁定格，缺少工作簿标注不影响目标被抽为认识词',()=>{
  const s=make(113778),run=new SimulationRun(s,{mode:'ordinary',seed:7,frequency:{version:'absent',zipf:{}}});
  for(let n=0;n<20;n++){
    const candidates=run.observeCandidates();for(const c of [...candidates.recognized,...candidates.missed])assert.ok(c.path.every(i=>!s.blockedCells.includes(i)));
    const swipe=run.exploratorySwipe([]);assert.ok(swipe.value.every(i=>!s.blockedCells.includes(i)));
  }
  const first=make(191596),fullScan=new SimulationRun(first,{seed:5,frequency:{version:'absent',zipf:{}},profile:{scanBudget:2000}});
  let observed=new Set();for(let n=0;n<10;n++){const scan=fullScan.observeCandidates();for(const c of [...scan.recognized,...scan.missed])observed.add(c.word);}
  for(const word of fullScan.knownTargets)assert.ok(observed.has(word),word);
});

test('独立机器试玩重置状态，导出保留原关号、ID、来源与兜底原因',()=>{
  const s=make(191596),frequency={version:'test',zipf:{ICE:6,JOB:6,SUN:6}},before=s.snapshot();
  const runs=[...simulateLevelBatch(s.initial,null,{repeats:3,frequency})];assert.equal(runs.length,3);assert.equal(new Set(runs.map(r=>r.runId)).size,3);assert.ok(runs.every(r=>['won','gave-up'].includes(r.outcome)));assert.deepEqual(s.snapshot(),before);
  const solved=new SimulationRun(make(191596),{mode:'rules'}).run(),row=analyzePlayedLevel(s.initial,[solved],frequency);
  assert.equal(row.dictionaryOrigin,'wt-original-1.4.0');assert.equal(row.id,191596);assert.equal(row.sourceSha256,catalogue.sha256);assert.equal(row.emptyGridWins,0);
  const sheets=analysisSheets({job:{game:'wordtiles',mode:'rules'},levels:[row],runs:[solved]});
  assert.ok(sheets[1].rows[0].includes('规则版本'));assert.ok(!sheets[1].rows[0].includes('清盘兜底通关局数'));assert.ok(sheets[2].rows[0].includes('通关原因'));
});
