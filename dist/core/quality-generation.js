import {generateLevel} from './algorithm2.js?v=21';
import {createAlgorithmSession} from './algorithm-v1-adapter.js?v=38';
import {normalizeQualityConfig,matchesQualityTemplate,QUALITY_TEMPLATE} from './quality-config.js?v=39';
import {calculateLevelQuality,normalizedQualityLevel} from './quality-metrics.js?v=39';
import {scoreLevelQuality} from './quality-scoring.js?v=39';
import {qualityRuntimeContext} from './quality-runtime.js?v=39';

export function structureFingerprint(input){
  const level=normalizedQualityLevel(input),{rows,cols,counts}=level.board;
  const variants=[];
  for(const reflect of [false,true])for(const rotate of [0,1,2,3]){
    if(rows!==cols&&rotate%2)continue;
    const map=cell=>{let row=Math.floor(cell/cols),col=cell%cols;if(reflect)col=cols-1-col;if(rotate===1)[row,col]=[col,rows-1-row];if(rotate===2)[row,col]=[rows-1-row,cols-1-col];if(rotate===3)[row,col]=[cols-1-col,row];return row*cols+col;};
    const transformed=Array(counts.length);counts.forEach((value,cell)=>transformed[map(cell)]=value);
    variants.push(JSON.stringify([rows,cols,transformed,level.targets.map(target=>target.path.map(map).sort((a,b)=>a-b).join(',')).sort()]));
  }
  return variants.sort()[0];
}
export function generateWithQuality(budget,dictionary,seed,options={}){
  const config=normalizeQualityConfig(options.quality),mode=config.mode,levelConfig=options.levelConfig||QUALITY_TEMPLATE;
  if(mode!=='REPORT'&&!matchesQualityTemplate(levelConfig))return {ok:false,code:'QUALITY_TEMPLATE_REQUIRED',message:'RANK／FILTER 目前仅适用于 V3：3×3、3/3/3/4/5、每格最多3次。请应用 V3 模板。'};
  const started=performance.now(),limit=mode==='REPORT'?1:config.maxCandidates,failureReasons={},pool=[],seen=new Set();
  let nodes=0,requests=0,hardCandidates=0,best=null;
  const fail=reason=>failureReasons[reason]=(failureReasons[reason]||0)+1;
  for(let index=0;index<limit;index++){
    if(options.isCancelled?.())return {ok:false,code:'CANCELLED',message:'质量生成已取消',qualitySearch:{requests,hardCandidates,nodes,failureReasons}};
    const remaining=(budget.maxTotalNodes??300000)-nodes;if(remaining<=0){fail('total-generation-budget');break;}
    const candidateSeed=index===0?seed:(seed+Math.imul(index,0x9e3779b9))>>>0;
    const result=generateLevel({...budget,maxTotalNodes:remaining},dictionary,candidateSeed,{...options,levelConfig,quality:undefined});
    requests++;nodes+=result.stats?.nodes||0;
    if(!result.ok){fail(result.code||'generation-failed');if(mode==='REPORT')return {...result,qualitySearch:{requests,hardCandidates,nodes,failureReasons,elapsedMs:performance.now()-started}};continue;}
    let session,report;
    try{
      session=createAlgorithmSession(result.level,dictionary);hardCandidates++;
      report=calculateLevelQuality(session.initial,{...qualityRuntimeContext(dictionary),...options.context,mainDictionary:dictionary,validation:session.report,
        fixedLengthTemplate:matchesQualityTemplate(levelConfig),maxSearchNodes:config.maxSearchNodes,isCancelled:options.isCancelled});
    }catch(error){if(error.code==='CANCELLED')return {ok:false,code:'CANCELLED',message:error.message};fail('hard-validation');continue;}
    report.metadata={...report.metadata,seed:result.level.seed,generationSeed:seed,algorithmVersion:result.level.algorithmVersion||result.level.generatorVersion||'flexible',qualityConfigVersion:config.version};
    report.scoring=scoreLevelQuality(report,config);
    for(const reason of report.scoring.failures)fail(reason);
    const key=JSON.stringify([result.level.board?.letters||result.level.letters,structureFingerprint(result.level),result.level.targets.map(target=>target.word).sort()]);
    if(seen.has(key)){fail('duplicate-candidate');continue;}seen.add(key);
    const candidate={...result,qualityReport:report};
    if(mode!=='FILTER'||report.scoring.filterSatisfied)pool.push(candidate);
    pool.sort((a,b)=>Number(b.qualityReport.scoring.filterSatisfied)-Number(a.qualityReport.scoring.filterSatisfied)||(b.qualityReport.scoring.totalScore??-1)-(a.qualityReport.scoring.totalScore??-1));if(pool.length>10)pool.length=10;
    options.onQualityProgress?.({requests,hardCandidates,score:pool[0]?.qualityReport.scoring.totalScore});
    if(mode==='REPORT'){best=candidate;break;}
    if(mode==='FILTER'&&report.scoring.filterSatisfied){best=candidate;break;}
    if(mode==='RANK')best=pool[0];
  }
  const qualitySearch={requests,hardCandidates,nodes,hardPassRate:requests?hardCandidates/requests:null,elapsedMs:performance.now()-started,failureReasons,
    requestedCandidates:limit,candidates:pool.map(candidate=>({level:candidate.level,qualityReport:candidate.qualityReport}))};
  if(!best)return {ok:false,code:'QUALITY_FILTER_EXHAUSTED',message:'质量搜索预算内未找到满足已启用条件的关卡。缺失指标不会当作达标，不放宽阈值，不加载样例。',qualitySearch};
  return {...best,stats:{...best.stats,nodes},qualitySearch};
}
