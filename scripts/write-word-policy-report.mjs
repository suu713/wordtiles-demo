import {readFile,writeFile} from 'node:fs/promises';
const escape=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export async function writeWordPolicyReport({root,audit,apkReport,policy}) {
  const focus=['BRA','GOOSE','NATURAL','PRIVATE','NAKED','SEX','ASS','COCK','PENIS','NUDE','BOOB','WINE','BET','DEAD','RATED'];
  const pct=n=>(n/5000*100).toFixed(2)+'%';
  const frequencyTable=focus.map(word=>{const s=apkReport.words[word];return `<tr><th>${word}</th><td>${s.distinctTargetLevels}</td><td>${s.distinctExtraLists}</td><td>${s.mainTargetPositions.length} (${pct(s.mainTargetPositions.length)})</td><td>${s.mainExtraPositions.length} (${pct(s.mainExtraPositions.length)})</td><td>${s.mainTargetPositions[0]||'—'}</td><td>${s.mainExtraPositions[0]||'—'}</td></tr>`;}).join('');
  const bra=apkReport.words.BRA,p=bra.mainTargetPositions,gaps=p.slice(1).map((v,i)=>v-p[i]);
  const definitionExamples=focus.map(word=>{const s=apkReport.words[word];return `<details><summary>${word}：${s.definition?'有英文释义':'无英文释义'}；目标类型 ${escape(JSON.stringify(s.targetTypes))}；额外词类型 ${escape(JSON.stringify(s.extraTypes))}</summary>${s.definition?'<ol>'+s.definition.senses.map(s=>'<li>('+escape(s.pos)+') '+escape(s.def)+'</li>').join('')+'</ol>':'<p>释义缺失不影响本关列表中的词被接受。</p>'}</details>`;}).join('');
  const corrections=audit.definitionCorrections.map(s=>`<tr><th>${s.word}</th><td>${escape(s.before)}</td><td>${escape(s.after)}</td></tr>`).join('');
  const values={packageHash:apkReport.package.sha256,sourceHash:audit.source.sha256,policyVersion:policy.version,
    enabledLevels:audit.sourceLevels.enabledCount,originalEnglishWords:apkReport.acceptedWordCounts.english,
    frequencyTable,definitionExamples,corrections,braPositions:p.join('、'),braFirst:p[0],braMinGap:Math.min(...gaps),braMaxGap:Math.max(...gaps),
    approvedWords:audit.review.approvedCount,approvedSourceWords:audit.review.approvedSourceCount,missingSource:audit.originalWordsWithoutTSV.length,
    correctionsCount:audit.definitionCorrections.length,hiddenDefinitions:audit.pendingDefinitionReview.length};
  const template=await readFile(new URL('data/game-review/report-template.html',root),'utf8');
  const html=template.replace(/\{\{(\w+)\}\}/g,(_,key)=>{if(!(key in values))throw new Error('Unknown report field '+key);return String(values[key]);});
  await writeFile(new URL('dist/review/index.html',root),html);
  await writeFile(new URL('reports/词库来源与筛查报告.html',root),html.replace('href="policy.json"','href="../data/game-review/policy.json"').replace('href="words.tsv"','href="../data/words.tsv"'));
}
