import {dataEpoch,sameDataEpoch} from './app-data.js?v=25';

export const ACORN_KEY='wordtiles.acorn-activity.v1';
export const ACORN_MODES=Object.freeze([
  {id:'all',name:'全木棋盘',number:'01',detail:'棋盘和目标都是木纹块，橡果藏在棋盘里。'},
  {id:'sparse',name:'木块寻果',number:'02',detail:'棋盘中只有少量木纹块，每个木块下都有橡果。'},
  {id:'targets',name:'词框寻果',number:'03',detail:'橡果直接放在目标格中，单词完成后变木纹并收集。'},
]);
function randomFor(text){let seed=2166136261;for(const char of text)seed=Math.imul(seed^char.charCodeAt(0),16777619);return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function pick(items,count,random){const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy.slice(0,count);}

// Event placement observes the real session. It never changes letters, counts or target rewards.
export class AcornRound{
  constructor(session,mode='all',number=1){
    if(!ACORN_MODES.some(item=>item.id===mode))throw Error('未知的橡果活动形式');
    this.session=session;this.mode=mode;this.number=number;this.collected=new Set();this.completed=new Set(session.completed);this.counts=[...session.counts];
    const random=randomFor(String(session.initial.id||session.initial.seed)+':'+number),amount=number%2?2:3;
    const cells=session.counts.flatMap((count,index)=>count>0?[index]:[]);
    this.boardAcorns=new Set(mode==='targets'?[]:pick(cells,amount,random));
    this.boardWood=new Set(mode==='all'?cells:mode==='sparse'?this.boardAcorns:[]);
    const words=pick(session.initial.targets,Math.min(amount,session.initial.targets.length),random);
    this.targetAcorns=new Map(mode==='targets'?words.map(({word})=>[word,Math.floor(random()*word.length)]):[]);
    this.goal=mode==='targets'?this.targetAcorns.size:this.boardAcorns.size;
  }
  observe(){
    const session=this.session;if(session.status==='anomaly')return {board:[],targets:[],keys:[]};
    const board=[],targets=[],keys=[];
    for(const cell of this.boardAcorns){const key='board:'+cell;if(this.counts[cell]>0&&session.counts[cell]===0&&!this.collected.has(key)){this.collected.add(key);keys.push(key);board.push({cell,key});}}
    if(this.mode==='targets')for(const {word}of session.initial.targets){
      if(!session.completed.has(word)||this.completed.has(word))continue;
      const position=this.targetAcorns.get(word),key='target:'+word;
      if(position!==undefined&&!this.collected.has(key)){this.collected.add(key);keys.push(key);}
      targets.push({word,position,key:position===undefined?null:key});
    }
    this.counts=[...session.counts];this.completed=new Set(session.completed);return {board,targets,keys};
  }
}

export function createAcornCollection(storage){
  const epoch=dataEpoch(storage);let state={version:1,total:0,recent:[]},dirty=false;
  function read(){if(!dirty)try{const value=JSON.parse(storage?.getItem(ACORN_KEY)||'null');if(value?.version===1&&Number.isSafeInteger(value.total)&&value.total>=0&&value.total<=1e9&&Array.isArray(value.recent)&&value.recent.length<=500&&value.recent.every(id=>typeof id==='string'&&id.length<=160))state=value;}catch{}return state.total;}
  function collect(round,keys){
    if(!sameDataEpoch(storage,epoch))return read();read();
    for(const key of keys){const id=round+':'+key;if(state.recent.includes(id))continue;state.total++;state.recent.push(id);}
    state.recent=state.recent.slice(-500);
    try{if(storage){storage.setItem(ACORN_KEY,JSON.stringify(state));dirty=false;}else dirty=true;}catch{dirty=true;}
    return state.total;
  }
  return {read,collect};
}
