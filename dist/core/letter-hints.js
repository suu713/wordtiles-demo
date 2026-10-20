const sessionHintStates=new WeakMap();
export function letterHintsForSession(session){if(!sessionHintStates.has(session))sessionHintStates.set(session,createLetterHints(session.initial.targets));return sessionHintStates.get(session);}
export function createLetterHints(targets,{random=()=>{const value=new Uint32Array(1);globalThis.crypto.getRandomValues(value);return value[0]/4294967296;}}={}){
  const words=targets.map(target=>typeof target==='string'?target:target.word),revealed=new Map(words.map(word=>[word,new Set()]));
  function remaining(completed=new Set()){return words.reduce((sum,word)=>sum+(completed.has(word)?0:[...word].length-revealed.get(word).size),0);}
  function reveal(count=1,completed=new Set(),rng=random){
    if(!Number.isInteger(count)||count<1)return [];
    const result=[];
    for(let i=0;i<count;i++){
      const candidates=words.filter(word=>!completed.has(word)).map(word=>({word,index:[...word].findIndex((_,index)=>!revealed.get(word).has(index))})).filter(candidate=>candidate.index>=0);
      if(!candidates.length)break;const first=Math.min(...candidates.map(candidate=>candidate.index)),front=candidates.filter(candidate=>candidate.index===first);
      const choice=front[Math.floor(Math.min(.999999999,Math.max(0,rng()))*front.length)];revealed.get(choice.word).add(choice.index);result.push({...choice,letter:[...choice.word][choice.index]});
    }
    return result;
  }
  function revealShortestWord(completed=new Set()){
    let chosen=null;
    for(const word of words)if(!completed.has(word)&&revealed.get(word).size<[...word].length&&
      (chosen===null||[...word].length<[...chosen].length))chosen=word;
    if(chosen===null)return [];
    return [...chosen].flatMap((letter,index)=>{
      if(revealed.get(chosen).has(index))return [];
      revealed.get(chosen).add(index);return [{word:chosen,index,letter}];
    });
  }
  return {reveal,revealShortestWord,remaining,has:(word,index)=>revealed.get(word)?.has(index)===true};
}
