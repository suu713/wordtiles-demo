import {createNeighbors,findWordPaths,signature} from './rules.js?v=21';
import calibration from '../playtest/spatial-calibration.json?v=29' with {type:'json'};
export const SPATIAL_CALIBRATION=Object.freeze(calibration);
export const PROGRESSION_CORRECTION_VERSION=calibration.progressionCorrection?.version||'dynamic-exposure-monte-carlo-v2';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function spatialPathFeatures(path,board,bottomUp=false,counts=null){
  if(!Array.isArray(path)||!path.length||!board)return null;
  const {rows,cols,letters}=board,row=cell=>bottomUp?rows-1-Math.floor(cell/cols):Math.floor(cell/cols),col=cell=>cell%cols;
  let turns=0,backward=0,right=0,down=0,ambiguity=0,lastDirection=null,longest=0,segment=0;
  const neighbors=createNeighbors(rows,cols),used=new Set();
  for(let i=0;i<path.length;i++){
    const cell=path[i];used.add(cell);if(!i)continue;
    const prior=path[i-1],dx=col(cell)-col(prior),dy=row(cell)-row(prior),direction=`${dx},${dy}`;
    if(dx<0||dy<0)backward++;if(dx>0)right++;if(dy>0)down++;
    if(lastDirection!==null&&lastDirection!==direction){turns++;segment=1;}else segment++;
    longest=Math.max(longest,segment);lastDirection=direction;
    ambiguity+=neighbors[prior].filter(next=>next!==cell&&!used.has(next)&&(!counts||counts[next]>0)&&letters[next]===letters[cell]).length;
  }
  const steps=Math.max(1,path.length-1),edgeTiles=path.filter(cell=>row(cell)===0||row(cell)===rows-1||col(cell)===0||col(cell)===cols-1).length;
  const backwardShare=backward/steps,edgeShare=edgeTiles/path.length;
  return {length:path.length,turns,backwardSteps:backward,rightSteps:right,downSteps:down,backwardShare,forwardShare:1-backwardShare,edgeTiles,edgeShare,
    readingForward:backward===0,reverseMajority:backwardShare>.5,mixedDirection:backward>0&&backward<path.length-1,outer:edgeShare>=.8,
    multiTurn:turns>=2,innerMultiTurn:turns>=2&&edgeShare<.5,straight:turns===0,oneTurn:turns===1,
    longestStraightRun:longest,ambiguity:ambiguity/steps,extraLength:Math.max(0,path.length-4),
    startReadPriority:1-(row(path[0])/Math.max(1,rows-1)+col(path[0])/Math.max(1,cols-1))/2};
}
export function recognitionProbability(features,{learning=0,coefficients=calibration.coefficients}={}){
  if(!features)return null;
  let score=coefficients.intercept;for(const key of ['backwardShare','turns','edgeShare','extraLength','ambiguity'])score+=(coefficients[key]||0)*features[key];
  score+=clamp(learning,0,5)*.18;
  return clamp(1/(1+Math.exp(-score)),.025,.985);
}

