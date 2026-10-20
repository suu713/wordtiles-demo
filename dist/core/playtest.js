import {createNeighbors} from './rules.js?v=21';
import {letterHintsForSession} from './letter-hints.js?v=33';
import {attentionOrder,spatialPathFeatures,recognitionProbability,SPATIAL_CALIBRATION} from './spatial-perception.js?v=29';

export const MODEL_VERSION='ordinary-english-spatial-v2';
export const DEFAULT_PROFILE=Object.freeze({version:MODEL_VERSION,language:'english',label:'普通英语休闲玩家',
  status:'structural-calibration',knowledgeRate:.8,scanBudget:160,thinkSeconds:5.5,mistakeRate:.09,knowledgeShift:0,
  hintAfter:6,maxHints:2,maxSteps:160});
export function hashSeed(text){let n=2166136261;for(const c of String(text)){n^=c.codePointAt(0);n=Math.imul(n,16777619);}return n>>>0;}
export function seededRandom(seed){let n=Number(seed)>>>0;return()=>{n+=0x6D2B79F5;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
export function freshRandomSeed(){return crypto.getRandomValues(new Uint32Array(1))[0];}
const randomBuffer=new Uint32Array(1024);let randomOffset=randomBuffer.length;
function systemRandom(){if(randomOffset===randomBuffer.length){crypto.getRandomValues(randomBuffer);randomOffset=0;}return randomBuffer[randomOffset++]/4294967296;}
export const completedCount=session=>session.completedCount??session.completed.size;
export const targetCount=session=>session.targetCount??session.initial.targets.length;
export function normalizeProfile(input={}){
  const {patienceSeconds,knowledgeRate,...settings}=input,p={...DEFAULT_PROFILE,...settings,knowledgeRate:.8};
  if(!String(p.version).startsWith('english-observed-'))p.version=MODEL_VERSION;
  for(const [key,min,max] of [['scanBudget',10,2000],['thinkSeconds',.5,60],['mistakeRate',0,.7],['knowledgeShift',-2,2],['hintAfter',1,30],['maxHints',0,18],['maxSteps',1,2000]])
    if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw new Error('试玩参数 '+key+' 超出范围');
  for(const key of ['scanBudget','hintAfter','maxHints','maxSteps'])if(!Number.isInteger(p[key]))throw new Error(key+' 必须为整数');
  return p;
}
export function familiarity(zipf,shift=0){return .02+.96/(1+Math.exp(-(zipf-3.15+shift)*1.35));}
function shuffle(values,rng){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// Stochastic rounding preserves 80% average knowledge even for small levels.
export function assignTargetKnowledge(words,rng){
  const unique=[...new Set(words)],expected=unique.length*.8,whole=Math.floor(expected),count=whole+Number(rng()<expected-whole);
  return new Set(shuffle(unique,rng).slice(0,count));
}
function trieFor(words){const root={children:new Map()};for(const word of words){let node=root;for(const letter of word){if(!node.children.has(letter))node.children.set(letter,{children:new Map()});node=node.children.get(letter);}node.word=word;}return root;}
const lexicalTries=new WeakMap();
function lexicalMemoryTrie(frequency,lexicon){const key=lexicon||frequency;if(!lexicalTries.has(key))lexicalTries.set(key,trieFor(lexicon||Object.keys(frequency?.zipf||{})));return lexicalTries.get(key);}
// Inputs contain visible letters/counts and lexical memory, never target paths.
export function scanVisibleBoard(board,counts,trie,budget,rng,{bottomUp=false}={}){
  const neighbors=createNeighbors(board.rows,board.cols),found=[],path=[],used=new Set();let visited=0;
  const row=cell=>bottomUp?board.rows-1-Math.floor(cell/board.cols):Math.floor(cell/board.cols);
  function walk(cell,parent){
    if(visited>=budget||used.has(cell)||counts[cell]<=0)return;visited++;
    const node=parent.children.get(board.letters[cell]);if(!node)return;
    used.add(cell);path.push(cell);if(node.word)found.push({word:node.word,path:[...path]});
    if(path.length<45){const prior=path.length>1?path.at(-2):null,direction=prior===null?null:(cell%board.cols-prior%board.cols)+','+(row(cell)-row(prior));
      for(const next of attentionOrder(neighbors[cell],board,rng,{cell,direction},bottomUp))walk(next,node);}
    path.pop();used.delete(cell);
  }
  for(const cell of attentionOrder(board.letters.map((_,i)=>i),board,rng,null,bottomUp))walk(cell,trie);
  return {found,visited};
}
function scanPool(pool,trie,budget,rng){
  const letters=[...pool],used=new Set(),found=new Set();let visited=0;
  function walk(parent){for(const i of shuffle(letters.map((_,i)=>i),rng)){if(visited>=budget)return;if(used.has(i))continue;visited++;const node=parent.children.get(letters[i]);if(!node)continue;if(node.word)found.add(node.word);used.add(i);walk(node);used.delete(i);}}
  walk(trie);return {found:[...found],visited};
}

export class SimulationRun{
  constructor(session,{seed,profile=DEFAULT_PROFILE,frequency,lexicon,mode='ordinary'}={}){
    this.session=session;this.seed=seed===undefined?null:seed>>>0;this.profile=normalizeProfile(profile);this.mode=mode;this.frequency=frequency;
    this.runId=seed===undefined?crypto.randomUUID():String(seed);this.rng=seed===undefined?systemRandom:seededRandom(seed);
    this.events=[];this.elapsed=0;this.steps=0;this.hints=0;this.mistakes=0;this.attempts=0;this.trialSwipes=0;this.failedSwipes=0;this.stalls=0;this.scans=0;
    this.attempted=new Set();this.done=false;this.outcome=null;this.language=session.initial.source?.language||'english';
    if(mode==='ordinary'&&this.language!=='english')throw new Error('普通玩家模型仅校准英语；其他语言可选规则校验');
    if(mode==='ordinary'&&session.initial.mode==='bubble')throw new Error('分类词组暂不适用英语连词玩家模型，可选规则校验');
    if(mode==='ordinary'&&!frequency?.zipf)throw new Error('英语词频数据未加载');
    const words=session.initial.targets.map(t=>typeof t==='string'?t:t.word);this.targetWords=words;
    this.knownTargets=assignTargetKnowledge(words,this.rng);this.memory=new Map();
    this.wordStats=new Map([...new Set(words)].map(word=>[word,{word,known:this.knownTargets.has(word),seen:0,recognitions:0,misses:0,trialSwipes:0,hintLetters:0,completedBy:null}]));
    this.speed=.7+this.rng()*.65;this.bottomUp=session.initial.algorithm===1;this.trie=lexicalMemoryTrie(frequency||{},lexicon);
    this.letterHints=letterHintsForSession(session);this.shownPrefixes=new Map();this.hintTrie=null;
    this.fatigueThreshold=this.profile.hintAfter*2+Math.ceil(Math.sqrt(words.length))*2;
  }
  knows(word){if(this.wordStats.has(word))return this.knownTargets.has(word);if(!this.memory.has(word))this.memory.set(word,this.rng()<familiarity(this.frequency?.zipf[word]??0,this.profile.knowledgeShift));return this.memory.get(word);}
  completedWords(){return this.session.completed||new Set(this.session.initial.targets.filter((_,i)=>this.session.completedIndices.has(i)));}
  hintSupport(word){let support=0;const completed=this.completedWords();for(const [target,prefix] of this.shownPrefixes)if(!completed.has(target)&&word.length===target.length&&word.startsWith(prefix))support=Math.max(support,prefix.length);return support;}
  finish(outcome){this.done=true;this.outcome=outcome;return {type:'finish',outcome,elapsed:this.elapsed};}
  observeCandidates(){
    const p=this.profile,zen=this.session.initial.kind==='zen';let scan;
    if(zen){scan=scanPool(this.session.pool,this.trie,p.scanBudget,this.rng);scan.found=scan.found.map(word=>({word,value:word}));}
    else{scan=scanVisibleBoard(this.session.initial.board,this.session.counts,this.trie,p.scanBudget,this.rng,{bottomUp:this.bottomUp});scan.found=scan.found.map(c=>({...c,value:c.path}));}
    if(this.hintTrie){const more=zen?scanPool(this.session.pool,this.hintTrie,Math.ceil(p.scanBudget/2),this.rng):scanVisibleBoard(this.session.initial.board,this.session.counts,this.hintTrie,Math.ceil(p.scanBudget/2),this.rng,{bottomUp:this.bottomUp});
      scan.visited+=more.visited;scan.found.push(...more.found.map(c=>zen?{word:c,value:c}:{...c,value:c.path}));}
    this.scans++;
    const grouped=new Map(),completed=this.completedWords();
    for(const candidate of scan.found){
      if(completed.has(candidate.word)||this.attempted.has(candidate.word+':'+JSON.stringify(candidate.value)))continue;
      const features=zen?null:spatialPathFeatures(candidate.path,this.session.initial.board,this.bottomUp,this.session.counts),shown=this.hintSupport(candidate.word),known=this.knows(candidate.word);
      const learning=Math.min(5,this.stalls/4+(this.wordStats.get(candidate.word)?.trialSwipes||0)/3),layout=zen?.92:recognitionProbability(features,{learning});
      const recall=known?1:Math.min(.98,.025+.95*(shown/candidate.word.length)**2),probability=Math.min(.985,layout*recall+.12*shown/candidate.word.length);
      const item={...candidate,features,known,shown,probability};if(!grouped.has(candidate.word)||grouped.get(candidate.word).probability<probability)grouped.set(candidate.word,item);
    }
    const recognized=[],missed=[];
    for(const candidate of grouped.values()){
      const stat=this.wordStats.get(candidate.word);if(stat)stat.seen++;
      if(this.rng()<candidate.probability){if(stat)stat.recognitions++;recognized.push(candidate);}
      else{if(stat&&candidate.known)stat.misses++;if(candidate.known)missed.push(candidate);}
    }
    // Recall ranking uses lexical familiarity, never whether a word is a target.
    recognized.sort((a,b)=>(this.frequency?.zipf[b.word]??0)-(this.frequency?.zipf[a.word]??0));
    return {recognized,missed,scanNodes:scan.visited};
  }
  exploratorySwipe(missed){
    const board=this.session.initial.board;
    if(!board){const pool=shuffle([...this.session.pool],this.rng),length=Math.min(pool.length,2+Math.floor(this.rng()*Math.max(1,pool.length-1)));return {value:pool.slice(0,length).join(''),trial:true};}
    // A failed visual recognition can prompt a partial swipe along the visible prefix.
    if(missed.length&&this.rng()<.7){const focus=missed[Math.floor(this.rng()*missed.length)],length=Math.max(1,focus.path.length-1-Math.floor(this.rng()*Math.max(1,focus.path.length-2)));
      return {value:focus.path.slice(0,length),trial:true,focusWord:focus.word};}
    const live=this.session.counts.flatMap((count,i)=>count>0?[i]:[]);if(!live.length)return null;
    const pendingLengths=this.targetWords.filter(w=>!this.completedWords().has(w)).map(w=>w.length),desired=pendingLengths[Math.floor(this.rng()*pendingLengths.length)]||3;
    const start=attentionOrder(live,board,this.rng,null,this.bottomUp)[0],path=[start],neighbors=createNeighbors(board.rows,board.cols);
    while(path.length<desired){const options=neighbors[path.at(-1)].filter(i=>this.session.counts[i]>0&&!path.includes(i));if(!options.length)break;path.push(attentionOrder(options,board,this.rng,{cell:path.at(-1),direction:null},this.bottomUp)[0]);}
    return {value:path,trial:true};
  }
  useLetterHint(){
    const revealed=this.letterHints.reveal(1,this.completedWords(),this.rng);if(!revealed.length)return null;
    this.hints++;for(const item of revealed){const prefix=[...item.word].slice(0,item.index+1).join('');this.shownPrefixes.set(item.word,prefix);this.wordStats.get(item.word).hintLetters++;}
    this.hintTrie=trieFor([...this.shownPrefixes].filter(([word,prefix])=>word===prefix).map(([word])=>word));
    this.stalls=Math.max(0,this.stalls-2);const seconds=2*this.speed;this.elapsed+=seconds;
    const event={step:this.steps,type:'hint',revealed,seconds,elapsed:this.elapsed};this.events.push(event);return event;
  }
  step(){
    if(this.done)return null;if(this.session.status==='won')return this.finish('won');if(this.session.status==='anomaly')return this.finish('anomaly');
    const p=this.profile;if(this.steps>=p.maxSteps)return this.finish('search-limit');
    if(this.mode==='ordinary'&&this.stalls>=this.fatigueThreshold&&(this.hints>=p.maxHints||!this.letterHints.remaining(this.completedWords()))&&this.rng()<Math.min(1,.12+(this.stalls-this.fatigueThreshold)*.09))return this.finish('gave-up');
    this.steps++;let action,scanNodes=0;
    if(this.mode==='rules'){const hint=this.session.hint();if(!hint)return this.finish('anomaly');action={value:hint.value||hint.path,word:hint.word,trial:false};}
    else{
      if(this.stalls>=p.hintAfter&&this.hints<p.maxHints){const event=this.useLetterHint();if(event)return event;}
      const scan=this.observeCandidates();scanNodes=scan.scanNodes;
      if(scan.recognized.length){const choice=scan.recognized[Math.floor(this.rng()*Math.min(4,scan.recognized.length))];action={...choice,trial:!choice.known,focusWord:choice.word};
        if(this.rng()<p.mistakeRate){action.value=Array.isArray(action.value)?action.value.slice(0,-1):[...action.value].reverse().join('');action.trial=true;}}
      else if(this.rng()<.8)action=this.exploratorySwipe(scan.missed);
    }
    const features=Array.isArray(action?.value)?spatialPathFeatures(action.value,this.session.initial.board,this.bottomUp):null;
    const seconds=this.mode==='rules'?0:p.thinkSeconds*this.speed*(.65+this.rng()*.7)+scanNodes/p.scanBudget+(action?.value?.length||0)*.22+(features?.turns||0)*.3;
    this.elapsed+=seconds;
    if(!action){this.stalls++;const event={step:this.steps,type:'observe',seconds,elapsed:this.elapsed,scanNodes};this.events.push(event);return event;}
    this.attempts++;if(action.trial){this.trialSwipes++;const focus=this.wordStats.get(action.focusWord);if(focus)focus.trialSwipes++;}
    const assisted=action.word?this.hintSupport(action.word)>0:false,result=this.session.submit(action.value),word=result.word||(Array.isArray(action.value)?action.value.map(i=>this.session.initial.board.letters[i]).join(''):String(action.value));
    if(this.mode==='ordinary')this.attempted.add(word+':'+JSON.stringify(action.value));
    if(result.accepted){this.stalls=0;const stat=this.wordStats.get(word);if(stat)stat.completedBy=action.trial?'trial':assisted?'hint-assisted':'recognized';}else{this.stalls++;this.failedSwipes++;}
    if(!result.accepted&&!['extra-word','already-completed'].includes(result.reason))this.mistakes++;
    const event={step:this.steps,type:'submit',value:action.value,word,trial:!!action.trial,focusWord:action.focusWord,hinted:assisted,seconds,elapsed:this.elapsed,scanNodes,result};this.events.push(event);
    if(this.session.status==='won')this.finish('won');else if(this.session.status==='anomaly')this.finish('anomaly');return event;
  }
  run(){while(!this.done)this.step();return this.summary();}
  summary(){const ordinary=this.mode==='ordinary',stats=[...this.wordStats.values()],knownCount=stats.filter(s=>s.known).length;
    return {seed:this.seed,runId:this.runId,mode:this.mode,modelVersion:this.profile.version,profile:{...this.profile},frequencyVersion:this.frequency?.version||null,
      spatialVersion:SPATIAL_CALIBRATION.version,calibrationStatus:SPATIAL_CALIBRATION.status,knowledgeAssumption:ordinary?.8:null,
      language:this.language,outcome:this.outcome||'running',elapsedSeconds:this.elapsed,attempts:this.attempts,mistakes:this.mistakes,hints:this.hints,
      trialSwipes:this.trialSwipes,failedSwipes:this.failedSwipes,scans:this.scans,knownCount:ordinary?knownCount:null,knownRate:ordinary?knownCount/stats.length:null,
      knownMissedTargets:ordinary?stats.filter(s=>s.known&&s.misses>0).length:null,missedRecognitions:ordinary?stats.reduce((s,w)=>s+w.misses,0):null,
      knownUnsolvedTargets:ordinary?stats.filter(s=>s.known&&!s.completedBy).length:null,wordStats:ordinary?stats:[],
      completed:completedCount(this.session),targetCount:targetCount(this.session),bonusWords:this.session.bonusCompleted.size,events:this.events};}
}
export function percentile(values,q){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y);return a[Math.round((a.length-1)*q)];}
export function summarizeRuns(runs){
  const valid=runs.filter(r=>!['error','anomaly','cancelled','unsupported','search-limit'].includes(r.outcome)),won=valid.filter(r=>r.outcome==='won'),n=valid.length;
  const rate=n?won.length/n:null,z=1.96,denom=1+z*z/(n||1),center=n?(rate+z*z/(2*n))/denom:null,margin=n?z*Math.sqrt(rate*(1-rate)/n+z*z/(4*n*n))/denom:null;
  const mean=key=>{const values=valid.map(r=>r[key]).filter(Number.isFinite);return values.length?values.reduce((s,v)=>s+v,0)/values.length:null;};
  return {attempted:runs.length,samples:n,wins:won.length,winRate:rate,ciLow:n?Math.max(0,center-margin):null,ciHigh:n?Math.min(1,center+margin):null,
    medianSeconds:percentile(valid.map(r=>r.elapsedSeconds),.5),p90Seconds:percentile(valid.map(r=>r.elapsedSeconds),.9),medianWinSeconds:percentile(won.map(r=>r.elapsedSeconds),.5),
    meanHints:mean('hints'),meanMistakes:mean('mistakes'),meanAttempts:mean('attempts'),meanTrialSwipes:mean('trialSwipes'),meanFailedSwipes:mean('failedSwipes'),
    meanKnownCount:mean('knownCount'),meanKnownRate:mean('knownRate'),meanKnownMissedTargets:mean('knownMissedTargets'),meanMissedRecognitions:mean('missedRecognitions'),meanKnownUnsolvedTargets:mean('knownUnsolvedTargets'),errors:runs.length-n};
}
