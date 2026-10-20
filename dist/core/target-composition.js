export function normalizeComposition(input){
  const three=Number(input?.three),four=Number(input?.four);
  if(input?.three===''||input?.four===''||![three,four].every(value=>Number.isFinite(value)&&value>=0&&value<=100))throw new Error('三字词、四字词比例须为 0～100%');
  if(three+four>100+1e-8)throw new Error('三字词与四字词比例之和不能超过 100%');
  return {three,four};
}
export function compositionCounts(count,input){
  if(!Number.isInteger(count)||count<1||count>16)throw new Error('目标词数量须为 1～16 的整数');
  const {three,four}=normalizeComposition(input),shares=[three,four,Math.max(0,100-three-four)],raw=shares.map(value=>value*count/100),values=raw.map(Math.floor);
  const order=raw.map((value,index)=>({index,fraction:value-values[index]})).sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
  for(let left=count-values.reduce((sum,n)=>sum+n,0),i=0;left>0;left--,i++)values[order[i%order.length].index]++;
  return {three:values[0],four:values[1],other:values[2]};
}
const randomUnit=()=>{const value=new Uint32Array(1);globalThis.crypto.getRandomValues(value);return value[0]/4294967296;};
function pickWeighted(items,weight,random){const weights=items.map(weight),total=weights.reduce((sum,n)=>sum+n,0);let value=Math.min(.999999999,Math.max(0,random()))*total;for(let i=0;i<items.length;i++){value-=weights[i];if(value<0)return items[i];}return items.at(-1);}
export function planTargetLengths({rows,cols,targetCount,composition,maxUses=3},available=[2,3,4,5,6,7,8,9,10],random=randomUnit){
  if(![rows,cols].every(value=>Number.isInteger(value)&&value>=2&&value<=6))throw new Error('棋盘宽高须为 2～6 的整数');
  if(!Number.isInteger(maxUses)||maxUses<1||maxUses>9)throw new Error('每格使用上限须为 1～9');
  const counts=compositionCounts(targetCount,composition),cells=rows*cols,capacity=cells*Math.min(maxUses,targetCount);
  const choices=[...new Set(available)].filter(n=>Number.isInteger(n)&&n>=2&&n<=10&&n<=cells).sort((a,b)=>a-b);
  if((counts.three&&!choices.includes(3))||(counts.four&&!choices.includes(4)))throw new Error('所选词库或词长范围不包含比例要求的三字词／四字词');
  const fixed=[...Array(counts.three).fill(3),...Array(counts.four).fill(4)],base=fixed.reduce((sum,n)=>sum+n,0),others=choices.filter(n=>n!==3&&n!==4);
  const sums=[new Set([0])];for(let i=0;i<counts.other;i++){const next=new Set();for(const sum of sums.at(-1))for(const length of others)if(base+sum+length<=capacity)next.add(sum+length);sums.push(next);}
  const feasible=[...sums[counts.other]].filter(sum=>base+sum>=cells&&base+sum<=capacity);
  if(!feasible.length)throw new Error('当前词数和比例无法覆盖棋盘或超出格子使用上限，请调整词数、比例或宽高');
  const desired=Math.min(capacity,Math.max(cells,Math.round(cells*1.6)));
  let remaining=pickWeighted(feasible,sum=>1/(1+Math.abs(base+sum-desired))**2,random);const result=[...fixed];
  for(let slots=counts.other;slots>0;slots--){const valid=others.filter(length=>sums[slots-1].has(remaining-length));const length=pickWeighted(valid,()=>1,random);result.push(length);remaining-=length;}
  for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.min(.999999999,Math.max(0,random()))*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
