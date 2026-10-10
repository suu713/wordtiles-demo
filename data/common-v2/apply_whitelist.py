#!/usr/bin/env python3
"""Apply the completed exact whitelist to the prior graded master, preserving frequency and notices.
Usage: python apply_whitelist.py --master path/to/dictionary.master.json --out clean-output
No download, no general stemming, no silent expansion, no human approval queue.
"""
from __future__ import annotations
import argparse, copy, hashlib, json, re
from pathlib import Path
from typing import Any
ROOT=Path(__file__).resolve().parent

def apply_policy(master:dict[str,Any], policy:dict[str,Any]) -> tuple[dict[str,Any],dict[str,Any],dict[str,Any]]:
    if not isinstance(master,dict) or not isinstance(master.get('entries'),list) or not isinstance(master.get('metadata'),dict):
        raise ValueError('Expected the previous builder format: {metadata, entries}.')
    if not isinstance(policy,dict) or not isinstance(policy.get('version'),str) or not isinstance(policy.get('words'),list):
        raise ValueError('Invalid whitelist: expected {version, words}.')
    ws=policy['words']
    if not ws or any(not isinstance(w,str) or not re.fullmatch('[A-Z]+',w) for w in ws) or len(set(ws))!=len(ws):
        raise ValueError('Whitelist must be nonempty, duplicate-free uppercase ASCII words.')
    allowed=set(ws); seen=set(); rows=[]; enabled=[]; reasons={}
    for i,entry in enumerate(master['entries']):
        if not isinstance(entry,dict) or not isinstance(entry.get('word'),str):
            raise ValueError(f'Invalid entry at index {i}.')
        row=copy.deepcopy(entry); original=row['word']; word=original.upper()
        valid=bool(re.fullmatch('[A-Z]+',word))
        # Do not turn DON'T into DONT, trim invalid spellings, or derive RATE from RATED.
        if word in seen: raise ValueError(f'Duplicate normalized entry: {word}')
        seen.add(word)
        was_blocked=row.get('reviewStatus')=='blocked'
        ok=valid and word in allowed and not was_blocked
        reason='approved_by_whitelist' if ok else ('preserved_existing_block' if was_blocked else 'outside_approved_whitelist')
        row.update(word=word,reviewStatus='approved' if ok else 'blocked',targetEnabled=ok,
                   contentPolicyVersion=policy['version'],contentDecision=reason,contentDecisionSource='assistant-curated-whitelist')
        rows.append(row); reasons[reason]=reasons.get(reason,0)+1
        if ok: enabled.append(word)
    meta=copy.deepcopy(master['metadata']); source_version=meta.get('version','unversioned')
    policy_hash=hashlib.sha256('\n'.join(ws).encode()).hexdigest()
    # Include source metadata plus entry content to avoid reusing a stale version after data changes.
    source_hash=hashlib.sha256(json.dumps(master,sort_keys=True,ensure_ascii=False,allow_nan=False).encode()).hexdigest()
    version=f'{policy["version"]}-source{source_hash[:12]}-policy{policy_hash[:12]}'
    meta.update(version=version,sourceMasterVersion=source_version,contentPolicyVersion=policy['version'],
                contentPolicySHA256=policy_hash,sourceMasterSHA256=source_hash,
                contentReview={'method':'exact completed whitelist; unknown entries disabled','demographicPlaytest':False,
                               'frequencyFieldsModified':False,'existingExplicitBlocksPreserved':True},
                reviewWarning='Whitelist content screening applied. This is not a guarantee every native speaker knows every word. Frequency scores and licenses are retained unchanged.')
    runtime={'version':version,'words':sorted(enabled)}
    report={'inputCount':len(rows),'enabledCount':len(enabled),'disabledCount':len(rows)-len(enabled),
            'whitelistCount':len(ws),'whitelistWordsNotInMaster':sorted(allowed-seen),'reasons':reasons,
            'sourceVersion':source_version,'outputVersion':version,'frequencyFieldsModified':False}
    return {'metadata':meta,'entries':rows},runtime,report

def main()->int:
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--master',type=Path,required=True)
    p.add_argument('--whitelist',type=Path,default=ROOT/'dictionary.json');p.add_argument('--out',type=Path,required=True)
    args=p.parse_args()
    try:
        if args.out.exists(): raise ValueError('Output path already exists. Use a new directory; original files are never overwritten.')
        master=json.loads(args.master.read_text(encoding='utf-8-sig'));policy=json.loads(args.whitelist.read_text(encoding='utf-8-sig'))
        reviewed,runtime,report=apply_policy(master,policy)
        if not runtime['words']: raise ValueError('No enabled intersection. Check input data; no fallback dictionary was loaded.')
        args.out.mkdir(parents=True,exist_ok=False)
        for name,data in [('dictionary.master.reviewed.json',reviewed),('dictionary.runtime.json',runtime),('report.json',report)]:
            (args.out/name).write_text(json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
        # Tier files are only intersections with existing measured tiers, never estimated anew.
        for tier in (1,2,3,4,5,None):
            selected=[e for e in reviewed['entries'] if e['targetEnabled'] and e.get('frequencyTier')==tier]
            (args.out/f'dictionary.tier-{tier if tier is not None else "unrated"}.json').write_text(json.dumps({'metadata':reviewed['metadata'],'entries':selected},ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
        print(json.dumps(report,ensure_ascii=False,indent=2));return 0
    except (OSError,ValueError,TypeError) as e:
        print(f'ERROR: {e}');return 1
if __name__=='__main__':raise SystemExit(main())
