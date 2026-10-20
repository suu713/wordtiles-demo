import {bankWordEntry} from './core/dictionary-banks.js?v=23';
import {COLLECTION_THEMES,collectedWords,collectionGroups} from './core/collection-themes.js?v=24';
import {summarizeWeek,weeklyHighlights,reviewDuration} from './core/weekly-review.js?v=25';
import {localCollectionDate} from './core/collection-calendar.js?v=16';

const paths={
  food:'M5 14h22c0 7-5 12-11 12S5 21 5 14Zm3-7v3m8-5v5m8-3v3M3 14h26',
  home:'m4 15 12-10 12 10M8 12v15h16V12M13 27v-9h6v9',
  leaf:'M26 5C12 3 5 10 7 19s15 10 19-14ZM7 26l12-13M11 22l-1-8m5 4 7-1',
  paw:'M10 19c-8 7-2 11 3 8 2-1 4-1 6 0 5 3 11-1 3-8-4-5-8-5-12 0ZM8 8c-4-2-5 6-1 7s5-5 1-7Zm7-3c-4-2-6 6-2 7s6-5 2-7Zm8 1c-4-1-7 6-3 7s7-6 3-7Zm5 7c-3-2-6 3-4 5s7-3 4-5Z',
  compass:'M16 29A13 13 0 1 0 16 3a13 13 0 0 0 0 26Zm5-18-3 8-7 3 3-8 7-3Z',
  heart:'M16 27 5 16C-3 7 9-1 16 8c7-9 19-1 11 8L16 27Z',
  spark:'m16 3 3.5 9.5L29 16l-9.5 3.5L16 29l-3.5-9.5L3 16l9.5-3.5L16 3Z',
  book:'M16 8C12 5 7 4 3 6v21c5-2 9-1 13 2 4-3 8-4 13-2V6c-4-2-9-1-13 2Zm0 0v21',
  mountain:'m2 27 10-19 7 11 4-7 7 15H2Zm6-12 4 2 3-3M20 17l3 2 3-2M23 3v4m-2-2h4',
  clock:'M16 29A13 13 0 1 0 16 3a13 13 0 0 0 0 26Zm0-19v7l5 3',
  hint:'M10 22c0-5-5-5-5-11a11 11 0 0 1 22 0c0 6-5 6-5 11H10Zm2 4h8m-6 4h4',
  check:'m6 16 7 7L27 9',
  arrow:'M5 16h22m-8-8 8 8-8 8'
};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.book);svg.append(path);return svg;}
function el(tag,className,text){const item=document.createElement(tag);if(className)item.className=className;if(text!==undefined)item.textContent=text;return item;}
const monthDay=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?`${date.getMonth()+1}.${date.getDate()}`:'';};

