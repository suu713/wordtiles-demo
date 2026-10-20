export const DATA_RESET_KEY='wordtiles.data-reset.v1';
export const DATA_NOTICE_KEY='wordtiles.data-notice.v1';
export const PREVIEW_COLLECTION_KEY='wordtiles.collection-preview.v1';
export function dataEpoch(storage){try{return storage?.getItem(DATA_RESET_KEY)||'';}catch{return '';}}
export function sameDataEpoch(storage,epoch){return dataEpoch(storage)===epoch;}
function clearKeys(storage,keep=[]){
  if(!storage)return;
  const keys=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(key=>key?.startsWith('wordtiles.')&&!keep.includes(key));
  for(const key of keys)storage.removeItem(key);
}
export async function clearAppData({local,session,database=globalThis.indexedDB,id=globalThis.crypto?.randomUUID?.()||String(Date.now())}={}){
  const state=phase=>JSON.stringify({id,phase});
  try{local?.setItem(DATA_RESET_KEY,state('clearing'));}
  catch{clearKeys(local,[DATA_RESET_KEY]);local?.setItem(DATA_RESET_KEY,state('clearing'));}
  clearKeys(local,[DATA_RESET_KEY]);clearKeys(session);
  if(database)await new Promise((resolve,reject)=>{
    const request=database.open('wordtiles-generated-sequence',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('state');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result;
      try{const transaction=db.transaction('state','readwrite');transaction.objectStore('state').clear();transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>{db.close();reject(transaction.error);};transaction.onabort=()=>{db.close();reject(transaction.error||new Error('关卡数据清除失败'));};}
      catch(error){db.close();reject(error);}
    };
  });
  local?.setItem(DATA_RESET_KEY,state('complete'));
  return {id,phase:'complete'};
}
