/** Exact content gate, independent of frequency and board geometry. No dependency. */
export function createWordGate(dictionary) {
  if (!dictionary || typeof dictionary.version !== 'string' || !Array.isArray(dictionary.words)) {
    throw new TypeError('Expected a versioned {version, words} dictionary.');
  }
  if (!dictionary.words.length || dictionary.words.some(w => typeof w !== 'string' || !/^[A-Z]+$/.test(w))) {
    throw new TypeError('Whitelist must contain nonempty uppercase ASCII headwords only.');
  }
  if (new Set(dictionary.words).size !== dictionary.words.length) throw new TypeError('Duplicate whitelist entries.');
  const words = [...dictionary.words];
  const version = dictionary.version;
  const allowed = new Set(words);
  const canonical = value => typeof value === 'string' && /^[A-Za-z]+$/.test(value) ? value.toUpperCase() : null;
  const isAllowed = value => { const w = canonical(value); return w !== null && allowed.has(w); };
  return {
    version,
    isAllowed,
    /** No default maximum length; caller chooses lengths for its actual board. */
    forLengths(lengths) {
      if (!Array.isArray(lengths) || !lengths.length || lengths.some(n => !Number.isInteger(n) || n < 1)) {
        throw new TypeError('Pass nonempty positive integer word lengths.');
      }
      const lens = [...new Set(lengths)].sort((a,b)=>a-b), set = new Set(lens);
      const key = lens.length > 1 && lens.every((n,i)=>n===lens[0]+i) ? `${lens[0]}to${lens.at(-1)}` : lens.join('-');
      return { version: `${version}-len${key}`, words: words.filter(w=>set.has(w.length)) };
    },
    /** This gate supplements, not replaces, the existing path/count validator. */
    checkLevelTargets(level) {
      if (!level || !Array.isArray(level.targets) || !level.targets.length) {
        return {ok:false, code:'INVALID_LEVEL', rejectedWords:[]};
      }
      const rejectedWords = level.targets.filter(t=>!t || !isAllowed(t.word)).map(t=>t?.word??null);
      return {ok:rejectedWords.length===0, code:rejectedWords.length?'WORD_NOT_APPROVED':'OK', rejectedWords};
    },
    /** Preserve measured Zipf/tier fields, but do not allow unseen words through. */
    filterEntries(entries) {
      if (!Array.isArray(entries)) throw new TypeError('Expected an entries array.');
      return entries.filter(e=>e && isAllowed(e.word) && e.reviewStatus!=='blocked')
        .map(e=>({...e,word:canonical(e.word),reviewStatus:'approved',targetEnabled:true,contentPolicyVersion:version}));
    }
  };
}
