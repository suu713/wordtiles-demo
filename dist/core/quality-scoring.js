import {normalizeQualityConfig} from './quality-config.js?v=39';
const frequencyKeys=new Set(['avgZipf','minZipf','veryCommonCount']);
const groupKeys={frequency:['avgZipf','minZipf','veryCommonCount'],combination:['relatedPairCount','highSimilarityPairCount','containmentPairCount'],path:['totalTurnCount','straightRatio','avgPathSpan','avgBranching','sharedCellRate'],opener:['firstWordEase','easyStartCount'],distractors:['ignoredCommonCount','distractorScore']};
export function rangeFitness(value,[min,max]){
  const distance=min!==null&&value<min?min-value:max!==null&&value>max?value-max:0;
  const scale=min!==null&&max!==null&&max>min?max-min:Math.max(1,Math.abs(min??max??1));
  return Math.max(0,1-distance/scale);
}
export function scoreLevelQuality(report,input={}){
  const config=normalizeQualityConfig(input);
  if(!report.hardValid)return {config,totalScore:null,confidence:0,filterSatisfied:false,evaluations:[],modules:{},failures:['hard-validation']};
  const evaluations=Object.entries(config.ranges).map(([key,range])=>{
    const actual=report.values[key];let status;
    if(!report.templateMatched)status='not-applicable';
    else if(frequencyKeys.has(key)&&report.values.freqCoverage<.8)status='exempt';
    else if(!Number.isFinite(actual)||(['firstWordEase','easyStartCount'].includes(key)&&report.values.freqCoverage<1))status='unavailable';
    else status=(range[0]===null||actual>=range[0])&&(range[1]===null||actual<=range[1])?'pass':'fail';
    return {key,actual,range:[...range],enabled:config.enabled[key],status,fit:['pass','fail'].includes(status)?rangeFitness(actual,range):null};
  });
  const modules={};let weighted=0,weight=0;
  for(const [group,keys] of Object.entries(groupKeys)){
    const usable=evaluations.filter(item=>keys.includes(item.key)&&item.enabled&&item.fit!==null).map(item=>item.fit);
    if(group==='combination'){
      const diversity=evaluations.find(item=>item.key==='wordFormDiversity'&&item.enabled);
      if(diversity&&diversity.fit!==null)usable.push(diversity.fit);
      else if(!diversity&&Number.isFinite(report.values.wordFormDiversity))usable.push(report.values.wordFormDiversity);
    }
    const score=usable.length?usable.reduce((sum,value)=>sum+value,0)/usable.length:null;
    modules[group]={score,weight:config.weights[group],available:score!==null};
    if(score!==null){weighted+=score*config.weights[group];weight+=config.weights[group];}
  }
  const failures=evaluations.filter(item=>item.enabled&&['fail','unavailable'].includes(item.status)).map(item=>`${item.status}:${item.key}`);
  return {config,totalScore:weight?100*weighted/weight:null,confidence:weight,modules,evaluations,filterSatisfied:report.templateMatched&&failures.length===0,failures};
}
