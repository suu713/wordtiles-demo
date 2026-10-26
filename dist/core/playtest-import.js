import {createAlgorithmSession,isV1Level,migrateLegacyLevel} from './algorithm-v1-adapter.js?v=38';
import {createBankDictionary} from './dictionary-banks.js?v=23';
import {validateWTLevel} from './wt-source-session.js?v=40';
import {wtSourceBank,originalOrder} from './wt-source-library.js?v=40';

export const MAX_PLAYTEST_UPLOAD_BYTES=20*1024*1024;
export const MAX_PLAYTEST_UPLOAD_LEVELS=10000;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

// Validate the whole file before publishing it as a new source. Do not insert
// uploaded levels into the editor's saved sequence or rewrite their geometry.
export async function parsePlaytestUpload(text,{fallbackDictionary,loadOriginalBank=wtSourceBank,onProgress=()=>{}}={}){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_PLAYTEST_UPLOAD_BYTES)throw new Error('关卡 JSON 不能超过 20 MB');
  let data;
  try{data=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('JSON 格式不正确，请上传导出的关卡文件');}
  let items,format;
  if(Array.isArray(data)){items=data;format='array';}
  else if(object(data)&&Array.isArray(data.levels)){
    if(data.job&&data.levels.some(item=>!object(item?.level)&&!Array.isArray(item?.targets)))throw new Error('这是反跑统计报告，不含完整棋盘；请上传单关、批量生成或关序 JSON');
    items=data.levels;format=Array.isArray(data.dictionaries)?'sequence':'batch';
  }else if(object(data)&&(object(data.level)||Array.isArray(data.targets))){items=[data];format='single';}
  else throw new Error('请选择单关、批量生成或关序 JSON');
  if(!items.length)throw new Error('文件里没有关卡');
  if(items.length>MAX_PLAYTEST_UPLOAD_LEVELS)throw new Error('每个文件最多 10,000 关，请拆分后上传');

  const dictionaries=new Map(),reconstructed=new Map(),entries=[];
  if(data.dictionaries!==undefined&&!Array.isArray(data.dictionaries))throw new Error('文件中的词库列表格式不正确');
  for(const dictionary of data.dictionaries||[]){
    if(!object(dictionary)||typeof dictionary.version!=='string')throw new Error('文件中有无效的词库信息');
    if(dictionaries.has(dictionary.version)&&JSON.stringify(dictionaries.get(dictionary.version))!==JSON.stringify(dictionary))throw new Error('同一词库版本对应了不同内容');
    dictionaries.set(dictionary.version,dictionary);
  }
  let originalBankPromise;
  onProgress(0,items.length);
  for(let index=0;index<items.length;index++){
    try{
      const item=items[index],level=object(item?.level)?item.level:item;
      if(!object(level)||!Array.isArray(level.targets))throw new Error('缺少完整的棋盘和目标词');
      if(level.source?.language&&level.source.language!=='english')throw new Error('目前只支持英语关卡');
      if(level.schemaVersion===3||level.algorithm===1){
        const checked=validateWTLevel(level);
        if(!checked.valid)throw new Error(checked.errors[0].message);
        originalBankPromise??=Promise.resolve(loadOriginalBank());
        const bank=await originalBankPromise,raw=level.source.original;
        if(JSON.stringify(bank.levels[String(raw.id)])!==JSON.stringify(raw))throw new Error('该关卡与 WT 1.4.0 英文原始配置不一致');
        let order=originalOrder(level.source.order||'all'),position=bank.orders[order]?.indexOf(raw.id)??-1;
        if(position<0){order='all';position=bank.orders.all.indexOf(raw.id);}
        if(position<0)throw new Error('原包关卡编号不在关卡库中');
        entries.push({level,number:index+1,originalOrder:order,originalPosition:position+1});
      }else{
        if(item.dictionaryVersion&&level.dictionaryVersion&&item.dictionaryVersion!==level.dictionaryVersion)throw new Error('关卡记录与关卡内容的词库版本不一致');
        const version=item.dictionaryVersion||level.dictionaryVersion;
        let dictionary=item.dictionary||dictionaries.get(version)||data.dictionary;
        if(item.dictionaryVersion&&data.dictionaries&&!dictionary)throw new Error('找不到关卡对应的词库 '+item.dictionaryVersion);
        if(!dictionary&&level.source?.dictionaryMetadata){
          const metadata=level.source.dictionaryMetadata,key=JSON.stringify(metadata);
          if(!reconstructed.has(key))reconstructed.set(key,createBankDictionary(metadata.lengths,metadata.origin,metadata.tiers));
          dictionary=reconstructed.get(key);
        }
        dictionary??=fallbackDictionary;
        if(!dictionary)throw new Error('缺少关卡词库，请从编辑器重新导出关序或批量文件');
        let entry={level,dictionary};
        if(isV1Level(level)&&!level.source?.dictionaryOrigin)entry={level:migrateLegacyLevel(level,dictionary),dictionary};
        createAlgorithmSession(entry.level,entry.dictionary);
        entries.push({...entry,number:index+1});
      }
    }catch(error){
      const reason=error.report?.errors?.[0]?.message||error.message;
      throw new Error('第 '+(index+1)+' 关校验失败：'+reason);
    }
    if((index+1)%10===0||index===items.length-1)onProgress(index+1,items.length);
  }
  return {entries,count:entries.length,format};
}
