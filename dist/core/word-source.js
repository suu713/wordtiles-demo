import input from '../wordlist.json?v=15' with {type:'json'};
import original from '../original-word-policy.json?v=15' with {type:'json'};

export const WORDLIST_VERSION=input.version;
export const WORDLIST_HASH=input.source.sha256;
export const GAME_POLICY_VERSION=input.review.version;
export const WORDLIST_REVIEW_HASH=input.review.sha256;
export const WORD_ENTRIES=Object.freeze(input.entries.map(entry=>Object.freeze({...entry})));
const entries=new Map(WORD_ENTRIES.map(entry=>[entry.word,entry]));
const originalWords=new Map(Object.entries(original.languages).map(([language,words])=>[language,new Set(words)]));
export const ORIGINAL_ENGLISH_WORDS=Object.freeze([...original.languages.english]);
export const ORIGINAL_ENGLISH_TARGETS=Object.freeze([...original.targetWordsByLanguage.english]);
export const packageHasWord=(word,language='english')=>typeof word==='string'&&originalWords.get(language)?.has(word.toUpperCase())===true;
export const sourceHasWord=word=>typeof word==='string'&&entries.has(word.toUpperCase());
export const wordEntryFor=word=>typeof word==='string'?entries.get(word.toUpperCase())||null:null;
export const BONUS_DICTIONARY=Object.freeze({version:WORDLIST_VERSION,metadata:Object.freeze({gameReviewVersion:GAME_POLICY_VERSION,gameReviewSha256:WORDLIST_REVIEW_HASH}),words:Object.freeze(WORD_ENTRIES.map(entry=>entry.word))});
