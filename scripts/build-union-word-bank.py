"""Replace the web bank with all locally extracted English Zen + WT entries."""
from pathlib import Path
from collections import Counter
import hashlib
import io
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.openai/tmp/zen-word-analysis'
DEST = ROOT / 'data/package-union'
DEST.mkdir(parents=True, exist_ok=True)

def load(path):
    return json.loads(path.read_text(encoding='utf-8'))

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def normalize(word):
    return word.strip().upper()

def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')

wt = load(ROOT / 'dist/original-word-policy.json')
zen = load(ROOT / 'dist/zen-levels/vocabulary.json')
wt_path = Path('C:/Users/huyi/Downloads/Word+Tiles+-+Relaxing+Puzzle_1.4.0_APKPure.xapk')
zen_path = Path('C:/Users/huyi/Downloads/Zen Word - v2.44.0.apk')
assert digest(wt_path) == wt['sha256'], 'WT source package changed'
assert digest(zen_path) == zen['sourceSha256'], 'Zen source package changed'
assert load(CACHE / 'source.json')['sha256'] == zen['sourceSha256']

wt_definitions = {}
wt_definition_files = []
with zipfile.ZipFile(wt_path) as outer:
    for name in outer.namelist():
        if not name.endswith('.apk'):
            continue
        with zipfile.ZipFile(io.BytesIO(outer.read(name))) as inner:
            for path in inner.namelist():
                if path.startswith('assets/Definitions/english/') and path.endswith('.json'):
                    wt_definitions.update({normalize(w): value for w, value in json.loads(inner.read(path))['entries'].items()})
                    wt_definition_files.append(path)
assert len(wt_definitions) == 16618 and len(wt_definition_files) == 26
zen_short = {normalize(w): value for w, value in load(CACHE / 'hard-define-decoded.json').items()}
zen_detailed = {normalize(w): value for w, value in load(CACHE / 'definitions.json').items()}
assert len(zen_short) == 17817 and len(zen_detailed) == 1232

wt_roles = {'target': set(map(normalize, wt['targetWordsByLanguage']['english'])),
            'extra': set(map(normalize, wt['extraWordsByLanguage']['english'])), 'definition': set(wt_definitions)}
zen_roles = {role: set(map(normalize, words)) for role, words in zen['rolesByLanguage']['english'].items()}
zen_roles.update({'short-definition': set(zen_short), 'detailed-definition': set(zen_detailed)})
wt_words = set.union(*wt_roles.values())
zen_words = set.union(*zen_roles.values())
assert len(wt_words) == 18531
union = wt_words | zen_words

def definition_wt(word):
    return ' / '.join(dict.fromkeys(sense.get('def', '') for sense in wt_definitions.get(word, {}).get('senses', []) if sense.get('def')))

def definition_zen(word):
    value = zen_short.get(word)
    if isinstance(value, str) and value.strip():
        return value.strip()
    value = zen_detailed.get(word, [])
    return ' / '.join(value) if isinstance(value, list) else str(value or '')

entries = []
for word in sorted(union):
    assert word
    definitions = {}
    if word in zen_words:
        definitions['zen'] = definition_zen(word)
    if word in wt_words:
        definitions['wt-package'] = definition_wt(word)
    roles = {}
    if word in zen_words:
        roles['zen'] = [role for role, words in zen_roles.items() if word in words]
    if word in wt_words:
        roles['wt-package'] = [role for role, words in wt_roles.items() if word in words]
    entries.append({'word': word, 'definition': definitions.get('zen') or definitions.get('wt-package') or '',
                    'definitionLanguage': 'english', 'definitions': definitions, 'origins': list(roles), 'sourceRoles': roles})

encoded = json.dumps(entries, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
sha = hashlib.sha256(encoded).hexdigest()
source_lists = {'language': 'english', 'zenSha256': zen['sourceSha256'], 'wtSha256': wt['sha256'],
                'zen': sorted(zen_words), 'wordtiles': sorted(wt_words)}
dump(DEST / 'source-wordlists.json', source_lists)
sources_sha = digest(DEST / 'source-wordlists.json')
old_path = ROOT / 'dist/web-word-bank.json'
old = load(old_path) if old_path.exists() else {}
old_words = {entry['word'] for entry in old.get('entries', [])}
previous_audit_path = ROOT / 'dist/package-union-audit.json'
previous_audit = load(previous_audit_path) if previous_audit_path.exists() else {}
retired = sorted(old_words - union) if old.get('source', {}).get('kind') != 'package-union' else previous_audit.get('retiredWebOnlyWords', [])
playable = [entry['word'] for entry in entries if re.fullmatch(r'[A-Z]{2,10}', entry['word'])]
statistics = {'totalWords': len(entries), 'generationWords': len(playable), 'zenWords': len(zen_words),
              'wtWords': len(wt_words), 'overlapWords': len(wt_words & zen_words),
              'generationLengths': dict(sorted(Counter(map(len, playable)).items())),
              'wordsWithDefinition': sum(bool(entry['definition']) for entry in entries)}
source = {'kind': 'package-union', 'file': 'Zen Word 2.44.0 + Word Tiles 1.4.0 · 全部本地英文词条',
          'sha256': sha, 'language': 'english', 'sourceWordlistsSha256': sources_sha,
          'packages': [{'origin': 'zen', 'version': '2.44.0', 'sha256': zen['sourceSha256'], 'wordCount': len(zen_words)},
                       {'origin': 'wt-package', 'version': '1.4.0', 'sha256': wt['sha256'], 'wordCount': len(wt_words)}],
          'scope': 'Union of every packaged English level role and locally extracted English dictionary entry; no prior web TSV entries or tiers.'}
dump(old_path, {'version': 'package-union-en-v1-' + sha[:12], 'source': source, 'statistics': statistics, 'entries': entries})
audit = {'version': 'package-union-en-v1-' + sha[:12], 'source': source, 'statistics': statistics,
         'retiredWebOnlyWordCount': len(retired), 'retiredWebOnlyWords': retired,
         'nativeRolesPreserved': True, 'webTargetPolicy': 'All union words; actual generation requires 2–10 ASCII letters and a validated board.',
         'wordFrequency': 'Independent English corpus prior; old TSV tiers removed.',
         'definitionSource': 'Original packaged English definitions only; missing entries remain empty.',
         'sourceVerification': {'wtDefinitionFiles': wt_definition_files, 'zenShortEntries': len(zen_short),
                                'zenDetailedEntries': len(zen_detailed), 'zenLevelWords': len(zen['languages']['english']),
                                'zenIncludesBubbleAndAllEnglishGroups': True}}
dump(previous_audit_path, audit)
print(json.dumps({'version': audit['version'], **statistics, 'removedOldWebOnlyWords': len(retired)}, ensure_ascii=False))
