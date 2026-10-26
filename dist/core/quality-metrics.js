import {createNeighbors,validateLevel,signature} from './rules.js?v=21';
import {matchesQualityTemplate,QUALITY_CONFIG_VERSION} from './quality-config.js?v=39';
export const QUALITY_METRICS_VERSION='quality-metrics-v3.1';
const clamp=value=>Math.max(0,Math.min(1,value));
const average=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
export function containmentType(a,b){const [short,long]=a.length<=b.length?[a,b]:[b,a];return a===b?null:long.startsWith(short)?'prefix':long.endsWith(short)?'suffix':long.includes(short)?'inner':null;}
export function normalizedQualityLevel(level){
  if(level.board)return level;
  return {schemaVersion:2,seed:level.seed,board:{rows:level.rows,cols:level.cols,letters:level.letters,counts:level.initialCounts},config:{rows:level.rows,cols:level.cols,wordLengths:level.targets.map(t=>t.word.length),maxUses:level.config?.maxUses??3},targets:level.targets.map(t=>({word:t.word,path:t.canonicalPath})),source:level.source};
}
export function pairSpellingSimilarity(a,b){
  const counts=word=>{const out={};for(const letter of word)out[letter]=(out[letter]||0)+1;return out;},ac=counts(a),bc=counts(b);
  const shared=Object.keys(ac).reduce((sum,key)=>sum+Math.min(ac[key],bc[key]||0),0),dice=2*shared/(a.length+b.length);
  let last=Array(b.length+1).fill(0),longest=0;
  for(let i=1;i<=a.length;i++){const next=Array(b.length+1).fill(0);for(let j=1;j<=b.length;j++)if(a[i-1]===b[j-1]){next[j]=last[j-1]+1;longest=Math.max(longest,next[j]);}last=next;}
  let edits=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,edits[j]+1,edits[j-1]+Number(a[i-1]!==b[j-1]));edits=next;}
  const commonSubstring=longest/Math.min(a.length,b.length),editSimilarity=1-edits[b.length]/Math.max(a.length,b.length);
  return {a,b,dice,commonSubstring,editSimilarity,pairSimilarity:.5*dice+.3*commonSubstring+.2*editSimilarity};
}
const trieCache=new WeakMap();
function trieFor(dictionary){
  if(dictionary&&trieCache.has(dictionary))return trieCache.get(dictionary);
  const root={children:new Map()};
  for(const raw of dictionary?.words||[]){if(typeof raw!=='string'||!/^[A-Z]+$/.test(raw))continue;let node=root;for(const letter of raw){if(!node.children.has(letter))node.children.set(letter,{children:new Map()});node=node.children.get(letter);}node.word=raw;}
  if(dictionary)trieCache.set(dictionary,root);return root;
}
function pathFeatures(path,board,trie){
  const {rows,cols}=board,neighbors=createNeighbors(rows,cols),used=new Set();let turns=0,extraBranches=0,node=trie;
  for(let i=0;i<path.length;i++){
    const cell=path[i];used.add(cell);node=node?.children.get(board.letters[cell]);
    if(i>=2&&path[i]-path[i-1]!==path[i-1]-path[i-2])turns++;
    if(i<path.length-1){const valid=neighbors[cell].filter(next=>!used.has(next)&&board.counts[next]>0&&node?.children.has(board.letters[next]));extraBranches+=Math.max(0,valid.length-Number(valid.includes(path[i+1])));}
  }
  const rr=path.map(cell=>Math.floor(cell/cols)),cc=path.map(cell=>cell%cols),rowSpan=Math.max(...rr)-Math.min(...rr),colSpan=Math.max(...cc)-Math.min(...cc);
  return {path:[...path],turns,rowSpan,colSpan,pathSpan:.5*(rowSpan/Math.max(1,rows-1)+colSpan/Math.max(1,cols-1)),extraBranches,branchNodes:Math.max(0,path.length-1),wordBranching:path.length>1?extraBranches/(path.length-1):0};
}
const easiest=(a,b)=>a.turns-b.turns||a.wordBranching-b.wordBranching||a.pathSpan-b.pathSpan||a.path.join(',').localeCompare(b.path.join(','));
function reliableZipf(frequency,word){
  if(!frequency||frequency.approximation||frequency.reliable!==true)return null;
  const entry=frequency.zipf?.[word];return Number.isFinite(entry)&&entry>=0&&entry<=8?entry:null;
}
function scanDictionary(board,dictionary,visit){
  const trie=trieFor(dictionary),neighbors=createNeighbors(board.rows,board.cols),used=new Set(),path=[],found=new Map();let complete=true;
  const walk=(cell,parent)=>{
    visit();if(used.has(cell)||board.counts[cell]<=0)return;
    const node=parent.children.get(board.letters[cell]);if(!node)return;
    used.add(cell);path.push(cell);
    if(node.word){const paths=found.get(node.word)||[];paths.push([...path]);found.set(node.word,paths);}
    for(const next of neighbors[cell])if(node.children.size)walk(next,node);
    path.pop();used.delete(cell);
  };
  try{for(let cell=0;cell<board.letters.length;cell++)walk(cell,trie);}catch(error){if(error.code==='QUALITY_BUDGET')complete=false;else throw error;}
  return {found,complete};
}
export function calculateLevelQuality(input,options={}){
  const level=normalizedQualityLevel(input),{board}=level,words=level.targets.map(t=>t.word),frequency=options.frequency;
  const validation=options.validation||validateLevel(level,options.mainDictionary);
  const metadata={metricsVersion:QUALITY_METRICS_VERSION,configVersion:QUALITY_CONFIG_VERSION,algorithmVersion:input.algorithmVersion||input.generatorVersion||null,dictionaryVersion:options.mainDictionary?.version??input.dictionaryVersion??null,seed:input.seed,frequencyVersion:frequency?.version??null};
  if(!validation.valid)return {metadata,hardValid:false,hardErrors:validation.errors,values:null,words:[],warnings:['玩法硬性校验失败，不进入质量评分。']};
  const warnings=[],targetSet=new Set(words),bonusSet=new Set(options.extraDictionary?.words||[]),blockedSet=new Set(options.blockedWords||[]);
  const legalDictionary=options.legalDictionary||{words:[...new Set([...(options.mainDictionary?.words||[]),...bonusSet])]};
  const legalTrie=trieFor(legalDictionary);
  const templateMatched=matchesQualityTemplate({rows:board.rows,cols:board.cols,maxUses:level.config?.maxUses??3,wordLengths:words.map(w=>w.length)});
  if(!templateMatched)warnings.push('当前棋盘或词长不是 V3 固定模板，不套用 3×3 的目标范围。');
  const known=words.map(word=>reliableZipf(frequency,word)),frequencyValues=known.filter(v=>v!==null),freqCoverage=frequencyValues.length/words.length;
  if(freqCoverage<.8)warnings.push('可靠 Zipf 覆盖不足 80%；词频门槛不执行。工作簿生僻档位仅作近似参考。');
  const pairs=[];let prefixPairCount=0,suffixPairCount=0,innerSubstringPairCount=0;
  for(let i=0;i<words.length;i++)for(let j=i+1;j<words.length;j++){
    const pair=pairSpellingSimilarity(words[i],words[j]),[short,long]=words[i].length<=words[j].length?[words[i],words[j]]:[words[j],words[i]];
    pair.containment=containmentType(short,long);
    if(pair.containment==='prefix')prefixPairCount++;if(pair.containment==='suffix')suffixPairCount++;if(pair.containment==='inner')innerSubstringPairCount++;pairs.push(pair);
  }
  const possibleLengths=new Set(options.possibleLengths||level.config?.wordLengths||words.map(w=>w.length));
  const uniqueStartRatio=new Set(words.map(word=>word[0])).size/words.length,uniqueEndRatio=new Set(words.map(word=>word.at(-1))).size/words.length;
  const lengthDiversity=new Set(words.map(word=>word.length)).size/Math.max(1,possibleLengths.size),fixedLengths=options.fixedLengthTemplate??templateMatched;
  const lemmas=options.lemmas?.reliable===true?words.map(word=>options.lemmas.words?.[word]):[];
  const stemDiversity=lemmas.length===words.length&&lemmas.every(word=>typeof word==='string'&&word)?new Set(lemmas).size/words.length:null;
  if(stemDiversity===null)warnings.push('未提供可靠词元／词根标记，词根多样性不可用。');
  const wordDetails=level.targets.map((target,index)=>{
    const all=validation.targets.find(t=>t.word===target.word)?.paths||[],paths=all.map(path=>pathFeatures(path,board,legalTrie)).sort(easiest),best=paths[0];
    const zipf=known[index],lengthEase=clamp((7-target.word.length)/4),turnEase=1-Math.min(best.turns,3)/3,branchEase=1-Math.min(best.wordBranching,2)/2;
    const pathEase=(.30*lengthEase+.20*turnEase+.15*branchEase)/.65,wordEase=zipf===null?null:.35*clamp((zipf-3)/3)+.30*lengthEase+.20*turnEase+.15*branchEase;
    return {word:target.word,length:target.word.length,zipf,zipfEstimate:Number.isFinite(frequency?.zipf?.[target.word])?frequency.zipf[target.word]:null,frequencyComplete:zipf!==null,
      ...best,wordTurnCount:best.turns,wordEase,pathEase,pathCount:paths.length,consumptionSetCount:new Set(all.map(signature)).size,
      alternatives:paths,minTurns:best.turns,maxTurns:Math.max(...paths.map(path=>path.turns)),minBranching:Math.min(...paths.map(path=>path.wordBranching)),maxBranching:Math.max(...paths.map(path=>path.wordBranching))};
  });
  const shared=board.counts.filter(count=>count>=2).length,active=board.counts.filter(count=>count>0).length;
  let maxPairOverlap=0;for(let i=0;i<wordDetails.length;i++)for(let j=i+1;j<wordDetails.length;j++){const set=new Set(wordDetails[i].path);maxPairOverlap=Math.max(maxPairOverlap,wordDetails[j].path.filter(cell=>set.has(cell)).length);}
  let nodes=0;const visit=()=>{if(options.isCancelled?.())throw Object.assign(new Error('质量分析已取消'),{code:'CANCELLED'});if(++nodes>(options.maxSearchNodes??100000))throw Object.assign(new Error('质量搜索预算耗尽'),{code:'QUALITY_BUDGET'});};
  const review=options.reviewDictionary,scan=review?scanDictionary(board,review,visit):{found:new Map(),complete:false},reviewComplete=!!review&&review.metadata?.complete===true;
  if(!scan.complete)warnings.push('审核词典缺失或棋盘搜词预算耗尽，干扰统计不完整。');
  if(!reviewComplete)warnings.push('审核词典仅覆盖已提供的词库，可能低估词典以外的干扰词。');
  if(!options.extraDictionary&&!options.legalDictionary)warnings.push('未提供完整的额外词集合，前缀分支干扰可能被低估。');
  const categories={targetWords:[...words],rewardedExtraWords:[],ignoredValidWords:[],blockedWords:[]},distractorDetails=[];
  for(const [word,paths] of [...scan.found].sort(([a],[b])=>a.localeCompare(b))){
    if(targetSet.has(word))continue;
    const type=blockedSet.has(word)?'blockedWords':bonusSet.has(word)?'rewardedExtraWords':'ignoredValidWords';categories[type].push(word);
    const features=paths.map(path=>pathFeatures(path,board,legalTrie)).sort(easiest)[0],zipf=reliableZipf(frequency,word),visibility=.5*(1-Math.min(features.turns,3)/3)+.5*clamp((7-word.length)/4);
    distractorDetails.push({word,type,zipf,...features,visibility,score:type==='ignoredValidWords'&&zipf!==null?clamp((zipf-3)/2.5)*visibility:null});
  }
  const ignored=distractorDetails.filter(item=>item.type==='ignoredValidWords'),ignoredFrequencyComplete=ignored.every(item=>item.zipf!==null),distractorComplete=scan.complete&&reviewComplete&&ignoredFrequencyComplete;
  if(!ignoredFrequencyComplete)warnings.push('干扰词缺少可靠 Zipf，干扰评分不可用，不以 0 分代替。');
  const distractorScore=distractorComplete?ignored.reduce((sum,item)=>sum+item.score,0):null,wordEases=wordDetails.map(word=>word.wordEase).filter(value=>value!==null);
  const values={avgZipf:average(frequencyValues),minZipf:frequencyValues.length?Math.min(...frequencyValues):null,maxZipf:frequencyValues.length?Math.max(...frequencyValues):null,
    veryCommonCount:frequencyValues.length?frequencyValues.filter(v=>v>=4.5).length:null,lowFrequencyCount:frequencyValues.length?frequencyValues.filter(v=>v<3.5).length:null,freqCoverage,
    avgZipfEstimate:average(wordDetails.map(word=>word.zipfEstimate).filter(Number.isFinite)),
    avgPairSimilarity:average(pairs.map(pair=>pair.pairSimilarity)),relatedPairCount:pairs.filter(pair=>pair.pairSimilarity>=.55).length,highSimilarityPairCount:pairs.filter(pair=>pair.pairSimilarity>=.80).length,
    prefixPairCount,suffixPairCount,innerSubstringPairCount,containmentPairCount:prefixPairCount+suffixPairCount+innerSubstringPairCount,
    uniqueStartRatio,uniqueEndRatio,lengthDiversity,stemDiversity,wordFormDiversity:fixedLengths ? .5*uniqueStartRatio+.5*uniqueEndRatio : .4*uniqueStartRatio+.4*uniqueEndRatio+.2*lengthDiversity,
    totalTurnCount:wordDetails.reduce((sum,word)=>sum+word.turns,0),avgTurnCount:average(wordDetails.map(word=>word.turns)),maxTurnCount:Math.max(...wordDetails.map(word=>word.turns)),straightRatio:wordDetails.filter(word=>word.turns===0).length/words.length,
    avgPathSpan:average(wordDetails.map(word=>word.pathSpan)),avgBranching:wordDetails.reduce((sum,word)=>sum+word.extraBranches,0)/Math.max(1,wordDetails.reduce((sum,word)=>sum+word.branchNodes,0)),
    sharedCellRate:shared/Math.max(1,active),doubleUseCount:board.counts.filter(n=>n===2).length,tripleUseCount:board.counts.filter(n=>n===3).length,maxPairOverlap,
    firstWordEase:wordEases.length?Math.max(...wordEases):null,easyStartCount:wordEases.length===words.length?wordEases.filter(score=>score>=.70).length:null,firstWordPathEase:Math.max(...wordDetails.map(word=>word.pathEase)),
    ignoredValidCount:scan.complete?categories.ignoredValidWords.length:null,ignoredCommonCount:distractorComplete?ignored.filter(item=>item.zipf>=4.5).length:null,rewardedExtraCount:scan.complete?categories.rewardedExtraWords.length:null,distractorScore,distractorPerTarget:distractorScore===null?null:distractorScore/words.length};
  return {metadata,hardValid:true,templateMatched,values,words:wordDetails,pairs,categories,distractorDetails,warnings,
    completeness:{frequency:freqCoverage,stem:stemDiversity!==null,paths:true,reviewSearch:scan.complete,reviewDictionary:reviewComplete,distractors:distractorComplete,prefixDictionary:!!options.mainDictionary&&!!options.extraDictionary,completableBranching:false},
    search:{nodes,limit:options.maxSearchNodes??100000},diversityWeights:fixedLengths?{start:.5,end:.5,length:0}:{start:.4,end:.4,length:.2}};
}
