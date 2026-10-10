import input from '../wordlist.json?v=12' with {type:'json'};

export const WORDLIST_VERSION=input.version;
export const WORDLIST_HASH=input.source.sha256;
export const WORD_ENTRIES=Object.freeze(input.entries.map(entry=>Object.freeze({...entry})));
const entries=new Map(WORD_ENTRIES.map(entry=>[entry.word,entry]));
export const sourceHasWord=word=>typeof word==='string'&&entries.has(word.toUpperCase());
export const wordEntryFor=word=>typeof word==='string'?entries.get(word.toUpperCase())||null:null;
export const BONUS_DICTIONARY=Object.freeze({version:WORDLIST_VERSION,words:Object.freeze(WORD_ENTRIES.map(entry=>entry.word))});
