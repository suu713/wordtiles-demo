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

// Prefer a readable layout that fits: single words, packed rows, or two columns.
export function planTargetLayout(lengths,{width,height,minSlot,maxSlot,letterGap,wordGap,rowGap,maxRows=6}){
  if(!lengths.length)return {rows:[],slot:maxSlot,columns:null,scroll:false};
  const candidates=[];
  function add(rows,columns=null){
    const footprint=indices=>({letters:indices.reduce((sum,i)=>sum+lengths[i],0),gaps:indices.reduce((sum,i)=>sum+lengths[i]-1,0)*letterGap+(indices.length-1)*wordGap});
    const widthLimit=columns?(width-(columns[0]+columns[1]-2)*letterGap-wordGap)/(columns[0]+columns[1]):Math.min(...rows.map(indices=>{const size=footprint(indices);return (width-size.gaps)/size.letters;}));
    const visibleRows=Math.min(rows.length,maxRows),heightLimit=(height-(visibleRows-1)*rowGap)/visibleRows;
    candidates.push({rows,slot:Math.max(1,Math.min(maxSlot,widthLimit,heightLimit)),columns,scroll:rows.length>maxRows});
  }
  add(lengths.map((_,index)=>[index]));
  if(lengths.length>5)for(let limit=3;limit<=maxRows;limit++)add(planTargetRows(lengths,{width,minSlot,letterGap,wordGap,maxRows:limit}));
  if(lengths.length>=6){
    const split=Math.ceil(lengths.length/2);
    add(Array.from({length:split},(_,index)=>index+split<lengths.length?[index,index+split]:[index]),[Math.max(...lengths.slice(0,split)),Math.max(...lengths.slice(split))]);
  }
  const fitted=candidates.filter(choice=>!choice.scroll&&choice.slot>=minSlot),pool=fitted.length?fitted:candidates;
  return pool.sort((a,b)=>Math.abs(a.slot-b.slot)>.2?b.slot-a.slot:a.rows.length-b.rows.length||Number(!!b.columns)-Number(!!a.columns))[0];
}