export function mountCollectionViews({getCollection,progress,openDialog,onContinue}){
  const $=id=>document.getElementById(id);let selected='all',limit=60,weekOffset=0;
  const words=()=>collectedWords(getCollection().entries(),bankWordEntry);
  function render(){
    const all=words(),groups=collectionGroups(all),collection=getCollection(),query=$('dictionary-search').value.trim().toLocaleUpperCase();
    if(selected!=='all'&&!groups.some(group=>group.id===selected))selected='all';
    $('dictionary-count').textContent=String(all.length);$('game-collection-count').textContent=String(all.length);
    $('dictionary-button').setAttribute('aria-label',`词汇收藏册，已收录 ${all.length} 个词`);
    $('dictionary-summary').textContent=`${all.length} 个单词 · ${groups.length} 个主题`;
    $('dictionary-storage-note').hidden=collection.persistent;
    $('collection-all').textContent=`全部收藏 ${all.length}`;$('collection-all').setAttribute('aria-pressed',String(selected==='all'));
    $('collection-themes').hidden=!!query;$('collection-themes').dataset.focused=String(selected!=='all');
    $('collection-themes').replaceChildren(...groups.filter(group=>selected==='all'||group.id===selected).map(group=>{
      const button=el('button','theme-card');button.type='button';button.dataset.theme=group.id;button.dataset.color=group.color;
      button.setAttribute('aria-pressed',String(selected===group.id));button.setAttribute('aria-label',`${group.name}，已收藏 ${group.words.length} 个词`);
      const mark=el('span','theme-mark');mark.append(icon(group.icon));
      const heading=el('span','theme-heading');heading.append(el('strong','',group.name),el('small','',`${group.words.length} 词`));
      button.append(mark,heading);return button;
    }));
    const matches=all.filter(entry=>(selected==='all'||entry.theme===selected)&&(!query||entry.word.toLocaleUpperCase().includes(query)||entry.definition.toLocaleUpperCase().includes(query)));
    $('collection-list-title').textContent=selected==='all'?'全部单词':COLLECTION_THEMES.find(t=>t.id===selected).name;
    $('collection-match-count').textContent=`${matches.length} 个词`;
    $('dictionary-empty').hidden=matches.length>0;
    $('dictionary-empty').textContent=!all.length?'暂无收藏':'无匹配单词';
    $('collection-reset').hidden=!all.length||matches.length>0;
    $('dictionary-list').replaceChildren(...matches.slice(0,limit).map(entry=>{
      const theme=COLLECTION_THEMES.find(t=>t.id===entry.theme),item=el('li','dictionary-entry collected-word');
      item.dataset.word=entry.word;item.dataset.language=entry.language;item.dataset.theme=entry.theme;
      const heading=el('div','dictionary-word-row');heading.append(el('strong','',entry.word));
      const definition=el('p','word-definition',entry.definition||'暂无释义');definition.title=entry.definition;
      const found=monthDay(entry.firstFoundAt),footer=el('div','word-card-footer');footer.append(el('span','',theme.name),el('time','',found?`${found} 收录`:'已收藏'));
      item.append(heading,definition,footer);return item;
    }));
    $('dictionary-more').hidden=matches.length<=limit;
    if($('weekly-dialog').open)renderWeek();
  }
  function reset(){selected='all';limit=60;$('dictionary-search').value='';render();}
  $('dictionary-button').addEventListener('click',()=>{reset();openDialog('#dictionary-dialog');$('collection-scroll').scrollTop=0;});
  $('dictionary-close').addEventListener('click',()=>$('dictionary-dialog').close());
  $('dictionary-search').addEventListener('input',()=>{limit=60;render();});
  $('dictionary-more').addEventListener('click',()=>{limit+=60;render();});
  $('collection-all').addEventListener('click',()=>{selected='all';limit=60;render();});
  $('collection-reset').addEventListener('click',reset);
  $('collection-themes').addEventListener('click',event=>{const button=event.target.closest('[data-theme]');if(!button)return;selected=selected===button.dataset.theme?'all':button.dataset.theme;limit=60;render();$('collection-scroll').scrollTop=0;});

  function renderWeek(){
    const all=words(),now=new Date(),sessions=progress.entries(),summary=summarizeWeek(all,sessions,now,weekOffset),previous=summarizeWeek(all,sessions,now,weekOffset-1);
    $('weekly-title').textContent=weekOffset===0?'本周回顾':'周回顾';$('weekly-range').textContent=summary.label;
    $('weekly-next').disabled=weekOffset>=0;
    const earliest=[...all.map(w=>localCollectionDate(w.firstFoundAt)),...sessions.flatMap(s=>Object.keys(s.days))].filter(Boolean).sort()[0];
    $('weekly-prev').disabled=summary.start<=new Date((earliest||localCollectionDate(now))+'T00:00:00');
    const cards=[['words','新增收藏',summary.words,previous.words,'book'],['levels','通关',summary.levels,previous.levels,'mountain'],['seconds','专注时长',summary.seconds,previous.seconds,'clock'],['hints','提示',summary.hints,previous.hints,'hint']];
    $('weekly-metrics').replaceChildren(...cards.map(([key,label,value,before,mark])=>{
      const card=el('div','weekly-metric');card.dataset.metric=key;const hasData=key==='words'||summary.hasPlayData;
      const head=el('div','weekly-metric-label');head.append(icon(mark),el('span','',label));
      const number=el('strong','weekly-metric-value',hasData?(key==='seconds'?reviewDuration(value):String(value)):'—');
      let comparison='暂无记录';
      if(hasData){
        if(key!=='words'&&!previous.hasPlayData)comparison='上周无记录';
        else{const delta=key==='seconds'?Math.floor(value)-Math.floor(before):value-before;comparison=delta===0?'与上周持平':`较上周 ${delta>0?'+':'−'}${key==='seconds'?reviewDuration(Math.abs(delta)):Math.abs(delta)}`;}
      }
      card.append(head,number,el('small','weekly-comparison',comparison));return card;
    }));
    $('weekly-day-summary').textContent=`活跃 ${summary.activeDays} 天`;
    const max=Math.max(1,...summary.days.map(day=>day.words));
    $('weekly-days').replaceChildren(...summary.days.map((day,index)=>{
      const row=el('div','weekly-day');row.dataset.today=String(day.key===localCollectionDate(now));row.dataset.active=String(!!(day.words||day.starts||day.seconds||day.targets));row.dataset.future=String(day.date>now);
      row.setAttribute('aria-label',`${monthDay(day.date)}，${day.words} 个新词，手动完成 ${day.levels} 关`);
      row.append(el('span','weekly-day-count',day.words?String(day.words):'·'));
      const track=el('div','weekly-bar-track'),bar=el('span','weekly-bar');bar.style.setProperty('--bar-height',`${day.words?Math.max(12,day.words/max*100):4}%`);track.append(bar);row.append(track,el('span','weekly-day-label',['一','二','三','四','五','六','日'][index]));return row;
    }));
    const highlights=weeklyHighlights(summary);
    $('weekly-highlights').replaceChildren(...highlights.map(highlight=>{const row=el('li','weekly-highlight'),mark=el('span','highlight-mark');mark.append(icon(highlight.icon));row.append(mark,el('p','',highlight.text));return row;}));
    $('weekly-empty').hidden=highlights.length>0;
    $('weekly-storage-note').hidden=progress.persistent;
    $('weekly-record-note').textContent='试玩仅计手动';
  }
  function showWeek(){weekOffset=0;progress.flush();renderWeek();openDialog('#weekly-dialog');$('weekly-scroll').scrollTop=0;}
  $('weekly-button').addEventListener('click',showWeek);
  $('activity-weekly').addEventListener('click',()=>{$('activity-dialog').close();showWeek();});
  $('weekly-close').addEventListener('click',()=>$('weekly-dialog').close());
  $('weekly-prev').addEventListener('click',()=>{weekOffset--;renderWeek();});
  $('weekly-next').addEventListener('click',()=>{if(weekOffset<0)weekOffset++;renderWeek();});
  $('weekly-continue').addEventListener('click',()=>{$('weekly-dialog').close();onContinue();});
  return {render,renderWeek};
}
