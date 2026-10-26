import { SimulationRun, freshRandomSeed } from './core/playtest.js?v=46';
import { analyzePlayedLevel, wordAnalysis } from './core/playtest-analysis.js?v=46';
import {operationMetrics} from './core/playtest-metrics.js?v=46';
import {generateLevel} from './core/algorithm2.js?v=21';
import {createAlgorithmSession} from './core/algorithm-v1-adapter.js?v=21';
import {createPlaySession} from './core/play-session.js?v=40';
import {wtSourceBank,wtSourceLevel} from './core/wt-source-library.js?v=40';
import {ENGLISH_FREQUENCY} from './core/playtest-frequency.js?v=34';

self.onmessage=async({data:job})=>{
  try {
    if(job.mode!==undefined&&job.mode!=='ordinary')throw new Error('反跑关卡仅支持普通英语休闲玩家策略。');
    if(job.language&&job.language!=='english')throw new Error('普通英语休闲玩家策略仅支持英文关卡。');
    if(!['web','wordtiles','uploaded'].includes(job.game))throw new Error('请选择有效的关卡来源。');
    if(![job.start,job.end,job.repeats].every(Number.isSafeInteger)||job.start<1||job.end<job.start||job.repeats<1||job.repeats>1000||(job.end-job.start+1)*job.repeats>200000)throw new Error('跑关范围或局数不正确');
    const original=job.game==='wordtiles',uploaded=job.game==='uploaded',sourceBank=original?await wtSourceBank():null;
    if(uploaded&&(!Array.isArray(job.uploadedLevels)||!job.uploadedLevels.length||job.uploadedLevels.length>10000))throw new Error('请先上传并校验关卡文件');
    if(!Array.isArray(job.banks)||job.banks.length!==1)throw new Error('关卡来源不正确');
    const frequency=ENGLISH_FREQUENCY;
    let processed=0;
    for(const bankInfo of job.banks) {
      const total=original?sourceBank.orders[bankInfo.key]?.length:uploaded?job.uploadedLevels.length:job.end;
      if(!total||job.end>total)throw new Error('超出所选关卡列表范围');
      for(let position=job.start;position<=Math.min(job.end,total);position++) {
        let level,rawGenerated,dictionary=job.dictionary,generatedSession;
        const runs=[];
        try {
          if(uploaded){
            const entry=job.uploadedLevels[position-1];rawGenerated=entry.level;dictionary=entry.dictionary;
            generatedSession=createPlaySession(rawGenerated,dictionary);
            const initial=generatedSession.initial;
            level={...initial,...(initial.algorithm===1?{}:{kind:'web',algorithm:2}),source:{...initial.source,language:'english',bank:'uploaded',position}};
          }else if(job.game==='web') {
            const result=generateLevel(job.generationBudget,dictionary,freshRandomSeed(),{levelConfig:job.generationConfig,engine:job.generationEngine});if(!result.ok)throw new Error(result.message||result.code);rawGenerated=result.level;
            generatedSession=createAlgorithmSession(rawGenerated,dictionary);
            level={...generatedSession.initial,kind:'web',algorithm:2,id:'web-'+position+'-'+rawGenerated.seed,
              source:{...generatedSession.initial.source,language:'english',bank:job.order,position,version:rawGenerated.algorithmVersion||'backtrack-v1.0.0'}};
          }else{level=await wtSourceLevel(position,bankInfo.key);dictionary=undefined;}
          for(let repeat=0;repeat<job.repeats;repeat++) {
            try {
              const session=createPlaySession(original?level:rawGenerated,dictionary);
              const run=new SimulationRun(session,{frequency,profile:job.profile,mode:'ordinary'});
              runs.push({...run.run(),repeat:repeat+1});
            } catch(error) {runs.push({runId:crypto.randomUUID(),repeat:repeat+1,mode:'ordinary',outcome:'error',error:error.message,elapsedSeconds:0,hints:0,mistakes:0,events:[]});}
          }
          const bonus=generatedSession?.bonusDictionaryInput||dictionary;
          const row=analyzePlayedLevel(level,runs,frequency,bonus),words=job.includeWords?wordAnalysis(level,runs,frequency,bonus):[];
          if(uploaded)row.uploadedIndex=position;
          // Send completed levels incrementally. Termination never claims an unfinished level.
          const runRows=runs.map(r=>{const {events,wordStats,profile,seed,...summary}=r;return {...summary,...operationMetrics(level,events),game:row.game,dictionaryOrigin:row.dictionaryOrigin,language:row.language,bank:row.bank,position,id:row.id};});
          self.postMessage({type:'level',row,words,runs:runRows,processed:++processed,
            generated:job.game==='web'&&rawGenerated?{level:rawGenerated,dictionary}:undefined});
        } catch(error) {
          self.postMessage({type:'level',row:{game:job.game,language:job.language,bank:bankInfo.key||job.order,position,id:level?.id||null,
            samples:0,wins:0,errors:job.repeats,error:error.message},runs:[],words:[],processed:++processed});
        }
      }
    }
    self.postMessage({type:'done',processed});
  } catch(error) {self.postMessage({type:'error',message:error.message});}
};
