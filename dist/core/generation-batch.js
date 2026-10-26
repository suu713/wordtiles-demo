import {generateWithQuality} from './quality-generation.js?v=39';
import {matchesQualityTemplate} from './quality-config.js?v=39';
import {createAlgorithmSession} from './algorithm-v1-adapter.js?v=21';
import {checkConfiguration,DEFAULT_CONFIG} from './rules.js?v=21';
import {runtimeDictionaryError} from './target-policy.js?v=21';
import {freshRandomSeed} from './playtest.js?v=21';
import {normalizeBatchPlan,planLevelOptions} from './batch-plan.js?v=28';
import {planTargetLengths} from './target-composition.js?v=28';
import {levelFingerprint} from './level-sequence.js?v=21';
export async function generateLevelBatch(job,{onLevel=()=>{},onProgress=()=>{},isCancelled=()=>false}={}){
  if(!Number.isInteger(job.count)||job.count<1||job.count>10000)throw new Error('生成数量必须为1～10000的整数');
  if(!['flexible','supplied-v1'].includes(job.engine))throw new Error('请选择有效生成算法');
  const error=runtimeDictionaryError(job.dictionary);if(error)throw new Error(error.message);
  const plan=job.plan?normalizeBatchPlan(job.plan,job.count):null,planned=!!plan?.curve.enabled;
  const config=job.engine==='supplied-v1'?DEFAULT_CONFIG:job.config;
  if(job.quality&&job.quality.mode!=='REPORT'&&(planned||!matchesQualityTemplate(config)))throw new Error('RANK／FILTER 批量生成请使用固定 V3 模板并关闭旧难度曲线');
  if(!planned){const check=checkConfiguration(config,job.dictionary);if(!check.valid)throw new Error(check.errors.map(e=>e.message).join('；'));}
  if(planned&&!job.frequency?.zipf)throw new Error('英语词频尚未加载，暂时不能按难度编排');
  const levels=[],seen=new Set(job.existingFingerprints||[]),recent=(job.beforeTargets||[]).slice(-(plan?.repeatWindow||0));let attempts=0,failures=0,duplicates=0,totalNodes=0,lastError='';
  const retryLimit=plan?12:job.count*5;
  for(let index=0;index<job.count;index++){
    let completed=false;
    for(let retry=0;retry<retryLimit&&(plan||attempts<job.count*5);retry++){
      if(isCancelled())return {status:'cancelled',levels,attempts,failures,duplicates,totalNodes};
      const random=()=>freshRandomSeed()/4294967296;
      const options=planned?planLevelOptions(plan,index,job.dictionary,job.engine,random):[{config,degree:null}];
      if(!options.length){lastError=`第${plan.startNumber+index}关的目标数量和词长无法覆盖所选棋盘`;break;}
      const spec=options[freshRandomSeed()%Math.min(options.length,3)];
      if(!planned&&plan?.composition)spec.config={...config,wordLengths:planTargetLengths({...config,targetCount:plan.fixedTargets,composition:plan.composition},[...new Set(job.dictionary.words.map(word=>word.length))].filter(n=>n>=plan.minLength&&n<=plan.maxLength),random)};
      const window=plan?.repeatWindow||0;
      const before=recent;
      const after=index>=job.count-window?(job.afterTargets||[]).slice(0,window):[];
      const avoid=new Set(window?[...before,...after].flat():[]);
      const candidates=job.dictionary.words.filter(w=>!avoid.has(w)&&(!planned||(w.length>=plan.minLength&&w.length<=plan.maxLength&&(job.frequency.zipf[w]??0)>=spec.minimumZipf)));
      const rareWords=planned?candidates.filter(w=>(job.frequency.zipf[w]??0)<3.5):[];
      attempts++;
      const result=generateWithQuality(job.budget,job.dictionary,freshRandomSeed(),{engine:job.engine,levelConfig:spec.config,quality:job.quality,
        candidateWords:plan?candidates:undefined,constraints:planned?{maxTurns:spec.maxTurns??undefined,rareWords,maxRareTargets:spec.maxRareTargets}:undefined});
      totalNodes+=result.stats?.nodes||0;
      if(result.ok){
        if(plan?.composition)result.level.source={...result.level.source,targetComposition:plan.composition};
        const rareCount=result.level.targets.filter(t=>rareWords.includes(t.word)).length;
        if(planned&&rareCount>plan.maxRareTargets){failures++;lastError='低频目标词数量超过设置';}
        else{
          const session=createAlgorithmSession(result.level,job.dictionary),key=levelFingerprint(session.initial);
          if(seen.has(key))duplicates++;
          else{
            seen.add(key);
            if(plan){result.level.id=`generated-${job.batchId||'batch'}-${plan.startNumber+index}-${result.level.seed}`;result.level.source={...result.level.source,editorNumber:plan.startNumber+index,batchId:job.batchId,
              difficultyRequested:spec.degree,difficultyParameters:planned?{minimumZipf:spec.minimumZipf,maxTurns:spec.maxTurns,maxUses:spec.config.maxUses??3,rareTargets:rareCount}:null,
              validationStates:session.report.stateChecks||session.report.stateCount};}
            levels.push(result.level);completed=true;
            if(window){recent.push(result.level.targets.map(t=>t.word));while(recent.length>window)recent.shift();}
            onLevel({level:result.level,qualityReport:result.qualityReport,qualitySearch:result.qualitySearch,index:levels.length,requested:job.count,attempts,failures,duplicates,totalNodes});
          }
        }
      }else{failures++;lastError=result.message||result.code;if(String(result.code).startsWith('QUALITY_'))break;}
      onProgress({generated:levels.length,requested:job.count,attempts,failures,duplicates,totalNodes,degree:spec.degree});
      await new Promise(resolve=>setTimeout(resolve,0));
      if(completed)break;
    }
    if(!completed)break;
  }
  return {status:levels.length===job.count?'complete':'partial',levels,attempts,failures,duplicates,totalNodes,error:levels.length===job.count?'':`预算内生成 ${levels.length}/${job.count} 关。下一关未通过生成或完整校验，已停止。${lastError}`};
}
