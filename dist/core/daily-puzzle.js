import {createBankDictionary,WORD_BANK_ORIGIN} from './dictionary-banks.js?v=1';
import {WORDLIST_VERSION} from './word-source.js?v=1';
import {DEFAULT_CONFIG} from './rules.js?v=21';
import {generateLevel} from './algorithm2.js?v=21';
import {createAlgorithmSession} from './algorithm-v1-adapter.js?v=21';

const dictionary=createBankDictionary([3,4,5],WORD_BANK_ORIGIN);
const systemSeed=()=>{
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  if(globalThis.crypto?.getRandomValues){const value=new Uint32Array(2);globalThis.crypto.getRandomValues(value);return `${value[0]}-${value[1]}`;}
  return `${Date.now()}-${Math.random()}-${Math.random()}`;
};
export const dailyPuzzleRecordId=day=>`${WORDLIST_VERSION}:daily-v2:${day}`;

export function createDailyPuzzle(day,seed=systemSeed()){
  if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('每日谜题日期格式无效');
  if((typeof seed!=='string'&&typeof seed!=='number')||String(seed).length<1)throw new Error('每日谜题随机种子无效');
  const result=generateLevel({},dictionary,seed,{engine:'flexible',levelConfig:DEFAULT_CONFIG});
  if(!result.ok)throw new Error(result.message||'今日谜题生成失败');
  return {levelId:dailyPuzzleRecordId(day),seed:String(seed),session:createAlgorithmSession(result.level,dictionary)};
}
