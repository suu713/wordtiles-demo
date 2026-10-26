import {parsePlaytestUpload} from './core/playtest-import.js?v=47';

self.onmessage=async({data})=>{
  try{
    const result=await parsePlaytestUpload(data.text,{
      fallbackDictionary:data.dictionary,
      onProgress:(processed,total)=>self.postMessage({type:'progress',processed,total}),
    });
    self.postMessage({type:'done',...result});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
