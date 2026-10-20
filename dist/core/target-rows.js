// Layout only: preserve the displayed word order and never change level data.
export function planTargetRows(lengths,{width,minSlot,letterGap,wordGap,maxRows=7}){
  const count=lengths.length;if(!count)return [];
  if(count<=maxRows)return lengths.map((_,i)=>[i]);
  const cost=Array.from({length:count+1},()=>Array(count+1).fill(Infinity));
  const previous=Array.from({length:count+1},()=>Array(count+1).fill(-1));cost[0][0]=0;
  for(let rows=1;rows<=count;rows++)for(let end=1;end<=count;end++){
    let letters=0,squares=0;
    for(let start=end-1;start>=0;start--){
      const length=lengths[start],words=end-start;letters+=length;squares+=length*length;
      const needed=letters*minSlot+(letters-words)*letterGap+(words-1)*wordGap;
      if(words>1&&needed>width)break;
      // Pairing short words has less visual cost; ties favor earlier short-word rows.
      const candidate=cost[rows-1][start]+letters*letters-squares+start*.001*(words-1);
      if(candidate<cost[rows][end]){cost[rows][end]=candidate;previous[rows][end]=start;}
    }
  }
  let rows=maxRows;while(rows<count&&!Number.isFinite(cost[rows][count]))rows++;
  const result=[];let end=count;
  while(rows>0){const start=previous[rows][end];result.unshift(Array.from({length:end-start},(_,i)=>start+i));end=start;rows--;}
  return result;
}
