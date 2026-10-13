import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function parseWordlist(bytes) {
  const input=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
  const entries=[],words=new Set();
  for(const [i,line] of input.split(/\r?\n/).entries()) {
    if(!line||line.startsWith('#'))continue;
    const fields=line.split('\t');assert.equal(fields.length,3,`line ${i+1}: expected word, tier, definition`);
    const [word,tier,definition]=fields;
    assert.match(word,/^[A-Z]+$/);assert.ok(!words.has(word),`duplicate ${word}`);
    assert.match(tier,/^[1-5]$/);assert.ok(definition.trim(),`${word}: missing definition`);
    words.add(word);entries.push({word,tier:Number(tier),definition});
  }
  assert.ok(entries.length>0);
  return {header:input.split(/\r?\n/)[0].replace(/^#\s*/,''),entries:entries.sort((a,b)=>a.word.localeCompare(b.word))};
}
export function reviewWordlist(bytes,whitelist,policy,originalPackage) {
  assert.ok(originalPackage?.languages?.english?.length,'Original package word manifest required');
  const parsed=parseWordlist(bytes),allowedBases=new Set(whitelist.words),originalWords=new Set(originalPackage.languages.english),exclusions=new Map();
  for(const [category,words] of Object.entries(policy.excludedCategories))for(const word of words.split(/\s+/)) {
    assert.match(word,/^[A-Z]+$/);exclusions.set(word,category);
  }
  const unsafeDefinition=new RegExp(policy.unsafeDefinitionPattern,'u'),records=[],entries=[];
  for(const original of parsed.entries) {
    const originalPackageWord=originalWords.has(original.word);
    const reason=originalPackageWord?null:exclusions.get(original.word)||(!allowedBases.has(original.word)?'outside-reviewed-base-whitelist':null);
    let definition='',definitionMethod='';
    if(!reason) {
      if(policy.definitionOverrides[original.word]) {
        definition=policy.definitionOverrides[original.word];definitionMethod='project-correction';
      } else {
        const firstSense=original.definition.split(/\s{2,}/)[0].replace(/[,，]?\s*[^,，;；]*…$/u,'').trim();
        definition=firstSense.split(/[,，]\s*/).slice(0,3).join('；').trim();
        definitionMethod=definition===original.definition?'supplied-tsv':'source-common-sense-excerpt';
      }
      if(!definition||!/[\u3400-\u9fff]/u.test(definition)||unsafeDefinition.test(definition)) {
        definition='';definitionMethod='definition-hidden-pending-review';
      }
    }
    records.push({...original,originalPackageWord,decision:reason?'reject':'allow',reason:reason||(originalPackageWord?'original-package-exemption':'reviewed-base-word'),displayDefinition:reason?'':definition,definitionMethod:reason?'not-enabled':definitionMethod});
    if(!reason)entries.push({...original,originalPackageWord,definition,definitionSource:definitionMethod});
  }
  const suppliedWords=new Set(parsed.entries.map(e=>e.word));
  // No manufactured Chinese translation or frequency for original words absent
  // from the supplied table. They remain playable and collectable.
  for(const word of originalWords)if(!suppliedWords.has(word))entries.push({word,tier:null,originalPackageWord:true,definition:policy.definitionOverrides[word]||'',definitionSource:policy.definitionOverrides[word]?'project-correction':'original-package-no-chinese-definition'});
  entries.sort((a,b)=>a.word.localeCompare(b.word));
  const sourceHash=sha256(bytes),reviewHash=sha256(JSON.stringify({whitelist,policy,originalPackage}));
  const version=`wordtiles-reviewed-${sourceHash.slice(0,12)}-${reviewHash.slice(0,12)}`;
  return {library:{version,source:{file:'words.tsv',sha256:sourceHash,description:parsed.header,license:'MIT (as declared in the supplied TSV header)'},review:{version:policy.version,sha256:reviewHash,sourceCount:parsed.entries.length,approvedSourceCount:records.filter(r=>r.decision==='allow').length,originalPackageCount:originalWords.size,originalPackageSha256:originalPackage.sha256,approvedCount:entries.length,scope:policy.scope,whitelistVersion:whitelist.version},entries},records,exclusions};
}
