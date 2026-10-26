import {generateWithQuality,structureFingerprint} from './quality-generation.js?v=39';
import {normalizeQualityConfig,QUALITY_TEMPLATE,QUALITY_LABELS} from './quality-config.js?v=39';
import {freshRandomSeed} from './playtest.js?v=35';
export function distribution(values){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),n=sorted.length;
  const percentile=q=>{if(!n)return null;const index=(n-1)*q,low=Math.floor(index),high=Math.ceil(index);return sorted[low]+(sorted[high]-sorted[low])*(index-low);};
  return {available:n,unavailable:values.length-n,mean:n?sorted.reduce((sum,value)=>sum+value,0)/n:null,p10:percentile(.1),p50:percentile(.5),p90:percentile(.9)};
}
export function branchingRangeFromBenchmark(rows,difficulty){
  const values=rows.filter(row=>row.ok&&row.difficulty===difficulty).map(row=>row.values?.avgBranching),stats=distribution(values);
  if(stats.available<100)return null;
  return {count:stats.available,range:difficulty==='easy'?[0,stats.p50]:difficulty==='hard'?[stats.p50,null]:[stats.p10,stats.p90]};
}
export function summarizeQualityBenchmark(rows,requested){
  const passed=rows.filter(row=>row.ok),hard=rows.filter(row=>row.hardValid),failureReasons={},soft={};
  for(const row of rows){for(const reason of row.failures||[])failureReasons[reason]=(failureReasons[reason]||0)+1;for(const item of row.evaluations||[]){const state=soft[item.key]||{available:0,passed:0,unavailable:0,exempt:0};if(['pass','fail'].includes(item.status)){state.available++;state.passed+=Number(item.status==='pass');}if(item.status==='unavailable')state.unavailable++;if(item.status==='exempt')state.exempt++;soft[item.key]=state;}}
  for(const item of Object.values(soft))item.satisfactionRate=item.available?item.passed/item.available:null;
  return {requested,processed:rows.length,generated:passed.length,hardPassed:hard.length,hardPassRate:rows.length?hard.length/rows.length:null,
    time:distribution(rows.map(row=>row.elapsedMs)),score:distribution(passed.map(row=>row.score)),soft,
    metrics:Object.fromEntries(Object.keys(QUALITY_LABELS).map(key=>[key,distribution(passed.map(row=>row.values?.[key]))])),
    distinctCombinations:new Set(passed.map(row=>row.combination)).size,distinctStructures:new Set(passed.map(row=>row.structure)).size,
    failureReasons:Object.entries(failureReasons).sort((a,b)=>b[1]-a[1])};
}
export async function runQualityBenchmark(job,{onRow=()=>{},isCancelled=()=>false}={}){
  const count=job.count??500,difficulties=job.difficulties||['easy','normal','hard'];
  if(!Number.isInteger(count)||count<1||count>5000||!difficulties.length||difficulties.some(d=>!['easy','normal','hard'].includes(d)))throw new Error('批量质量测试参数无效，每档1～5000次');
  const rows=[],requested=count*difficulties.length,seeds=new Set();
  for(const difficulty of difficulties)for(let index=0;index<count;index++){
    if(isCancelled())return {status:'cancelled',rows,summary:summarizeQualityBenchmark(rows,requested)};
    let seed;do{seed=freshRandomSeed();}while(seeds.has(seed));seeds.add(seed);
    const quality=normalizeQualityConfig({...job.quality,difficulty,...(difficulties.length>1?{ranges:undefined,enabled:undefined}:{})});
    const tick=performance.now(),result=generateWithQuality(job.budget,job.dictionary,seed,{levelConfig:QUALITY_TEMPLATE,quality,isCancelled}),report=result.qualityReport;
    const row={difficulty,index:index+1,seed,ok:result.ok,hardValid:!!result.qualitySearch?.hardCandidates,code:result.code??null,elapsedMs:performance.now()-tick,
      score:report?.scoring.totalScore??null,confidence:report?.scoring.confidence??null,values:report?.values??null,evaluations:report?.scoring.evaluations??[],
      failures:report?.scoring.failures||(Object.keys(result.qualitySearch?.failureReasons||{}).length?Object.keys(result.qualitySearch.failureReasons):[result.code||'generation-failed']),
      candidateFailureCounts:result.qualitySearch?.failureReasons||{},combination:result.ok?result.level.targets.map(t=>t.word).sort().join('/'):null,structure:result.ok?structureFingerprint(result.level):null};
    rows.push(row);onRow({row,processed:rows.length,requested,example:index===0?report:undefined});
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {status:'complete',rows,summary:summarizeQualityBenchmark(rows,requested),byDifficulty:Object.fromEntries(difficulties.map(d=>[d,summarizeQualityBenchmark(rows.filter(row=>row.difficulty===d),count)]))};
}
