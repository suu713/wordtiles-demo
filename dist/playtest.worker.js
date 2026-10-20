import { SourceGameSession, convertSourceLevel } from './core/source-levels.js?v=15';
import { SimulationRun, freshRandomSeed } from './core/playtest.js?v=29';
import { analyzePlayedLevel, wordAnalysis } from './core/playtest-analysis.js?v=29';
import {operationMetrics} from './core/playtest-metrics.js?v=29';
import {generateLevel} from './core/algorithm2.js?v=21';
import {createAlgorithmSession} from './core/algorithm-v1-adapter.js?v=21';
import {ENGLISH_FREQUENCY} from './core/playtest-frequency.js?v=34';

async function json(url) {const r=await fetch(url);if(!r.ok)throw new Error(`无法读取 ${url}`);return r.json();}
self.onmessage=async({data:job})=>{
  try {
    if(job.game==='zen')throw new Error('Zen 原包关卡库未包含在此发布版本中。');
    const frequency=ENGLISH_FREQUENCY;
    let processed=0;
    for(const bankInfo of job.banks) {
      const bank=job.game==='web'?null:await json('./source-levels/'+bankInfo.file+'?v=15');
      const total=job.game==='web'?(job.order==='history'?job.webLevels.length:job.end):bank.orders[job.order].length;
      for(let position=job.start;position<=Math.min(job.end,total);position++) {
        let level,rawGenerated,dictionary=job.dictionary,generatedSession;
        const runs=[];
        try {
          if(job.game==='web') {
            if(job.order==='history'){const entry=job.webLevels[position-1];rawGenerated=entry.level;dictionary=entry.dictionary;}
            else {const result=generateLevel(job.generationBudget,dictionary,freshRandomSeed(),{levelConfig:job.generationConfig,engine:job.generationEngine});if(!result.ok)throw new Error(result.message||result.code);rawGenerated=result.level;}
            generatedSession=createAlgorithmSession(rawGenerated,dictionary);
            level={...generatedSession.initial,kind:'web',algorithm:2,id:'web-'+position+'-'+rawGenerated.seed,
              source:{...generatedSession.initial.source,language:'english',bank:job.order,position,version:rawGenerated.algorithmVersion||'backtrack-v1.0.0'}};
          } else level=convertSourceLevel(bank.levels[String(bank.orders[job.order][position-1])],
            {language:job.language,order:job.order,position,sha256:job.sourceSha256});
          for(let repeat=0;repeat<job.repeats;repeat++) {
            try {
              const session=job.game==='web'?createAlgorithmSession(rawGenerated,dictionary):new SourceGameSession(level);
              const run=new SimulationRun(session,{frequency,profile:job.profile,mode:job.mode});
              runs.push({...run.run(),repeat:repeat+1});
            } catch(error) {runs.push({runId:crypto.randomUUID(),repeat:repeat+1,mode:job.mode,outcome:'error',error:error.message,elapsedSeconds:0,hints:0,mistakes:0,events:[]});}
          }
          const bonus=generatedSession?.bonusDictionaryInput||dictionary;
          const row=analyzePlayedLevel(level,runs,frequency,bonus),words=job.includeWords?wordAnalysis(level,runs,frequency,bonus):[];
          // Send completed levels incrementally. Termination never claims an unfinished level.
          const runRows=runs.map(r=>{const {events,wordStats,profile,seed,...summary}=r;return {...summary,...operationMetrics(level,events),game:row.game,dictionaryOrigin:row.dictionaryOrigin,language:row.language,bank:row.bank,position,id:row.id};});
          self.postMessage({type:'level',row,words,runs:runRows,processed:++processed,
            generated:rawGenerated?{level:rawGenerated,dictionary}:undefined});
        } catch(error) {
          self.postMessage({type:'level',row:{game:job.game,language:job.language,bank:bankInfo.key||job.order,position,id:level?.id||null,
            samples:0,wins:0,errors:job.repeats,error:error.message},runs:[],words:[],processed:++processed});
        }
      }
    }
    self.postMessage({type:'done',processed});
  } catch(error) {self.postMessage({type:'error',message:error.message});}
};
