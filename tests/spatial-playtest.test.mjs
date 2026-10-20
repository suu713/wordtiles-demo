import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GameSession,validateLevel} from '../dist/core/rules.js';
import {assignTargetKnowledge,seededRandom,SimulationRun,normalizeProfile,summarizeRuns} from '../dist/core/playtest.js';
import {spatialPathFeatures,recognitionProbability,spatialLevelMetrics,SPATIAL_CALIBRATION} from '../dist/core/spatial-perception.js';
import {createLetterHints} from '../dist/core/letter-hints.js';
import {wordAnalysis,analyzePlayedLevel} from '../dist/core/playtest-analysis.js';
import {analysisSheets} from '../dist/core/playtest-export.js';

const dictionary={version:'matched-layout-fixture',words:['PLANET','BRICKS']},frequency={version:'fixture',zipf:{PLANET:5,BRICKS:5}};
function matchedLevel(reverse=false){
  const targets=dictionary.words.map((word,row)=>({word,path:Array.from({length:6},(_,i)=>row*6+(reverse?5-i:i))}));
  const board={rows:2,cols:6,letters:Array(12),counts:Array(12).fill(1)};targets.forEach(t=>t.path.forEach((cell,i)=>board.letters[cell]=t.word[i]));
  return {schemaVersion:2,kind:'web',config:{rows:2,cols:6,wordLengths:[6,6]},board,targets};
}
function progressionLevel(sharedOuter=false,hardOuter=false){
  const board={rows:5,cols:5,letters:Array(25).fill('X'),counts:Array(25).fill(1)};
  const targets=[hardOuter?{word:'AFCDEFGHJI',path:[0,1,2,3,4,9,14,19,24,23]}:{word:'AFCD',path:[0,1,2,3]},{word:'EFGH',path:[6,7,8,13]}];
  for(const target of targets)target.path.forEach((cell,index)=>board.letters[cell]=target.word[index]);
  if(sharedOuter)targets[0].path.forEach(cell=>board.counts[cell]=2);
  return {kind:'web',algorithm:0,board,targets};
}
function interiorCavityLevel(withCavity){
  const board={rows:5,cols:5,letters:Array(25).fill('X'),counts:Array(25).fill(1)},target={word:'EFGH',path:[6,7,8,13]};
  target.path.forEach((cell,index)=>board.letters[cell]=target.word[index]);if(withCavity)board.counts[12]=0;
  return {kind:'web',algorithm:0,board,targets:[target]};
}

