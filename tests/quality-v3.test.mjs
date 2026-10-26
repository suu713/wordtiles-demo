import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculateLevelQuality,pairSpellingSimilarity,containmentType} from '../dist/core/quality-metrics.js';
import {normalizeQualityConfig,QUALITY_TEMPLATE} from '../dist/core/quality-config.js';
import {scoreLevelQuality} from '../dist/core/quality-scoring.js';
import {generateWithQuality} from '../dist/core/quality-generation.js';
import {generateLevel} from '../dist/core/algorithm2.js';
import {createBankDictionary} from '../dist/core/dictionary-banks.js';
import {createAlgorithmSession} from '../dist/core/algorithm-v1-adapter.js';
import {freeze} from '../dist/core/rules.js';
import {GameSession} from '../dist/core/rules.js';
import {distribution,branchingRangeFromBenchmark,runQualityBenchmark} from '../dist/core/quality-benchmark.js';
const read=async name=>JSON.parse(await readFile(new URL('./fixtures/retired-runtime-data/'+name,import.meta.url),'utf8'));
const sample=await read('sample.json'),historical=await read('dictionary.json'),dictionary=createBankDictionary([3,4,5,6,7,8]),budget={maxNodesPerAttempt:10000,maxAttempts:30,maxTotalNodes:300000};
const context={mainDictionary:historical,extraDictionary:{words:['PEE']},legalDictionary:{words:[...historical.words,'EFT','PEE']},reviewDictionary:{words:[...sample.targets.map(t=>t.word),'PEE','DA','YE'],metadata:{complete:true}},frequency:{version:'test-only-explicit-frequency',reliable:true,zipf:Object.fromEntries([...sample.targets.map(t=>t.word),'PEE','DA','YE'].map(word=>[word,word==='DA'?4.5:4.8]))},blockedWords:['YE']};
test('历史验收棋盘的最少转弯3、直线40%、共享6/9，EYE正反不误判消耗集合',()=>{
  const report=calculateLevelQuality(sample,context),v=report.values;
  assert.equal(report.hardValid,true);assert.equal(v.totalTurnCount,3);assert.equal(v.straightRatio,.4);assert.equal(v.sharedCellRate,6/9);
  const eye=report.words.find(word=>word.word==='EYE');assert.equal(eye.pathCount,2);assert.equal(eye.consumptionSetCount,1);assert.equal(eye.wordBranching,.5);
  assert.equal(v.relatedPairCount,report.pairs.filter(pair=>pair.pairSimilarity>=.55).length);assert.equal(report.pairs.length,10);
});
test('多重集合Dice、连续公共子串和编辑相似度，包含关系每对只选一类',()=>{
  const pair=pairSpellingSimilarity('FEED','FEE');assert.ok(Math.abs(pair.dice-6/7)<1e-12);assert.equal(pair.commonSubstring,1);assert.equal(pair.editSimilarity,.75);
  assert.equal(pairSpellingSimilarity('AAA','AB').dice,.4);
  assert.equal(containmentType('CAR','CART'),'prefix');assert.equal(containmentType('ART','CART'),'suffix');assert.equal(containmentType('AT','LATER'),'inner');assert.equal(containmentType('CAT','CAT'),null);
});
test('词形多样性自定义范围按区间评分，非固定模板保留词长权重',()=>{
  const report=calculateLevelQuality(sample,context),base=normalizeQualityConfig({ranges:{wordFormDiversity:[0,.1]}}),enabled=Object.fromEntries(Object.keys(base.enabled).map(key=>[key,key==='wordFormDiversity']));
  const score=scoreLevelQuality(report,{...base,enabled});assert.equal(score.modules.combination.score,0);assert.equal(score.evaluations.find(item=>item.key==='wordFormDiversity').status,'fail');
  const variable=calculateLevelQuality(sample,{...context,fixedLengthTemplate:false,possibleLengths:[2,3,4,5,6]});assert.deepEqual(variable.diversityWeights,{start:.4,end:.4,length:.2});assert.equal(variable.values.lengthDiversity,3/5);
});
test('审核词典区分奖励、忽略与屏蔽词，非目标按单词去重计算',()=>{
  const report=calculateLevelQuality(sample,context);
  assert.deepEqual(report.categories.rewardedExtraWords,['PEE']);assert.deepEqual(report.categories.ignoredValidWords,['DA']);assert.deepEqual(report.categories.blockedWords,['YE']);
  assert.equal(report.values.ignoredValidCount,1);assert.equal(report.values.ignoredCommonCount,1);assert.ok(Math.abs(report.values.distractorScore-.6)<1e-12);assert.ok(Math.abs(report.values.distractorPerTarget-.12)<1e-12);
});
test('指标不修改关卡或会话，缺失词频、词根、词典和耗尽搜索预算不冒充0分',()=>{
  const input=freeze(structuredClone(sample)),before=JSON.stringify(input);
  const report=calculateLevelQuality(input,{mainDictionary:historical,frequency:{approximation:'rarity proxy',zipf:context.frequency.zipf}});
  assert.equal(JSON.stringify(input),before);assert.equal(report.values.avgZipf,null);assert.equal(report.values.freqCoverage,0);assert.equal(report.values.stemDiversity,null);assert.equal(report.values.firstWordEase,null);assert.equal(report.values.distractorScore,null);
  assert.ok(report.warnings.length>=3);assert.equal(report.diversityWeights.length,0);
  const exhausted=calculateLevelQuality(sample,{...context,maxSearchNodes:1});assert.equal(exhausted.completeness.reviewSearch,false);assert.equal(exhausted.values.ignoredValidCount,null);assert.equal(exhausted.values.distractorScore,null);
  const score=scoreLevelQuality(report);assert.equal(score.evaluations.find(e=>e.key==='avgZipf').status,'exempt');assert.ok(score.confidence<1);
  const game=new GameSession(sample,historical);game.submit(sample.targets[0].path);const state=game.snapshot();calculateLevelQuality(game.initial,context);assert.deepEqual(game.snapshot(),state);
});
test('REPORT保持原生成输出和全部玩法校验；固定模板的理论界限在100个随机种子上成立',()=>{
  const raw=generateLevel(budget,dictionary,42,{levelConfig:QUALITY_TEMPLATE}),reported=generateWithQuality(budget,dictionary,42,{levelConfig:QUALITY_TEMPLATE});assert.equal(reported.ok,true);assert.deepEqual(reported.level,raw.level);
  for(let seed=0;seed<100;seed++){
    const result=generateWithQuality(budget,dictionary,seed,{levelConfig:QUALITY_TEMPLATE});assert.equal(result.ok,true,result.message);
    const v=result.qualityReport.values;assert.ok(v.totalTurnCount>=2&&v.totalTurnCount<=8);assert.ok(v.straightRatio<=.6);assert.ok(v.sharedCellRate>=5/9&&v.sharedCellRate<=1);assert.ok(v.tripleUseCount<=4);
    const game=createAlgorithmSession(result.level,dictionary);for(const target of [...game.initial.targets].reverse())assert.equal(game.submit(target.path).accepted,true);assert.equal(game.status,'won');
  }
});
test('RANK同seed可复现且保留池内最佳候选；FILTER不达标时明确失败，取消仍有效',()=>{
  const quality={mode:'RANK',maxCandidates:5},a=generateWithQuality(budget,dictionary,42,{levelConfig:QUALITY_TEMPLATE,quality}),b=generateWithQuality(budget,dictionary,42,{levelConfig:QUALITY_TEMPLATE,quality});
  assert.equal(a.ok,true);assert.deepEqual(a.level,b.level);assert.deepEqual(a.qualityReport.values,b.qualityReport.values);assert.ok(a.qualitySearch.requests<=5);assert.ok(a.qualitySearch.candidates.every(candidate=>candidate.qualityReport.scoring.totalScore<=a.qualityReport.scoring.totalScore));
  const settings=normalizeQualityConfig({mode:'FILTER',maxCandidates:3}),enabled=Object.fromEntries(Object.keys(settings.enabled).map(key=>[key,key==='totalTurnCount']));
  const failed=generateWithQuality(budget,dictionary,42,{levelConfig:QUALITY_TEMPLATE,quality:{...settings,enabled,ranges:{totalTurnCount:[99,99]}}});assert.equal(failed.ok,false);assert.equal(failed.level,undefined);assert.equal(failed.code,'QUALITY_FILTER_EXHAUSTED');assert.equal(failed.qualitySearch.candidates.length,0);
  const passed=generateWithQuality(budget,dictionary,42,{levelConfig:QUALITY_TEMPLATE,quality:{...settings,enabled,ranges:{totalTurnCount:[2,8]}}});assert.equal(passed.ok,true);assert.equal(passed.qualityReport.scoring.filterSatisfied,true);
  assert.equal(generateWithQuality(budget,dictionary,42,{isCancelled:()=>true}).code,'CANCELLED');
  const custom={rows:2,cols:2,wordLengths:[4]};assert.equal(generateWithQuality(budget,dictionary,42,{levelConfig:custom,quality:{mode:'RANK'}}).code,'QUALITY_TEMPLATE_REQUIRED');
  const forbidden=generateWithQuality(budget,{...dictionary,words:[...dictionary.words,'ZZZFAKE']},42,{levelConfig:QUALITY_TEMPLATE});assert.equal(forbidden.ok,false);assert.equal(forbidden.code,'DICTIONARY_POLICY');assert.equal(forbidden.level,undefined);
});
test('分位数不把缺失值当零；分支分位目标必须先有100个有效样本',()=>{
  const stats=distribution([null,1,2,3,4]);assert.equal(stats.available,4);assert.equal(stats.unavailable,1);assert.equal(stats.mean,2.5);assert.equal(stats.p10,1.3);assert.equal(stats.p50,2.5);assert.equal(stats.p90,3.7);
  const rows=Array.from({length:100},(_,i)=>({ok:true,difficulty:'easy',values:{avgBranching:i/100}}));assert.equal(branchingRangeFromBenchmark(rows.slice(0,99),'easy'),null);
  assert.deepEqual(branchingRangeFromBenchmark(rows,'easy'),{count:100,range:[0,.495]});assert.equal(branchingRangeFromBenchmark(rows,'normal'),null);assert.equal(distribution([null]).mean,null);
});
test('批量质量测试可以取消，保留已完成请求并明确分母，不伪造完整批次',async()=>{
  let processed=0;const report=await runQualityBenchmark({count:10,difficulties:['normal'],dictionary,budget,quality:{mode:'REPORT'}},{onRow:()=>processed++,isCancelled:()=>processed>=2});
  assert.equal(report.status,'cancelled');assert.equal(report.rows.length,2);assert.equal(report.summary.requested,10);assert.equal(report.summary.processed,2);assert.equal(report.summary.hardPassRate,1);assert.equal(report.summary.metrics.avgZipf.available,0);assert.equal(report.summary.metrics.avgZipf.mean,null);
});
test('严格筛选批量失败保留具体偏离原因，不将缺失指标分布记成零',async()=>{
  const base=normalizeQualityConfig({mode:'FILTER',maxCandidates:2,ranges:{totalTurnCount:[99,99]}}),enabled=Object.fromEntries(Object.keys(base.enabled).map(key=>[key,key==='totalTurnCount']));
  const report=await runQualityBenchmark({count:2,difficulties:['normal'],dictionary,budget,quality:{...base,enabled}});
  assert.equal(report.summary.generated,0);assert.equal(report.summary.hardPassRate,1);assert.equal(report.summary.metrics.totalTurnCount.mean,null);assert.equal(report.summary.failureReasons.find(([reason])=>reason==='fail:totalTurnCount')[1],2);
  assert.ok(report.rows.every(row=>row.candidateFailureCounts['fail:totalTurnCount']>0));
});
