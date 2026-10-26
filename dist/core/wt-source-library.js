import {convertWTLevel} from './wt-source-session.js?v=40';
let cataloguePromise,bankPromise;
async function json(file){const r=await fetch(new URL('../source-levels/'+file,import.meta.url));if(!r.ok)throw Error('WT原包关卡文件读取失败，请检查本地服务');return r.json();}
export async function wtSourceCatalogue(){
  if(!cataloguePromise)cataloguePromise=json('catalogue.json').then(c=>{if(c.version!=='1.4.0'||c.schemaVersion!==2||c.packageName!=='com.agavegames.wordtiles')throw Error('WT原包版本不匹配');return c;}).catch(e=>{cataloguePromise=null;throw e;});
  return cataloguePromise;
}
export async function wtSourceBank(){
  if(!bankPromise)bankPromise=wtSourceCatalogue().then(async c=>{const info=c.languages.find(l=>l.language==='english');const b=await json(info.file);if(b.language!=='english'||Object.keys(b.levels).length!==info.count)throw Error('英文原包关卡库不完整');return b;}).catch(e=>{bankPromise=null;throw e;});
  return bankPromise;
}
export function originalOrder(order){return order==='main'?'level_list_0':order;}
export async function wtSourceLevel(position=1,order='level_list_0'){
  const [c,b]=await Promise.all([wtSourceCatalogue(),wtSourceBank()]);order=originalOrder(order);
  const ids=b.orders[order];if(!ids||!Number.isSafeInteger(position)||position<1||position>ids.length)throw Error('原包关号不在所选列表范围内');
  return convertWTLevel(b.levels[String(ids[position-1])],{order,bank:order,position,sha256:c.sha256});
}
