import {simulateLevelBatch} from './core/playtest-batch.js?v=48';
import {ENGLISH_FREQUENCY} from './core/playtest-frequency.js?v=34';

self.onmessage=({data:job})=>{
  try {
    const entries=job.entries||[{level:job.level,dictionary:job.dictionary}];
    for(const [index,entry] of entries.entries()){
      self.postMessage({type:'level-start',index,number:entry.number});
      for(const summary of simulateLevelBatch(entry.level,entry.dictionary,{
        repeats:job.repeats,profile:job.profile,frequency:ENGLISH_FREQUENCY,
      }))self.postMessage({type:'run',index,number:entry.number,summary});
      self.postMessage({type:'level-done',index,number:entry.number});
    }
    self.postMessage({type:'done'});
  } catch(error) {self.postMessage({type:'error',message:error.message});}
};
