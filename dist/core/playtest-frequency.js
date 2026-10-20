import {WORD_ENTRIES,WORDLIST_VERSION} from './word-source.js?v=15';

// The separate frequency table is omitted from this release. Reuse the tier
// already bundled by the repository's reviewed wordlist as a coarse proxy.
const tierToZipf=Object.freeze({1:5.1,2:4.5,3:3.9,4:3.3,5:2.7});
const zipf=Object.create(null);
for(const entry of WORD_ENTRIES){
  const score=tierToZipf[entry.tier]??3.2;
  zipf[entry.word]=score;
}
export const ENGLISH_FREQUENCY=Object.freeze({
  version:`wordlist-tier-proxy-v1-${WORDLIST_VERSION}`,
  language:'english',
  approximation:'existing reviewed wordlist tiers; not an independent frequency dataset',
  zipf:Object.freeze(zipf)
});