function progressionRng(level){
  const signature=JSON.stringify([level.board.rows,level.board.cols,level.board.letters,level.targets.map(target=>[target.word,target.path])]);let state=2166136261;
  for(let i=0;i<signature.length;i++)state=Math.imul(state^signature.charCodeAt(i),16777619)>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
function correctedRecognitionEstimates(level,words,bottomUp){
  const {rows,cols}=level.board,size=rows*cols,neighbors=createNeighbors(rows,cols),rng=progressionRng(level),knowledgeRate=calibration.progressionCorrection?.knownTargetRate??calibration.knowledgeRate??.8;
  const runs=calibration.progressionCorrection?.runsPerLevel||128,maxSearchesPerRun=Math.max(24,words.length*12);
  const exterior=(remaining)=>{
    const outside=new Uint8Array(size),queue=new Int16Array(size);let head=0,tail=0;
    const add=cell=>{if(remaining[cell]===0&&!outside[cell]){outside[cell]=1;queue[tail++]=cell;}};
    for(let col=0;col<cols;col++){add(col);add((rows-1)*cols+col);}
    for(let row=0;row<rows;row++){add(row*cols);add(row*cols+cols-1);}
    while(head<tail){const cell=queue[head++];for(const next of neighbors[cell])add(next);}
    let internalVoidCells=0;for(let cell=0;cell<size;cell++)if(remaining[cell]===0&&!outside[cell])internalVoidCells++;
    return {outside,internalVoidCells};
  };
  const exposure=(path,open)=>{
    const {outside,internalVoidCells}=open;let exposed=0;
    for(const cell of path){const row=bottomUp?rows-1-Math.floor(cell/cols):Math.floor(cell/cols),col=cell%cols;
      const onBorder=row===0||row===rows-1||col===0||col===cols-1;
      if(onBorder||neighbors[cell].some(next=>outside[next]===1))exposed++;
    }
    return {share:exposed/Math.max(1,path.length),internalVoidCells};
  };
  const samples=words.map(()=>({recognition:[],exposureTurn:[],exposureAtSolve:[],ambiguityReduction:[],internalVoids:[]}));
  for(let run=0;run<runs;run++){
    const expected=words.length*knowledgeRate,knownCount=Math.floor(expected)+Number(rng()<expected-Math.floor(expected));
    const order=words.map((_,index)=>index);
    for(let i=order.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    const known=new Uint8Array(words.length);order.slice(0,knownCount).forEach(index=>known[index]=1);
    const pending=new Uint8Array(words.length);pending.set(known);
    const remaining=(level.board.counts||Array(size).fill(1)).slice();
    const misses=new Uint8Array(words.length),firstHalfExposure=new Int16Array(words.length);firstHalfExposure.fill(-1);
    const lastProbability=new Float64Array(words.length),lastExposure=new Float64Array(words.length),lastAmbiguity=new Float64Array(words.length),lastVoids=new Float64Array(words.length);
    let cleared=0;
    for(let search=0;search<maxSearchesPerRun&&pending.some(Boolean);search++){
      const candidates=[],open=exterior(remaining);
      for(let index=0;index<words.length;index++)if(pending[index]){
        const item=words[index],dynamic=spatialPathFeatures(item.path,level.board,bottomUp,remaining),visible=exposure(item.path,open);
        if(firstHalfExposure[index]<0&&visible.share>=.5)firstHalfExposure[index]=cleared;
        // Empty cells inside a sealed pocket do not count as exposure. Only the
        // board edge and empty cells connected to the exterior open a word up.
        const effectiveEdgeShare=Math.max(item.edgeShare,visible.share);
        const probability=recognitionProbability({...dynamic,edgeShare:effectiveEdgeShare},{learning:misses[index]});
        lastProbability[index]=probability;lastExposure[index]=visible.share;
        lastAmbiguity[index]=Math.max(0,item.ambiguity-dynamic.ambiguity);lastVoids[index]=visible.internalVoidCells;
        // A light top/left reading-order prior resolves near ties; spatial
        // readability and current exposure remain the dominant factors.
        candidates.push({index,probability,priority:probability+.025*item.startReadPriority});
      }
      if(!candidates.length)break;
      candidates.sort((a,b)=>b.priority-a.priority||a.index-b.index);
      let selected=null;
      for(const candidate of candidates){if(rng()<candidate.probability){selected=candidate;break;}misses[candidate.index]++;}
      if(!selected)continue;
      const {index,probability}=selected,record=samples[index];
      record.recognition.push(probability);
      record.exposureTurn.push(firstHalfExposure[index]<0?null:firstHalfExposure[index]);
      record.exposureAtSolve.push(lastExposure[index]);record.ambiguityReduction.push(lastAmbiguity[index]);record.internalVoids.push(lastVoids[index]);
      pending[index]=0;cleared++;
      // A shared cell only opens the board after its last remaining target use
      // is consumed. Unknown words are never cleared and remain real blockers.
      for(const cell of words[index].path)remaining[cell]=Math.max(0,remaining[cell]-1);
    }
    // Bounded fallback: retain the last measured state for a known word that
    // remained undiscovered, instead of silently excluding it from the score.
    for(let index=0;index<words.length;index++)if(known[index]&&pending[index]){
      const record=samples[index];record.recognition.push(lastProbability[index]||words[index].recognitionProbability);
      record.exposureTurn.push(firstHalfExposure[index]<0?null:firstHalfExposure[index]);
      record.exposureAtSolve.push(lastExposure[index]);record.ambiguityReduction.push(lastAmbiguity[index]);record.internalVoids.push(lastVoids[index]);
    }
  }
  const average=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
  return samples.map((sample,index)=>({
    probability:average(sample.recognition)??words[index].recognitionProbability,
    meanFirstHalfExposureTurn:average(sample.exposureTurn.filter(value=>value!==null)),
    halfExposureRate:sample.recognition.length?sample.exposureTurn.filter(value=>value!==null).length/sample.recognition.length:null,
    meanExposureAtDiscovery:average(sample.exposureAtSolve),
    meanAmbiguityReduction:average(sample.ambiguityReduction),
    meanInternalVoidCells:average(sample.internalVoids),knownSamples:sample.recognition.length
  }));
}

const cached=new WeakMap();
export function spatialLevelMetrics(level){
  if(level.kind==='zen'||!level.board)return {applicable:false,words:[],readingForwardTargets:null,reverseMajorityTargets:null,mixedDirectionTargets:null,outerTargets:null,spatialMultiTurnTargets:null,innerMultiTurnTargets:null,hardToSpotTargets:null,meanKnownRecognition:null,meanCorrectedRecognition:null,hardToSpotCorrectedTargets:null,meanProgressionGain:null,meanExposureAtDiscovery:null,meanFirstHalfExposureTurn:null,meanHalfExposureRate:null,meanAmbiguityReduction:null,meanInternalVoidCells:null,meanBackwardShare:null,meanEdgeShare:null,meanLayoutDifficulty:null};
  if(cached.has(level))return cached.get(level);
  const bottomUp=level.algorithm===1,words=level.targets.map(target=>{
    const required=signature(target.path),paths=findWordPaths(level.board.letters,target.word,null,null,level.board).filter(path=>signature(path)===required);
    const candidates=(paths.length?paths:[target.path]).map(path=>{const features=spatialPathFeatures(path,level.board,bottomUp);return {path,features,recognitionProbability:recognitionProbability(features)};}).sort((a,b)=>b.recognitionProbability-a.recognitionProbability);
    const best=candidates[0];return {word:target.word,...best.features,recognitionProbability:best.recognitionProbability,layoutDifficulty:100*(1-best.recognitionProbability),pathCount:candidates.length,path:best.path};
  });
  const corrected=correctedRecognitionEstimates(level,words,bottomUp);
  words.forEach((word,index)=>{word.correctedRecognitionProbability=corrected[index].probability;word.progressionGain=corrected[index].probability-word.recognitionProbability;
    word.meanFirstHalfExposureTurn=corrected[index].meanFirstHalfExposureTurn;word.halfExposureRate=corrected[index].halfExposureRate;word.meanExposureAtDiscovery=corrected[index].meanExposureAtDiscovery;
    word.meanAmbiguityReduction=corrected[index].meanAmbiguityReduction;word.meanInternalVoidCells=corrected[index].meanInternalVoidCells;word.knownSamples=corrected[index].knownSamples;});
  const mean=key=>{const values=words.map(word=>word[key]).filter(Number.isFinite);return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;};
  const result={applicable:true,words,readingForwardTargets:words.filter(w=>w.readingForward).length,reverseMajorityTargets:words.filter(w=>w.reverseMajority).length,
    mixedDirectionTargets:words.filter(w=>w.mixedDirection).length,outerTargets:words.filter(w=>w.outer).length,spatialMultiTurnTargets:words.filter(w=>w.multiTurn).length,
    innerMultiTurnTargets:words.filter(w=>w.innerMultiTurn).length,hardToSpotTargets:words.filter(w=>w.recognitionProbability<.55).length,
    hardToSpotCorrectedTargets:words.filter(w=>w.correctedRecognitionProbability<.55).length,meanKnownRecognition:mean('recognitionProbability'),
    meanCorrectedRecognition:mean('correctedRecognitionProbability'),meanProgressionGain:mean('progressionGain'),
    meanExposureAtDiscovery:mean('meanExposureAtDiscovery'),meanFirstHalfExposureTurn:mean('meanFirstHalfExposureTurn'),meanHalfExposureRate:mean('halfExposureRate'),
    meanAmbiguityReduction:mean('meanAmbiguityReduction'),meanInternalVoidCells:mean('meanInternalVoidCells'),
    meanBackwardShare:mean('backwardShare'),meanEdgeShare:mean('edgeShare'),meanLayoutDifficulty:mean('layoutDifficulty')};
  cached.set(level,result);return result;
}
export function attentionOrder(cells,board,rng,prior=null,bottomUp=false){
  const {rows,cols}=board,row=cell=>bottomUp?rows-1-Math.floor(cell/cols):Math.floor(cell/cols);
  return cells.map(cell=>{
    const r=row(cell),c=cell%cols,edge=r===0||r===rows-1||c===0||c===cols-1;
    let weight=1+.55*(1-r/rows)+.35*(1-c/cols)+(edge?.5:0);
    if(prior!==null){const dx=c-prior.cell%cols,dy=r-row(prior.cell),direction=`${dx},${dy}`;weight*=direction===prior.direction?3:dx>0||dy>0?1.5:.55;}
    return {cell,key:-Math.log(Math.max(1e-9,rng()))/weight};
  }).sort((a,b)=>a.key-b.key).map(item=>item.cell);
}
