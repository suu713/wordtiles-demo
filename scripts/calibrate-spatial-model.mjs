import {writeFile,mkdir} from 'node:fs/promises';
import {spatialPathFeatures,recognitionProbability} from '../dist/core/spatial-perception.js';

// These are product/engineering targets derived from the requested ordering, not observations of people.
const word='LIGHT',size=9,coordinates=(row,start)=>Array.from({length:5},(_,i)=>[row,start+i]);
const definitions=[
  ['顺向外圈直线',coordinates(0,0),.94],
  ['顺向内圈直线',coordinates(2,2),.88],
  ['倒向外圈直线',coordinates(0,0).reverse(),.66],
  ['倒向内圈直线',coordinates(2,2).reverse(),.48],
  ['顺向内圈一拐',[[2,2],[2,3],[2,4],[3,4],[4,4]],.78],
  ['顺向内圈两拐',[[2,2],[2,3],[3,3],[3,4],[3,5]],.64],
  ['顺向部分外圈两拐',[[0,0],[0,1],[1,1],[1,2],[1,3]],.71],
  ['倒向内圈三拐',[[5,5],[5,4],[4,4],[4,3],[3,3]],.10],
  ['顺向外圈长词',Array.from({length:8},(_,i)=>[0,i]),.92,'HOSPITAL'],
  ['顺向外圈有相同邻字',coordinates(0,0),.935,word,[[1,0,'I']]]
];
const anchors=definitions.map(([label,coords,expectedProbability,text=word,extras=[]])=>{
  const path=coords.map(([r,c])=>r*size+c),board={rows:size,cols:size,letters:Array(size*size).fill('X')};
  path.forEach((cell,i)=>board.letters[cell]=text[i]);extras.forEach(([r,c,letter])=>board.letters[r*size+c]=letter);
  return {label,word:text,path,expectedProbability,features:spatialPathFeatures(path,board)};
});
const names=['intercept','backwardShare','turns','edgeShare','extraLength','ambiguity'],prior=[2.1,-2,-.7,.55,-.08,-.25],ridge=.025;
const matrix=names.map((_,i)=>names.map((_,j)=>i===j?ridge:0)),rhs=prior.map(value=>value*ridge);
for(const anchor of anchors){const x=names.map(name=>name==='intercept'?1:anchor.features[name]),y=Math.log(anchor.expectedProbability/(1-anchor.expectedProbability));
  x.forEach((value,i)=>{rhs[i]+=value*y;x.forEach((other,j)=>matrix[i][j]+=value*other);});}
// Solve the regularized least-squares fit in log-odds space.
for(let i=0;i<names.length;i++){
  const pivot=matrix[i][i];for(let j=i;j<names.length;j++)matrix[i][j]/=pivot;rhs[i]/=pivot;
  for(let k=0;k<names.length;k++)if(k!==i){const factor=matrix[k][i];for(let j=i;j<names.length;j++)matrix[k][j]-=factor*matrix[i][j];rhs[k]-=factor*rhs[i];}
}
const coefficients=Object.fromEntries(names.map((name,i)=>[name,Number(rhs[i].toFixed(8))]));
if(coefficients.backwardShare>=0||coefficients.turns>=0||coefficients.edgeShare<=0||coefficients.extraLength>=0||coefficients.ambiguity>=0)throw new Error('拟合违反排布方向约束');
const fitted=anchors.map(anchor=>({...anchor,fittedProbability:recognitionProbability(anchor.features,{coefficients})}));
const rmse=Math.sqrt(fitted.reduce((sum,a)=>sum+(a.fittedProbability-a.expectedProbability)**2,0)/fitted.length);
const calibration={version:'spatial-perception-v2',status:'engineering-anchors',knowledgeRate:.8,
  basis:'User-specified 80% target vocabulary. Matched-layout engineering anchors encode ordering assumptions, not measured player probabilities.',
  humanValidated:false,method:'Ridge least squares on engineering anchor log-odds; lambda 0.025; coefficients preserve monotonic direction/turn/edge constraints.',
  coefficients,rmse,anchors:fitted};
await writeFile(new URL('../dist/playtest/spatial-calibration.json',import.meta.url),JSON.stringify(calibration,null,2)+'\n');
await mkdir(new URL('../.openai/tmp/editor-v29/',import.meta.url),{recursive:true});
await writeFile(new URL('../.openai/tmp/editor-v29/spatial-calibration-report.json',import.meta.url),JSON.stringify(calibration,null,2)+'\n');
console.log(JSON.stringify({status:calibration.status,humanValidated:false,anchorCount:fitted.length,rmse,comparisons:fitted.map(a=>({layout:a.label,recognition:a.fittedProbability}))},null,2));
