import {runQualityBenchmark} from './core/quality-benchmark.js?v=39';
self.onmessage=async({data:job})=>{
  try{const report=await runQualityBenchmark(job,{onRow:data=>self.postMessage({type:'row',...data})});self.postMessage({type:'done',report});}
  catch(error){self.postMessage({type:'error',message:error.message});}
};
