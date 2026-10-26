import {GameSession,clone,freeze,findWordPaths,inspectPath,signature} from './rules.js?v=21';

export const WT_RUNTIME='wt-1.4.0-union-usage-v2';
export const isWTLevel=level=>level?.schemaVersion===3&&level.algorithm===1&&level.source?.runtime===WT_RUNTIME;
const models=new Map();
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
function shuffled(items,rng){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

function inspectOriginal(raw){
  const key=JSON.stringify(raw);if(models.has(key))return models.get(key);
  if(!raw||!Number.isInteger(raw.id)||!Number.isInteger(raw.width)||!Number.isInteger(raw.height)||raw.width<2||raw.width>6||raw.height<2||raw.height>6||typeof raw.letters!=='string')throw Error('原包棋盘格式不正确');
  const rows=raw.letters.split(','),letters=rows.flatMap(s=>[...s]),shape={rows:raw.height,cols:raw.width};
  if(rows.length!==raw.height||rows.some(r=>r.length!==raw.width)||letters.some(c=>!/^[A-Z]$/.test(c)))throw Error('英文原包字母或尺寸不正确');
  if(!Array.isArray(raw.target_words)||!raw.target_words.length||raw.target_words.length>18||raw.target_words.some(t=>!/^[A-Z]{3,10}$/.test(t.word))||new Set(raw.target_words.map(t=>t.word)).size!==raw.target_words.length)throw Error('原包目标词不正确');
  if(!Array.isArray(raw.extra_words)||raw.extra_words.some(t=>typeof t.word!=='string'||!t.word.length))throw Error('原包额外词不正确');
  const gates=Array(letters.length).fill(0);
  if(!Array.isArray(raw.obstacles))throw Error('缺少原包障碍配置');
  for(const obstacle of raw.obstacles){
    if(!Number.isInteger(obstacle.required_words)||obstacle.required_words<0||!Array.isArray(obstacle.cells))throw Error('帘子门槛不正确');
    for(const {x,y} of obstacle.cells){if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=raw.width||y<0||y>=raw.height)throw Error('帘子格子坐标不正确');gates[y*raw.width+x]=Math.max(gates[y*raw.width+x],obstacle.required_words);}
  }
  const details=raw.target_words.map(t=>{
    const paths=findWordPaths(letters,t.word,null,null,shape);if(!paths.length)throw Error(t.word+'没有合法路线');
    const consumption=[...new Set(paths.flat())].sort((a,b)=>a-b);
    // Reference paths explain geometry; they do not restrict accepted gestures.
    const path=paths.reduce((best,p)=>Math.max(...p.map(i=>gates[i]))<Math.max(...best.map(i=>gates[i]))?p:best);
    return {word:t.word,sourceType:t.type,path,paths,consumption,pathCount:paths.length,setCount:new Set(paths.map(signature)).size};
  });
  const counts=letters.map((_,i)=>details.reduce((n,t)=>n+Number(t.consumption.includes(i)),0));
  if(counts.some(n=>n<1))throw Error('原包存在未覆盖的字母格');
  const model=freeze({board:{...shape,letters,counts},details,gates});
  if(models.size>=128)models.delete(models.keys().next().value);models.set(key,model);return model;
}
export function convertWTLevel(raw,metadata={}){
  const m=inspectOriginal(raw);
  return {schemaVersion:3,algorithm:1,algorithmVersion:WT_RUNTIME,id:`wt140-en-${raw.id}`,seed:`APK-english-${raw.id}`,
    config:{rows:raw.height,cols:raw.width,wordLengths:raw.target_words.map(t=>t.word.length)},
    board:clone(m.board),targets:m.details.map(({word,path,sourceType})=>({word,path:[...path],sourceType})),
    source:{...clone(metadata),packageName:'com.agavegames.wordtiles',version:'1.4.0',language:'english',runtime:WT_RUNTIME,
      consumptionPolicy:'all-path-union',original:clone(raw)}};
}
export function validateWTLevel(level){
  const report={valid:false,errors:[],checks:[],targets:[],demand:[],stateChecks:0,stateCount:0,enforceConsumption:false,validationMode:'wt-package-runtime'};
  try{
    if(!isWTLevel(level)||level.source.version!=='1.4.0'||level.source.packageName!=='com.agavegames.wordtiles'||level.source.consumptionPolicy!=='all-path-union')throw Error('请选择WT 1.4.0原包关卡格式');
    const m=inspectOriginal(level.source.original),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    if(!same(level.board?.letters,m.board.letters)||!same(level.board?.counts,m.board.counts)||level.board?.rows!==m.board.rows||level.board?.cols!==m.board.cols)throw Error('棋盘或次数与原包不一致');
    if(level.config?.rows!==m.board.rows||level.config?.cols!==m.board.cols||!same(level.config?.wordLengths,m.details.map(t=>t.word.length)))throw Error('关卡尺寸和目标词长与原包不一致');
    if(!Array.isArray(level.targets)||level.targets.length!==m.details.length)throw Error('目标词数与原包不一致');
    level.targets.forEach((t,i)=>{const d=m.details[i];if(t.word!==d.word||t.sourceType!==d.sourceType||!d.paths.some(p=>same(p,t.path)))throw Error('目标词或参考路径与原包不一致');});
    report.targets=m.details;report.demand=m.board.counts;report.config=level.config;
    report.checks=[{name:'原包配置',pass:true,detail:`${m.board.cols}×${m.board.rows}，${m.details.length}个目标；数据未改词`},
      {name:'次数与路径',pass:true,detail:'每词按全部候选路径的格子并集计数；接受所有当前可连的合法路径'},
      {name:'帘子与判胜',pass:true,detail:'按累计目标数开帘；收齐目标或有效棋盘次数耗尽判胜'}];
    report.valid=true;
  }catch(error){report.errors.push({code:'WT_SOURCE_DATA',message:error.message});}
  return report;
}

