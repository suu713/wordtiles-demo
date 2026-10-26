export const QUALITY_CONFIG_VERSION='quality-v3-initial-1';
export const QUALITY_TEMPLATE=Object.freeze({rows:3,cols:3,wordLengths:Object.freeze([3,3,3,4,5]),maxUses:3});
export const QUALITY_WEIGHTS=Object.freeze({frequency:.25,combination:.20,path:.25,opener:.15,distractors:.15});
const common={highSimilarityPairCount:[0,2]},targets={
  easy:{avgZipf:[4.4,null],minZipf:[3.5,null],veryCommonCount:[3,null],relatedPairCount:[2,5],containmentPairCount:[0,2],totalTurnCount:[2,4],straightRatio:[.4,.6],avgPathSpan:[0,.65],firstWordEase:[.70,null],easyStartCount:[2,null],ignoredCommonCount:[0,1]},
  normal:{avgZipf:[4,null],minZipf:[3.2,null],veryCommonCount:[2,null],relatedPairCount:[1,4],containmentPairCount:[0,2],totalTurnCount:[3,6],straightRatio:[.2,.4],avgPathSpan:[.5,.8],firstWordEase:[.65,null],easyStartCount:[1,null],ignoredCommonCount:[0,2]},
  hard:{avgZipf:[3.8,null],minZipf:[3,null],veryCommonCount:[1,null],relatedPairCount:[1,4],containmentPairCount:[0,1],totalTurnCount:[4,8],straightRatio:[0,.2],avgPathSpan:[.6,1],firstWordEase:[.60,null],easyStartCount:[1,null],ignoredCommonCount:[0,3]}
};
export const QUALITY_LABELS=Object.freeze({avgZipf:'目标词平均 Zipf',minZipf:'最低 Zipf',maxZipf:'最高 Zipf',veryCommonCount:'常见目标词数',lowFrequencyCount:'低频目标词数',freqCoverage:'可靠词频覆盖率',avgZipfEstimate:'平均熟悉度近似分',avgPairSimilarity:'平均拼写相似度',relatedPairCount:'相关词对数',highSimilarityPairCount:'高度相似词对数',prefixPairCount:'前缀词对数',suffixPairCount:'后缀词对数',innerSubstringPairCount:'内部包含词对数',containmentPairCount:'包含词对总数',uniqueStartRatio:'首字母多样性',uniqueEndRatio:'尾字母多样性',lengthDiversity:'词长多样性',stemDiversity:'词根多样性',wordFormDiversity:'词形多样性分',totalTurnCount:'目标词最少转弯总数',avgTurnCount:'平均转弯数',maxTurnCount:'最大转弯数',straightRatio:'直线路径比例',avgPathSpan:'平均路径跨度',avgBranching:'前缀分支干扰',sharedCellRate:'共享格子比例',doubleUseCount:'恰用两次的格子',tripleUseCount:'恰用三次的格子',maxPairOverlap:'最大词对共享格数',firstWordEase:'开局易发现分',easyStartCount:'易开局目标词数',firstWordPathEase:'开局纯路径参考分',ignoredValidCount:'忽略的合法词数',ignoredCommonCount:'忽略的常见词数',rewardedExtraCount:'认可的额外词数',distractorScore:'干扰词评分',distractorPerTarget:'每目标词干扰分'});
export function normalizeQualityConfig(input={}){
  const difficulty=input.difficulty||'normal',mode=input.mode||'REPORT';
  if(!targets[difficulty]||!['REPORT','RANK','FILTER'].includes(mode))throw new Error('质量难度或模式无效');
  const maxCandidates=input.maxCandidates??20,maxSearchNodes=input.maxSearchNodes??100000;
  if(!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>200)throw new Error('质量候选数须为 1～200');
  if(!Number.isInteger(maxSearchNodes)||maxSearchNodes<1||maxSearchNodes>1000000)throw new Error('质量路径搜索预算须为 1～1000000');
  const ranges={...common,...targets[difficulty],...input.ranges};
  for(const [key,range] of Object.entries(ranges))if(!QUALITY_LABELS[key]||!Array.isArray(range)||range.length!==2||range.some(v=>v!==null&&!Number.isFinite(v))||(range[0]!==null&&range[1]!==null&&range[0]>range[1]))throw new Error('质量范围无效：'+key);
  const enabled=Object.fromEntries(Object.keys(ranges).map(key=>[key,true]));
  Object.assign(enabled,input.enabled);
  for(const [key,value] of Object.entries(enabled))if(!ranges[key]||typeof value!=='boolean')throw new Error('质量筛选开关无效：'+key);
  return {version:QUALITY_CONFIG_VERSION,difficulty,mode,maxCandidates,maxSearchNodes,ranges,enabled,weights:{...QUALITY_WEIGHTS}};
}
export function matchesQualityTemplate(config){return !!config&&config.rows===3&&config.cols===3&&(config.maxUses??3)===3&&[...(config.wordLengths||[])].sort((a,b)=>a-b).join(',')==='3,3,3,4,5';}
