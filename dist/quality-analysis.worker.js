import {createAlgorithmSession} from './core/algorithm-v1-adapter.js?v=38';
import {calculateLevelQuality} from './core/quality-metrics.js?v=39';
import {qualityRuntimeContext} from './core/quality-runtime.js?v=39';
self.onmessage=({data})=>{
  try{const session=createAlgorithmSession(data.level,data.dictionary),report=calculateLevelQuality(session.initial,{...qualityRuntimeContext(data.dictionary),validation:session.report,maxSearchNodes:data.maxSearchNodes});self.postMessage({type:'report',report});}
  catch(error){self.postMessage({type:'error',message:error.message});}
};
