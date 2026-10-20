function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableJson(value[key])]));
  return value;
}

// Results follow the immutable level and its dictionary, never a live human session.
export class MachinePlaytestResults {
  constructor() { this.results = new Map(); this.keys = new WeakMap(); }
  key(session) {
    const level = session?.exportInitial || session?.initial;
    if (!level) return null;
    const {editorNumber, ...source} = level.source || {};
    if (!this.keys.has(session)) this.keys.set(session, JSON.stringify(stableJson({
      level: {...level, source},
      dictionaryVersion: session.dictionary?.version ?? level.dictionaryVersion ?? null,
      dictionaryOrigin: session.dictionary?.metadata?.origin ?? level.source?.dictionaryOrigin ?? null,
    })));
    return this.keys.get(session);
  }
  get(session) { return this.results.get(this.key(session)) ?? null; }
  set(session, summary) {
    if (summary?.mode !== 'ordinary' || !['won', 'gave-up'].includes(summary.outcome) ||
        !Number.isSafeInteger(summary.mistakes) || summary.mistakes < 0) return false;
    const key = this.key(session);
    if (key === null) return false;
    const {events, wordStats, ...result} = summary;
    this.results.set(key, result);
    return true;
  }
  clear() { this.results.clear(); this.keys = new WeakMap(); }
}
