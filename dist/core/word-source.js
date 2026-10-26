import bank from '../wt-word-bank.json?v=a0565e5f4482' with {type:'json'};

export const WORDLIST_VERSION=bank.version;
export const WORDLIST_HASH=bank.source.sha256;
export const GAME_POLICY_VERSION=bank.version;
export const WORDLIST_REVIEW_HASH=bank.source.sha256;
const normalizeEntry=entry=>Object.freeze({...entry,tier:entry.rangeTier,definition:entry.definitionZh,englishDefinition:entry.definitionEn});
const requiredEntries=bank.required.map(normalizeEntry),extraEntries=bank.extra.map(normalizeEntry);
export const WORD_ENTRIES=Object.freeze([...requiredEntries,...extraEntries]);
const entries=new Map(WORD_ENTRIES.map(entry=>[entry.word,entry]));
export const ORIGINAL_ENGLISH_WORDS=Object.freeze(WORD_ENTRIES.map(entry=>entry.word));
export const ORIGINAL_ENGLISH_TARGETS=Object.freeze(requiredEntries.map(entry=>entry.word));
const wordSet=new Set(ORIGINAL_ENGLISH_WORDS);
export const packageHasWord=(word,language='english')=>language==='english'&&typeof word==='string'&&wordSet.has(word.toUpperCase());
export const sourceHasWord=packageHasWord;
export const wordEntryFor=word=>typeof word==='string'?entries.get(word.toUpperCase())||null:null;
// A required word not selected for this level is still collectable. Sessions
// check final targets first, so this union never rewards a target as a bonus.
export const BONUS_DICTIONARY=Object.freeze({version:WORDLIST_VERSION+'-bonus-union-v1',metadata:Object.freeze({source:'必答词＋额外词'}),words:ORIGINAL_ENGLISH_WORDS});