test('每局5词认识4词，小关随机取整后平均80%，不依赖排布',()=>{
  const words=['A','B','C','D','E'],rng=seededRandom(211);let total=0;
  for(let i=0;i<10000;i++){assert.equal(assignTargetKnowledge(words,rng).size,4);total+=assignTargetKnowledge(words.slice(0,3),rng).size;}
  assert.ok(Math.abs(total/30000-.8)<.01);
  const a=new SimulationRun(new GameSession(matchedLevel(),dictionary),{frequency,seed:71}),b=new SimulationRun(new GameSession(matchedLevel(true),dictionary),{frequency,seed:71});
  assert.deepEqual(a.knownTargets,b.knownTargets);
});
test('同词同长度工程锚点满足顺向、外圈、少拐更容易，仍允许已知词漏识别',()=>{
  const anchors=SPATIAL_CALIBRATION.anchors,p=label=>anchors.find(a=>a.label===label).fittedProbability;
  assert.equal(SPATIAL_CALIBRATION.humanValidated,false);assert.ok(SPATIAL_CALIBRATION.rmse<.01);
  assert.ok(p('顺向外圈直线')>p('倒向外圈直线'));assert.ok(p('顺向外圈直线')>p('顺向内圈直线'));
  assert.ok(p('顺向内圈直线')>p('顺向内圈一拐'));assert.ok(p('顺向内圈一拐')>p('顺向内圈两拐'));
  assert.ok(p('倒向内圈三拐')<.25);assert.ok(p('顺向外圈直线')<1);
});
test('推进校正保留原分，并纳入外圈清除、共享格阻塞、外露时机与同字干扰变化',()=>{
  const open=spatialLevelMetrics(progressionLevel()),blocked=spatialLevelMetrics(progressionLevel(true)),hardOuter=spatialLevelMetrics(progressionLevel(false,true));
  const inner=open.words.find(word=>word.word==='EFGH'),blockedInner=blocked.words.find(word=>word.word==='EFGH');
  const innerBehindHardOuter=hardOuter.words.find(word=>word.word==='EFGH');
  assert.equal(inner.recognitionProbability,recognitionProbability(spatialPathFeatures(inner.path,progressionLevel().board)));
  assert.ok(inner.correctedRecognitionProbability>inner.recognitionProbability);
  assert.ok(inner.meanFirstHalfExposureTurn>0);
  assert.ok(inner.meanAmbiguityReduction>0);
  assert.ok(blockedInner.correctedRecognitionProbability<inner.correctedRecognitionProbability);
  assert.ok(innerBehindHardOuter.correctedRecognitionProbability<inner.correctedRecognitionProbability);
  assert.equal(blockedInner.meanFirstHalfExposureTurn,null);
  assert.equal(open.meanCorrectedRecognition,open.words.reduce((sum,word)=>sum+word.correctedRecognitionProbability,0)/open.words.length);
  assert.equal(open.meanKnownRecognition,open.words.reduce((sum,word)=>sum+word.recognitionProbability,0)/open.words.length);
  const cavity=spatialLevelMetrics(interiorCavityLevel(true)),solid=spatialLevelMetrics(interiorCavityLevel(false));
  assert.equal(cavity.meanExposureAtDiscovery,0);assert.equal(solid.meanExposureAtDiscovery,0);
  assert.equal(cavity.meanCorrectedRecognition,solid.meanCorrectedRecognition);
  assert.equal(cavity.meanInternalVoidCells,1);assert.equal(solid.meanInternalVoidCells,0);
});
test('坐标换算、反向步、外圈和拐弯定义一致',()=>{
  const board={rows:4,cols:4,letters:Array(16).fill('A')},f=spatialPathFeatures([0,1,5,6],board);
  assert.equal(f.turns,2);assert.equal(f.readingForward,true);assert.equal(f.edgeShare,.5);assert.equal(f.backwardShare,0);
  const reverse=spatialPathFeatures([6,5,1,0],board);assert.equal(reverse.reverseMajority,true);assert.equal(reverse.backwardShare,1);
  assert.equal(spatialPathFeatures([0,4,8],board,true).backwardShare,1);
  assert.ok(recognitionProbability(f,{learning:5})>recognitionProbability(f));
});
test('真实合法的匹配棋盘中，倒向排列使已知词漏看与试探增加',()=>{
  const easy=matchedLevel(),hard=matchedLevel(true);assert.equal(validateLevel(easy,dictionary).valid,true);assert.equal(validateLevel(hard,dictionary).valid,true);
  const collect=level=>Array.from({length:300},(_,seed)=>new SimulationRun(new GameSession(level,dictionary),{frequency,lexicon:dictionary.words,seed,profile:{maxHints:0,mistakeRate:0}}).run());
  const a=summarizeRuns(collect(easy)),b=summarizeRuns(collect(hard));
  assert.ok(b.meanMissedRecognitions>a.meanMissedRecognitions);assert.ok(b.meanTrialSwipes>a.meanTrialSwipes);
  assert.equal(spatialLevelMetrics(easy).readingForwardTargets,2);assert.equal(spatialLevelMetrics(hard).reverseMajorityTargets,2);
});
test('普通模型不调用答案提示，试探和全部提交按真实规则验证',()=>{
  const level=matchedLevel(true),session=new GameSession(level,dictionary),run=new SimulationRun(session,{frequency,lexicon:dictionary.words,seed:2,profile:{hintAfter:1,maxHints:4}});
  session.hint=()=>{throw new Error('ordinary policy read an answer path');};const result=run.run(),replay=new GameSession(level,dictionary);
  for(const event of result.events)if(event.type==='submit')assert.deepEqual(replay.submit(event.value),event.result);
  assert.equal(result.attempts,result.events.filter(e=>e.type==='submit').length);assert.equal(result.trialSwipes,result.events.filter(e=>e.type==='submit'&&e.trial).length);
  assert.ok(result.trialSwipes<=result.attempts);assert.ok(result.mistakes<=result.failedSwipes);assert.ok(result.events.some(e=>e.type==='hint'));
  assert.ok(result.events.filter(e=>e.type==='hint').every(e=>e.revealed.length===1));
});
test('单字母提示和整词烟花不扣格子、不完成目标，之后正常连词',()=>{
  const session=new GameSession(matchedLevel(),dictionary),state=createLetterHints(session.initial.targets,{random:seededRandom(1)}),before=session.snapshot();
  const one=state.reveal(1,session.completed),whole=state.revealShortestWord(session.completed);assert.equal(one.length,1);assert.ok(whole.length>=5);assert.ok(whole.every(item=>item.word==='PLANET'));assert.deepEqual(session.snapshot(),before);
  assert.ok([...Array(6)].every((_,index)=>state.has('PLANET',index)));
  const seen=new Map();for(const item of [...one,...whole]){assert.equal(item.index,seen.get(item.word)||0);seen.set(item.word,item.index+1);}
  while(session.status==='playing')assert.equal(session.submit(session.hint().path).accepted,true);assert.ok(session.counts.every(n=>n===0));
});
test('时间上限从旧配置迁移时丢弃，虚拟时间不会被旧上限截断',()=>{
  assert.equal('patienceSeconds' in normalizeProfile({patienceSeconds:10}),false);
  const result=new SimulationRun(new GameSession(matchedLevel(true),dictionary),{frequency,lexicon:[],seed:7,profile:{patienceSeconds:10,maxHints:0,thinkSeconds:60}}).run();
  assert.ok(result.elapsedSeconds>10);assert.equal(result.outcome,'gave-up');
  assert.equal(summarizeRuns([{...result,outcome:'search-limit'}]).samples,0);
});
test('逐关、逐词与Excel量化同一批真实结果，非目标与Zen空间值留空',()=>{
  const level=matchedLevel(true),runs=[new SimulationRun(new GameSession(level,dictionary),{frequency,lexicon:dictionary.words,seed:4}).run()];
  const row=analyzePlayedLevel(level,runs,frequency,dictionary),words=wordAnalysis(level,runs,frequency,dictionary),sheets=analysisSheets({job:{mode:'ordinary'},levels:[row],runs,words});
  assert.equal(row.meanTrialSwipes,runs[0].trialSwipes);assert.equal(row.reverseMajorityTargets,2);assert.ok(words.every(w=>w.backwardShare===1&&w.recognitionProbability>0&&w.knownSamples<=1));
  assert.ok(sheets[1].rows[0].includes('平均试探滑动'));assert.ok(sheets[2].rows[0].includes('认识但漏看词数'));assert.ok(sheets[3].rows[0].includes('累计漏识别次数'));
  assert.ok(!JSON.stringify(sheets).includes('试玩上限（秒）'));assert.equal(spatialLevelMetrics({kind:'zen',targets:['CAT']}).meanKnownRecognition,null);
  const rules=[new SimulationRun(new GameSession(level,dictionary),{frequency,mode:'rules'}).run()];assert.ok(wordAnalysis(level,rules,frequency,dictionary).every(w=>w.knownSamples===null&&w.missedRecognitions===null));
});
test('可见模拟界面不提供时间上限，主界面采用共享的纯揭字状态',async()=>{
  const ui=await readFile(new URL('../dist/workbench-ui.js',import.meta.url),'utf8'),app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
  assert.ok(!ui.includes('sim-time-limit'));assert.ok(app.includes('letterHintsForSession(game)'));assert.ok(app.includes('格子次数不变'));
  assert.ok(ui.includes('校正后识别估计分'));assert.ok(ui.includes('原识别估计分'));assert.ok(ui.includes('半数外露回合'));assert.match(ui,/spatial-perception\.js\?v=30/);
});
