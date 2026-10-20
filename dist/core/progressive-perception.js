import {createNeighbors} from './rules.js?v=21';
import {spatialLevelMetrics,recognitionProbability} from './spatial-perception.js?v=29';

export const PROGRESSION_CALIBRATION=Object.freeze({
  version:'progressive-exposure-v1',knowledgeRate:.8,holeWeight:.35,lateExposureWeight:.25,routesPerCell:8,
  method:'conditional-knowledge / clearance-hazards / Gauss-Laguerre-8',humanValidated:false,
});
// Quadrature nodes are integration constants, not gameplay seeds or sampled runs.
const NODES=[.17027963230510093,.90370177679938,2.251086629866131,4.266700170287659,7.0459054023934655,10.758516010180996,15.740678641278004,22.863131736889265];
const WEIGHTS=[.36918858934163495,.4187867808143447,.17579498663717255,.033343492261215794,.0027945362352256834,.00009076508773358139,.000000848574671627257,.0000000010480011748715153];
const WEIGHT_SUM=WEIGHTS.reduce((sum,value)=>sum+value,0),cached=new WeakMap();
const popcount=value=>{let n=value,count=0;while(n){n&=n-1;count++;}return count;};
const boundary=(cell,board)=>cell<board.cols||cell>=board.cols*(board.rows-1)||cell%board.cols===0||cell%board.cols===board.cols-1;

// P(all m other words known | the focal word is known), using the existing
// stochastic rounding of 80% knowledge, rather than treating knowledge as rerolled.
export function conditionalKnowledgeRates(count,rate=PROGRESSION_CALIBRATION.knowledgeRate){
  const expected=count*rate,low=Math.floor(expected),fraction=expected-low;
  const scenarios=[[low,1-fraction],[low+1,fraction]].filter(([k,weight])=>k>0&&weight>0);
  return Array.from({length:count},(_,m)=>scenarios.reduce((sum,[k,weight])=>{
    let p=weight*k/expected;for(let i=0;i<m;i++)p*=Math.max(0,k-1-i)/(count-1-i);return sum+p;
  },0));
}

class MaxHeap{
  constructor(){this.values=[];}
  push(value){const a=this.values;let i=a.length;a.push(value);while(i){const parent=(i-1)>>1;if(a[parent].probability>=value.probability)break;a[i]=a[parent];i=parent;}a[i]=value;}
  pop(){const a=this.values;if(!a.length)return null;const first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].probability>a[child].probability)child++;if(a[child].probability<=last.probability)break;a[i]=a[child];i=child;}a[i]=last;}return first;}
}

// A cell disappears only when EVERY target owning one of its uses is solved.
// Outdoor routes retain shared prerequisites as a union: the same owner is never
// charged twice along one corridor. Retaining eight routes is conservative.
export function estimateClearing(board,owners,focal,cdf,knownRates,routeLimit=PROGRESSION_CALIBRATION.routesPerCell){
  const size=owners.length,neighbors=createNeighbors(board.rows,board.cols),memo=new Map(),blocked=1<<focal;
  const probabilityForMask=mask=>{
    if(mask&blocked)return 0;if(memo.has(mask))return memo.get(mask);
    let p=knownRates[popcount(mask)]??0,bits=mask;
    while(bits){const bit=bits&-bits;p*=cdf[31-Math.clz32(bit)];bits^=bit;}
    memo.set(mask,p);return p;
  };
  const local=Float64Array.from(owners,probabilityForMask),outside=new Float64Array(size),outsideMasks=new Uint32Array(size);
  const labels=Array.from({length:size},()=>[]),seen=Array.from({length:size},()=>new Set()),expanded=new Uint8Array(size),heap=new MaxHeap();
  function offer(cell,mask){
    const p=probabilityForMask(mask);if(p<=0||seen[cell].has(mask))return;seen[cell].add(mask);
    const current=labels[cell];if(current.some(item=>(item.mask&mask)===item.mask))return;
    const next=current.filter(item=>(item.mask&mask)!==mask),state={cell,mask,probability:p};next.push(state);next.sort((a,b)=>b.probability-a.probability||a.mask-b.mask);
    if(next.length>routeLimit)next.length=routeLimit;labels[cell]=next;if(next.includes(state))heap.push(state);
  }
  for(let cell=0;cell<size;cell++)if(boundary(cell,board))offer(cell,owners[cell]);
  for(let state;(state=heap.pop());){
    const {cell,mask,probability}=state;if(expanded[cell]>=routeLimit||!labels[cell].includes(state))continue;expanded[cell]++;
    if(probability>outside[cell]){outside[cell]=probability;outsideMasks[cell]=mask;}
    for(const next of neighbors[cell])offer(next,mask|owners[next]);
  }
  return {local,outside,outsideMasks,probabilityForMask};
}

export function clearanceTiming(mask,cdf,knownRates,focal){
  const m=popcount(mask),others=cdf.length-1,known=knownRates[m];
  if(!others)return {progress:0,weight:1};
  const conditional=known>0?(knownRates[m+1]||0)/known:0;
  let extra=0;for(let j=0;j<cdf.length;j++)if(j!==focal&&!(mask&(1<<j)))extra+=cdf[j]*conditional;
  const progress=Math.max(0,Math.min(1,(m+extra)/others));
  return {progress,weight:PROGRESSION_CALIBRATION.lateExposureWeight+(1-PROGRESSION_CALIBRATION.lateExposureWeight)*(1-progress)};
}

