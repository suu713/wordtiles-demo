import {localCollectionDate} from './collection-calendar.js?v=16';
import {COLLECTION_THEMES} from './collection-themes.js?v=24';

export function reviewWeek(now=new Date(),offset=0){
  const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-(start.getDay()+6)%7+7*offset);
  const end=new Date(start);end.setDate(end.getDate()+7);
  const days=Array.from({length:7},(_,index)=>{const date=new Date(start);date.setDate(date.getDate()+index);return {key:localCollectionDate(date),date,words:0,seconds:0,levels:0,hints:0,targets:0,starts:0};});
  return {start,end,days,offset,label:`${start.getMonth()+1}.${start.getDate()} — ${days[6].date.getMonth()+1}.${days[6].date.getDate()}`};
}
export function summarizeWeek(words,sessions,now=new Date(),offset=0){
  const week=reviewWeek(now,offset),map=new Map(week.days.map(day=>[day.key,day]));
  const newWords=words.filter(entry=>{const stamp=new Date(entry.firstFoundAt);return stamp>=week.start&&stamp<week.end&&stamp<=now;});
  for(const entry of newWords)map.get(localCollectionDate(entry.firstFoundAt)).words++;
  for(const session of sessions)if(session.mode==='manual')for(const [key,values] of Object.entries(session.days||{})){
    const day=map.get(key);if(!day||day.date>now)continue;
    for(const [target,source] of [['seconds','seconds'],['levels','completedLevels'],['hints','hints'],['targets','targets'],['starts','starts']])day[target]+=Math.max(0,Number(values[source])||0);
  }
  const totals=week.days.reduce((sum,day)=>{for(const key of ['words','seconds','levels','hints','targets','starts'])sum[key]+=day[key];return sum;},{words:0,seconds:0,levels:0,hints:0,targets:0,starts:0});
  const active=week.days.filter(day=>day.words||day.starts||day.seconds||day.targets||day.hints||day.levels),topDay=[...week.days].filter(day=>day.words).sort((a,b)=>b.words-a.words||a.key.localeCompare(b.key))[0];
  const longest=[...newWords].sort((a,b)=>[...b.word].length-[...a.word].length||a.word.localeCompare(b.word))[0];
  const themes=COLLECTION_THEMES.map(theme=>({...theme,count:newWords.filter(w=>w.theme===theme.id).length})).filter(theme=>theme.count).sort((a,b)=>b.count-a.count);
  return {...week,...totals,newWords,activeDays:active.length,hasPlayData:totals.starts>0||totals.seconds>0||totals.targets>0||totals.levels>0||totals.hints>0,topDay,longest,themes};
}
export function weeklyHighlights(summary){
  const highlights=[];
  if(summary.topDay)highlights.push({icon:'spark',text:`${summary.topDay.date.getMonth()+1}.${summary.topDay.date.getDate()} 新增 ${summary.topDay.words} 词`});
  if(summary.longest)highlights.push({icon:'book',text:`最长词：${summary.longest.word}（${[...summary.longest.word].length} 字母）`});
  if(summary.themes[0])highlights.push({icon:summary.themes[0].icon,text:`${summary.themes[0].name} +${summary.themes[0].count} 词`});
  if(!highlights.length&&summary.levels)highlights.push({icon:'mountain',text:`完成 ${summary.levels} 关`});
  if(!highlights.length&&summary.hasPlayData)highlights.push({icon:'clock',text:`专注 ${reviewDuration(summary.seconds)}`});
  return highlights.slice(0,3);
}
export function reviewDuration(seconds){
  const total=Math.floor(Math.max(0,seconds));
  if(total>=3600)return `${Math.floor(total/3600)}时${Math.floor(total%3600/60)}分`;
  return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
}
