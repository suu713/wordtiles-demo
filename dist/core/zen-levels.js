import { clone, freeze } from './rules.js?v=21';

export function canSpell(pool, word) {
  const available = [...pool];
  return [...word].every(letter => {
    const index = available.indexOf(letter);
    if (index < 0) return false;
    available.splice(index, 1); return true;
  });
}

export function zenRecord(level) { return level.original?.B || level.original; }
export function validateZenLevel(level) {
  const errors = [], raw = zenRecord(level);
  if (level?.kind !== 'zen' || level.source?.packageName !== 'kidultlovin.word.zen' || !raw)
    return { valid:false, errors:['缺少 Zen 原包来源'] };
  const expected = raw.answers || raw.answer || [...new Set((raw.groups || []).flatMap(g => g.answer || []))];
  if (!Array.isArray(level.targets) || !level.targets.length || JSON.stringify(expected) !== JSON.stringify(level.targets)) errors.push('目标词与原始数据不一致');
  if (level.letters !== (raw.letter || '')) errors.push('字母池与原始数据不一致');
  if (level.mode === 'chain') {
    if (!Array.isArray(raw.letters) || raw.letters.length !== expected.length || expected.some((w,i) => !canSpell(raw.letters[i],w))) errors.push('连词阶段字母不足');
  } else if (level.mode === 'bubble') {
    if (!raw.groups?.length || raw.groups.some(g => g.answer?.length !== 4 || new Set(g.answer).size !== 4)) errors.push('词组格式不完整');
  } else if (expected.some(word => !canSpell(level.letters,word))) errors.push('目标词无法用原字母池拼出');
  for (const role of ['answer','extra','onlyExtra','bonus']) {
    const words = role === 'answer' ? expected : (raw.groups ? [...new Set(raw.groups.flatMap(g => g[role] || []))] : raw[role] || []);
    if (JSON.stringify(level.wordRoles?.[role]) !== JSON.stringify(words)) errors.push(`${role} 与原始名单不一致`);
  }
  return {valid:!errors.length,errors};
}

// A local adapter for the APK's stored lists, not a claim about native reward logic.
export class ZenSession {
  constructor(level) {
    const report = validateZenLevel(level);
    if (!report.valid) throw new Error(report.errors.join('；'));
    this.level = freeze(clone(level)); this.report = report;
    this.completedIndices = new Set(); this.bonusCompleted = new Set(); this.status = 'playing';
    this.initial = this.level;
  }
  get completedCount() { return this.completedIndices.size; }
  get targetCount() { return this.level.mode === 'bubble' ? zenRecord(this.level).groups.length : this.level.targets.length; }
  get pending() {
    if (this.level.mode === 'bubble') return zenRecord(this.level).groups.flatMap((g,i) => this.completedIndices.has(i) ? [] : [{word:g.theme,index:i,words:g.answer}]);
    return this.level.targets.flatMap((word,index) => this.completedIndices.has(index) ? [] : [{word,index}]);
  }
  get pool() { return this.level.mode === 'chain' ? zenRecord(this.level).letters[this.pending[0]?.index] || '' : this.level.letters; }
  audit() { this.status = this.completedCount === this.targetCount ? 'won' : 'playing'; return true; }
  submit(value) {
    if (this.status !== 'playing') return {accepted:false,reason:this.status};
    if (this.level.mode === 'bubble') {
      const words = Array.isArray(value) ? value : [];
      const target = this.pending.find(g => words.length === 4 && new Set(words).size === 4 && words.every(w => g.words.includes(w)));
      if (!target) return {accepted:false,reason:'not-target',word:words.join(',')};
      this.completedIndices.add(target.index); this.audit(); return {accepted:true,word:target.word,status:this.status};
    }
    const word = String(value || '').trim().toLocaleUpperCase(this.level.source.language === 'turkish' ? 'tr' : 'en');
    if (!canSpell(this.pool,word) || !word) return {accepted:false,reason:'invalid-path',word};
    const pending = this.level.mode === 'chain' ? this.pending.slice(0,1) : this.pending;
    const target = pending.find(t => t.word === word);
    if (target) { this.completedIndices.add(target.index); this.audit(); return {accepted:true,word,status:this.status}; }
    if (this.level.targets.includes(word) && this.level.mode !== 'chain') return {accepted:false,reason:'already-completed',word};
    const role = ['extra','onlyExtra','bonus'].find(role => this.level.wordRoles[role].includes(word));
    if (role) { const isNew = !this.bonusCompleted.has(word); this.bonusCompleted.add(word); return {accepted:false,reason:'extra-word',role,word,isNew}; }
    return {accepted:false,reason:'not-target',word};
  }
  hint() {
    const target = this.pending[0];
    return target ? {word:target.word,value:target.words || target.word} : null;
  }
}
