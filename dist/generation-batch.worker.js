import {generateLevelBatch} from './core/generation-batch.js?v=28';
self.onmessage=async({data:job})=>{
  try{const result=await generateLevelBatch(job,{onLevel:data=>self.postMessage({type:'level',...data}),onProgress:data=>self.postMessage({type:'progress',...data})});const {levels,...summary}=result;self.postMessage({type:'done',...summary});}
  catch(error){self.postMessage({type:'error',message:error.message});}
};
