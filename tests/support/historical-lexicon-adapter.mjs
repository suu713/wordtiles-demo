export const FREQUENCY_LABELS = Object.freeze({ 1: '非常常用', 2: '常用', 3: '一般', 4: '罕见', 5: '非常罕见', unrated: '未评级' });
const tierKey = tier => tier === null ? 'unrated' : String(tier);

async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// The packaged index covers every length in the mother lexicon. It is built
// once, outside search; frequency never implies human content approval.
export async function createLexiconAdapter(index, overlay) {
  if (index?.schemaVersion !== 1 || !index.metadata?.version || !/^[a-f0-9]{64}$/.test(index.masterSha256) ||
      index.metadata.lengthRestricted !== false || !index.byLengthAndTier ||
      index.reviewDefaults?.reviewStatus !== 'pending' || index.reviewDefaults?.targetEnabled !== false)
    throw new Error('母词库候选索引格式、版本或审核状态不合法。');
  const knownWords = new Map();
  for (const [length, tiers] of Object.entries(index.byLengthAndTier)) {
    if (!Number.isInteger(Number(length)) || Number(length) < 1) throw new Error('母词库词长索引不合法。');
    for (const [tier, words] of Object.entries(tiers)) {
      if (!Object.hasOwn(FREQUENCY_LABELS, tier) || !Array.isArray(words)) throw new Error('母词库频率档位索引不合法。');
      for (const word of words) {
        if (typeof word !== 'string' || !/^[A-Z]+$/.test(word) || word.length !== Number(length) || knownWords.has(word))
          throw new Error('母词库候选词重复或与词长不一致。');
        knownWords.set(word, { length: Number(length), tier: tier === 'unrated' ? null : Number(tier) });
      }
    }
  }
  if (knownWords.size !== index.totalEntries) throw new Error('母词库候选总数与索引声明不一致。');
  if (!overlay || typeof overlay.version !== 'string' || !overlay.version.trim() || !Array.isArray(overlay.entries))
    throw new Error('缺少人工审核覆盖表版本或 entries。');
  const reviews = new Map();
  for (const entry of overlay.entries) {
    if (!entry || !knownWords.has(entry.word) || reviews.has(entry.word) || !['approved', 'blocked'].includes(entry.status) ||
        typeof entry.reason !== 'string' || !entry.reason.trim()) throw new Error('人工审核覆盖表需要有效 word、approved/blocked 状态和 reason；词不能重复。');
    reviews.set(entry.word, { word: entry.word, status: entry.status, reason: entry.reason });
  }
  const reviewSha256 = await digest([...reviews.values()].sort((a, b) => a.word.localeCompare(b.word)));
  return {
    totalEntries: knownWords.size,
    approvedCount: [...reviews.values()].filter(entry => entry.status === 'approved').length,
    reviewSha256,
    frequencyTierForWord: word => knownWords.get(word)?.tier ?? null,
    createRuntimeDictionary({ wordLengths, tiers = [1, 2, 3], allowUnreviewed = false }) {
      if (!Array.isArray(wordLengths) || !wordLengths.length || !wordLengths.every(length => Number.isInteger(length) && length > 0) ||
          !Array.isArray(tiers) || !tiers.length || !tiers.every(tier => tier === null || [1, 2, 3, 4, 5].includes(tier)) || typeof allowUnreviewed !== 'boolean')
        throw new Error('运行时词库需要有效词长、明确频率档位和布尔审核开关。');
      const lengths = [...new Set(wordLengths)].sort((a, b) => a - b);
      const selectedTiers = [...new Set(tiers)].sort((a, b) => (a ?? 6) - (b ?? 6));
      const words = [], countsByLength = {}, countsByTier = {};
      for (const length of lengths) for (const tier of selectedTiers) {
        for (const word of index.byLengthAndTier[length]?.[tierKey(tier)] || []) {
          const status = reviews.get(word)?.status || 'pending';
          if (status !== 'approved' && !(allowUnreviewed && status === 'pending')) continue;
          words.push(word);
          countsByLength[length] = (countsByLength[length] || 0) + 1;
          countsByTier[tierKey(tier)] = (countsByTier[tierKey(tier)] || 0) + 1;
        }
      }
      words.sort();
      const version = `${index.metadata.version}-i${index.masterSha256.slice(0, 12)}-${overlay.version}-r${reviewSha256.slice(0, 12)}-l${lengths.join('_')}-t${selectedTiers.map(tierKey).join('_')}-${allowUnreviewed ? 'pending-test' : 'approved'}`;
      return {
        version, words,
        metadata: { ...index.metadata, masterFile: index.masterFile, masterSha256: index.masterSha256, reviewVersion: overlay.version, reviewSha256,
          runtimeSelection: { lengths, tiers: selectedTiers, allowUnreviewed }, countsByLength, countsByTier,
          reviewWarning: allowUnreviewed ? '词库未完成内容审核' : null },
      };
    },
  };
}