// Reconstructed from the audited 1.4.0 WordPathService / ObjectiveService.
// Source gestures identify a spelling; usage belongs to the union of its paths.
export class WTSourceSession extends GameSession{
  constructor(level,{rng=random}={}){
    super(level,null,{validator:validateWTLevel,bonusDictionary:null});this.model=inspectOriginal(this.initial.source.original);this.rng=rng;
    this.bonusWords=new Set(this.initial.source.original.extra_words.map(t=>t.word));this.exportInitial=this.initial;
    this.victoryReason=null;this.cleanup={removedAlternative:0,removedUnreachable:0};
  }
  get blockedCells(){return this.model.gates.map((threshold,i)=>threshold>this.completed.size?i:-1).filter(i=>i>=0);}
  get playableCounts(){return this.counts.map((n,i)=>this.model.gates[i]>this.completed.size?0:n);}
  get total(){return this.counts.reduce((sum,n)=>sum+Math.max(0,n),0);}
  get availableTargets(){const counts=this.playableCounts;return this.pending.filter(t=>this.pathsFor(t.word).some(p=>p.every(i=>counts[i]>0)));}
  pathsFor(word){return this.model.details.find(t=>t.word===word)?.paths||[];}
  audit(){
    if(this.counts.length!==this.initial.board.letters.length||this.counts.some(n=>!Number.isInteger(n)||n<0)){this.status='anomaly';this.debug={reason:'invalid-counts'};return false;}
    if(!this.pending.length){this.status='won';this.victoryReason='all-targets';return true;}
    if(this.counts.length&&this.counts.every(n=>n<=0)){this.status='won';this.victoryReason='empty-grid';return true;}
    const unavailable=this.pending.filter(t=>!this.pathsFor(t.word).some(p=>p.every(i=>this.counts[i]>0))).map(t=>t.word);
    if(unavailable.length){this.status='anomaly';this.debug={reason:'lost-pending-path',unavailable};return false;}
    this.status='playing';return true;
  }
  submit(path){
    if(this.status!=='playing')return {accepted:false,reason:this.status};
    if(!this.audit())return {accepted:false,reason:'anomaly'};
    if(this.status==='won')return {accepted:false,reason:'won'};
    const found=inspectPath(this.initial.board.letters,path,this.playableCounts,this.initial.board);
    if(!found.valid)return {accepted:false,reason:'invalid-path',message:'路线经过空位、未开帘子或不相邻的格子'};
    const word=found.word;
    if(this.completed.has(word))return {accepted:false,reason:'already-completed',word};
    if(!this.initial.targets.some(t=>t.word===word)){
      if(this.bonusWords.has(word)){const isNew=!this.bonusCompleted.has(word);this.bonusCompleted.add(word);return {accepted:false,reason:'extra-word',word,isNew};}
      return {accepted:false,reason:'not-target',word};
    }
    return this.collectTarget(word);
  }
  collectTarget(word){
    if(this.status!=='playing'||this.completed.has(word)||!this.initial.targets.some(t=>t.word===word))return {accepted:false,reason:'already-completed',word};
    const before=this.blockedCells;this.completed.add(word);
    for(const i of this.model.details.find(t=>t.word===word).consumption)this.counts[i]=Math.max(0,this.counts[i]-1);
    this.cleanupAlternatives();this.audit();
    return {accepted:true,word,status:this.status,counts:[...this.counts],openedCells:before.filter(i=>!this.blockedCells.includes(i)),victoryReason:this.victoryReason};
  }
  collectRevealedTarget(word){return this.collectTarget(word);}
  cleanupAlternatives(){
    const pending=this.pending;if(!pending.length)return;
    const blocked=new Set(this.blockedCells),removed=new Set(),positive=i=>this.counts[i]>0&&!removed.has(i);
    const playable=new Set(pending.filter(t=>this.pathsFor(t.word).some(p=>p.every(i=>positive(i)&&!blocked.has(i)))).map(t=>t.word));
    for(const target of pending){
      const paths=this.pathsFor(target.word);if(paths.length<2)continue;
      for(let k=0;k<target.word.length;k++){
        const candidates=[...new Set(paths.filter(p=>p.every(positive)).map(p=>p[k]))];if(candidates.length<2)continue;
        for(const cell of shuffled(candidates,this.rng)){
          if(removed.has(cell))continue;removed.add(cell);
          const safe=pending.every(t=>this.pathsFor(t.word).some(p=>p.every(i=>positive(i)&&(!playable.has(t.word)||!blocked.has(i)))));
          if(!safe)removed.delete(cell);
        }
      }
    }
    for(const i of removed)this.counts[i]=0;this.cleanup.removedAlternative+=removed.size;
    const reachable=new Set(pending.flatMap(t=>this.pathsFor(t.word).filter(p=>p.every(i=>this.counts[i]>0)).flat()));
    for(let i=0;i<this.counts.length;i++)if(this.counts[i]>0&&!reachable.has(i)){this.counts[i]=0;this.cleanup.removedUnreachable++;}
  }
  hint(){
    if(this.status!=='playing'||!this.audit()||this.status!=='playing')return null;
    const counts=this.playableCounts;
    for(const t of this.pending){const path=this.pathsFor(t.word).find(p=>p.every(i=>counts[i]>0));if(path)return {word:t.word,path:[...path]};}
    return null;
  }
  snapshot(){return {...super.snapshot(),blockedCells:this.blockedCells,victoryReason:this.victoryReason};}
}
