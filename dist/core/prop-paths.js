import {findWordPaths,inspectPath,signature} from './rules.js?v=21';

export function shortestTargetPath(session){
  if(!session||session.status!=='playing'||!session.initial?.board)return null;
  const {board,targets}=session.initial;
  if(session.availableTargets){
    const target=session.availableTargets.slice().sort((a,b)=>a.word.length-b.word.length)[0];
    if(!target)return null;
    const counts=session.playableCounts,path=session.pathsFor(target.word).find(p=>p.every(i=>counts[i]>0));
    return path?{word:target.word,path:[...path]}:null;
  }
  const target=targets.filter(target=>!session.completed.has(target.word))
    .sort((a,b)=>[...a.word].length-[...b.word].length)[0];
  if(!target)return null;
  const consumption=session.report?.enforceConsumption?session.report.targets.find(item=>item.word===target.word)?.consumption:null;
  if(session.report?.enforceConsumption&&!consumption)return null;
  const valid=path=>{
    const result=inspectPath(board.letters,path,session.counts,board);
    return result.valid&&result.word===target.word&&(!consumption||signature(path)===signature(consumption));
  };
  const reference=target.path||target.canonicalPath;
  const path=valid(reference)?reference:findWordPaths(board.letters,target.word,session.counts,null,board).find(valid);
  return path?{word:target.word,path:[...path]}:null;
}
