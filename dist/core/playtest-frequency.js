import {WORD_ENTRIES,WORDLIST_VERSION} from './word-source.js?v=1';

// Excel's 1–5 rarity annotation is the single in-app proxy for familiarity.
const rarityToZipf=Object.freeze({1:5.1,2:4.5,3:3.9,4:3.3,5:2.7});
const zipf=Object.create(null);
for(const entry of WORD_ENTRIES){
  const score=rarityToZipf[entry.rarity]??3.2;
  zipf[entry.word]=score;
}
export const ENGLISH_FREQUENCY=Object.freeze({
  version:`wt-workbook-rarity-proxy-v1-${WORDLIST_VERSION}`,
  language:'english',
  approximation:'WT词库.xlsx 生僻程度 1–5 映射；不是独立词频数据',
  zipf:Object.freeze(zipf)
});
