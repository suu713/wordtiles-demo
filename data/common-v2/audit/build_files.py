"""Rebuild approved runtime files and audit; no download and no frequency fabrication."""
from pathlib import Path
from collections import Counter
import argparse, hashlib, importlib.util, json, re
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--original',type=Path,required=True);a=p.parse_args()
spec=importlib.util.spec_from_file_location('decisions',ROOT/'audit/decisions.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
raw=a.original.read_bytes();original=json.loads(raw);old=set(original['words']);extra=set()
for line in (ROOT/'audit/additional_candidates.txt').read_text().splitlines():
 if not line.startswith('#'): extra.update(line.upper().split())
words=sorted((old|extra)-set(m.EXCLUSIONS)); kept=set(words)
assert all(re.fullmatch('[A-Z]+',w) for w in words)
def write(name,data):
 (ROOT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
version='wordtiles-common-base-20261010-v2'
write('dictionary.json',{'version':version,'words':words})
small=[w for w in words if 3<=len(w)<=5]
write('dictionary_3to5.json',{'version':version+'-len3to5','words':small})
(ROOT/'approved_words.txt').write_text('\n'.join(words)+'\n')
write('audit/original_1602_clean.json',{'version':version+'-original-only','words':sorted(old&kept)})
write('audit/original_1602_decisions.json',[{'word':w,'accepted':w in kept,**({'reason':'approved_common_base'} if w in kept else m.EXCLUSIONS[w])} for w in sorted(old)])
write('audit/removed_original_1602.json',[{'word':w,**m.EXCLUSIONS[w]} for w in sorted(old-kept)])
write('audit/exclusion_decisions.json',[{'word':w,**v} for w,v in sorted(m.EXCLUSIONS.items())])
counts=Counter(map(len,words))
report={'version':version,'original_version':original['version'],'original_sha256':hashlib.sha256(raw).hexdigest(),'original_count':len(old),'original_kept':len(old&kept),'original_removed':len(old-kept),'added_approved_words':len(kept-old),'approved_count':len(words),'current_3to5_count':len(small),'beyond_5_count':sum(v for k,v in counts.items() if k>5),'length_counts':dict(sorted(counts.items())),'scope':'Original supplied 1602 entries fully reviewed; assistant-selected longer headwords added. The user local expanded master is not available in this session. Unknown words are disallowed by exact whitelist, not declared invalid English.','frequency_scores_created':False,'native_speaker_playtest_performed':False,'selection':'assistant-curated conservative everyday headword whitelist; product policy, not an official universal familiarity standard'}
write('audit/summary.json',report);print(json.dumps(report,ensure_ascii=False,indent=2))
