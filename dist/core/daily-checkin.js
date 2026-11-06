import {localCollectionDate} from './collection-calendar.js?v=16';

export const CHECKIN_KEY='wordtiles.daily-checkin.v1';
const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const GIFTS=new Set([2,4,6]);
function parseDay(key){
  if(typeof key!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(key))return null;
  const [year,month,day]=key.split('-').map(Number),date=new Date(0);
  date.setFullYear(year,month-1,day);date.setHours(12,0,0,0);
  return localCollectionDate(date)===key?date:null;
}
function shiftDay(key,amount){const date=parseDay(key);date.setDate(date.getDate()+amount);return localCollectionDate(date);}

// Local calendar days, rather than elapsed 24-hour periods, define a check-in.
export function createDailyCheckin(storage,{now=()=>new Date()}={}){
  let days=new Set();
  function reload(){
    if(!storage)return;
    try{const saved=JSON.parse(storage.getItem(CHECKIN_KEY)||'null');days=new Set(saved?.version===1&&Array.isArray(saved.days)?saved.days.filter(day=>parseDay(day)):[]);}catch{}
  }
  reload();
  function snapshot(){
    const date=now(),today=localCollectionDate(date),signed=days.has(today);
    let cursor=signed?today:shiftDay(today,-1),streak=0;
    while(days.has(cursor)){streak++;cursor=shiftDay(cursor,-1);}
    const totalDays=[...days].filter(day=>day<=today).length,weekMode=totalDays>=7?'calendar':'today-first';
    const first=weekMode==='calendar'?shiftDay(today,-((date.getDay()+6)%7)):today;
    return {today,signed,streak,totalDays,weekMode,week:DAYS.map((_,index)=>{
      const day=shiftDay(first,index),weekday=(parseDay(day).getDay()+6)%7;
      return {label:DAYS[weekday],date:day,today:day===today,signed:days.has(day),gift:GIFTS.has(weekday)};
    })};
  }
  function checkIn(){
    const before=snapshot();if(before.signed)return {...before,added:false,saved:true};
    days.add(before.today);let saved=false;
    try{if(storage){storage.setItem(CHECKIN_KEY,JSON.stringify({version:1,days:[...days].sort()}));saved=true;}}catch{}
    return {...snapshot(),added:true,saved};
  }
  return {snapshot,checkIn,reload};
}