function empty(reason){return {progressionApplicable:false,progressionReason:reason,recognitionCorrectionVersion:PROGRESSION_CALIBRATION.version,
  meanCorrectedRecognition:null,recognitionCorrectionFactor:null,meanRecognitionGain:null,meanNewOuterShare:null,meanHoleExposureShare:null,meanAmbiguityReduction:null,exposureBenefitedTargets:null,correctedHardToSpotTargets:null,words:[]};}
function ownersFor(level){
  const {board,targets}=level,size=board.rows*board.cols;if(!Number.isInteger(size)||size<1||size>36||!Array.isArray(board.counts)||board.counts.length!==size||!Array.isArray(board.letters)||board.letters.length!==size||!targets.length||targets.length>18)return null;
  const owners=new Uint32Array(size),demand=new Uint8Array(size);
  for(let j=0;j<targets.length;j++){
    const path=targets[j].path;if(!Array.isArray(path)||!path.length||new Set(path).size!==path.length||path.some(cell=>!Number.isInteger(cell)||cell<0||cell>=size))return null;
    for(const cell of path){owners[cell]|=1<<j;demand[cell]++;}
  }
  return board.counts.every((count,cell)=>count===demand[cell])?owners:null;
}

export function progressiveLevelMetrics(level){
  if(cached.has(level))return cached.get(level);
  if(level.kind==='zen'||!level.board)return empty('not-a-grid');
  if((level.source?.language||'english')!=='english')return empty('english-only');
  const owners=ownersFor(level);if(!owners)return empty('unverified-tile-uses');
  const initial=spatialLevelMetrics(level),words=initial.words,n=words.length,board=level.board,neighbors=createNeighbors(board.rows,board.cols);
  const knownRates=conditionalKnowledgeRates(n),hazards=words.map(word=>-Math.log1p(-word.recognitionProbability));
  const corrected=words.map((word,focal)=>{
    const alternatives=[],used=new Set();
    for(let i=0;i<word.path.length;i++){
      const cell=word.path[i];used.add(cell);if(!i)continue;
      for(const next of neighbors[word.path[i-1]])if(next!==cell&&!used.has(next)&&board.letters[next]===board.letters[cell])alternatives.push(next);
    }
    let score=0,newOuter=0,holes=0,ambiguityReduction=0,exposureMass=0,exposureProgress=0;
    for(let q=0;q<NODES.length;q++){
      const time=NODES[q]/hazards[focal],weight=WEIGHTS[q]/WEIGHT_SUM;
      const cdf=hazards.map((hazard,j)=>j===focal?0:-Math.expm1(-hazard*time));
      const clearing=estimateClearing(board,owners,focal,cdf,knownRates),timings=new Map();
      const timing=mask=>{if(!timings.has(mask))timings.set(mask,clearanceTiming(mask,cdf,knownRates,focal));return timings.get(mask);};
      let effectiveOuter=0,effectiveHole=0,rawOuter=0,rawHole=0,progressMass=0,progressSum=0;
      for(const cell of word.path){
        if(boundary(cell,board))continue;
        let ext=0,extMask=0,local=0,localMask=0;
        for(const next of neighbors[cell]){
          if(clearing.outside[next]>ext){ext=clearing.outside[next];extMask=clearing.outsideMasks[next];}
          if(clearing.local[next]>local){local=clearing.local[next];localMask=owners[next];}
        }
        const hole=Math.max(0,local-ext),et=timing(extMask),ht=timing(localMask);
        rawOuter+=ext;rawHole+=hole;effectiveOuter+=ext*et.weight;effectiveHole+=hole*ht.weight;
        progressMass+=ext+hole;progressSum+=ext*et.progress+hole*ht.progress;
      }
      let removed=0;for(const cell of alternatives)removed+=clearing.probabilityForMask(owners[cell])*timing(owners[cell]).weight;
      removed/=Math.max(1,word.length-1);
      const features={...word,edgeShare:Math.min(1,word.edgeShare+(effectiveOuter+PROGRESSION_CALIBRATION.holeWeight*effectiveHole)/word.length),ambiguity:Math.max(0,word.ambiguity-removed)};
      score+=weight*recognitionProbability(features);newOuter+=weight*rawOuter/word.length;holes+=weight*rawHole/word.length;ambiguityReduction+=weight*removed;
      exposureMass+=weight*progressMass;exposureProgress+=weight*progressSum;
    }
    const correctedRecognitionProbability=Math.max(word.recognitionProbability,score),recognitionGain=correctedRecognitionProbability-word.recognitionProbability;
    return {word:word.word,correctedRecognitionProbability,recognitionCorrectionFactor:correctedRecognitionProbability/word.recognitionProbability,recognitionGain,
      expectedNewOuterShare:newOuter,expectedHoleShare:holes,ambiguityReduction,expectedExposureProgress:exposureMass>1e-10?exposureProgress/exposureMass:null};
  });
  const mean=key=>corrected.reduce((sum,word)=>sum+word[key],0)/n,meanCorrectedRecognition=mean('correctedRecognitionProbability');
  const result={progressionApplicable:true,recognitionCorrectionVersion:PROGRESSION_CALIBRATION.version,meanCorrectedRecognition,
    recognitionCorrectionFactor:meanCorrectedRecognition/initial.meanKnownRecognition,meanRecognitionGain:meanCorrectedRecognition-initial.meanKnownRecognition,
    meanNewOuterShare:mean('expectedNewOuterShare'),meanHoleExposureShare:mean('expectedHoleShare'),meanAmbiguityReduction:mean('ambiguityReduction'),
    exposureBenefitedTargets:corrected.filter(word=>word.recognitionGain>1e-6).length,correctedHardToSpotTargets:corrected.filter(word=>word.correctedRecognitionProbability<.55).length,words:corrected};
  cached.set(level,result);return result;
}
