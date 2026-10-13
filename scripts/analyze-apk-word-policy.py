"""Reproduce packaged word lists, definition examples and native flow evidence.

Only read the five original banks listed by the original catalogue. Main-level
positions and distinct level files are counted separately. Never execute APK code.
"""
import importlib.util
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import zipfile

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('il2cpp_static', Path(__file__).with_name('analyze-il2cpp.py'))
apk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apk)
meta, native = apk.Metadata(), apk.Native()
native.locate_modules(meta)
catalogue = json.loads((ROOT/'dist/source-levels/catalogue.json').read_text(encoding='utf-8'))
source_path = Path('C:/Users/huyi/Downloads/Word+Tiles+-+Relaxing+Puzzle_1.4.0_APKPure.xapk')
with source_path.open('rb') as source_file:
    assert hashlib.file_digest(source_file,'sha256').hexdigest() == catalogue['sha256'], 'APK differs from archived level source'
definitions = {}
definition_paths = []
with zipfile.ZipFile('C:/Users/huyi/Downloads/Word+Tiles+-+Relaxing+Puzzle_1.4.0_APKPure.xapk') as outer:
    for name in outer.namelist():
        if not name.endswith('.apk'):
            continue
        with zipfile.ZipFile(io.BytesIO(outer.read(name))) as inner:
            for path in inner.namelist():
                if path.startswith('assets/Definitions/english/') and path.endswith('.json'):
                    definitions.update(json.loads(inner.read(path))['entries'])
                    definition_paths.append(path)
            if 'lib/armeabi-v7a/libil2cpp.so' in inner.namelist():
                assert inner.read('lib/armeabi-v7a/libil2cpp.so') == native.raw, 'Native evidence differs from supplied APK'
            if 'assets/bin/Data/Managed/Metadata/global-metadata.dat' in inner.namelist():
                assert inner.read('assets/bin/Data/Managed/Metadata/global-metadata.dat') == meta.raw, 'Metadata differs from supplied APK'

languages = {}
target_words_by_language = {}
extra_words_by_language = {}
english = None
for info in catalogue['languages']:
    bank = json.loads((ROOT/'dist/source-levels'/info['file']).read_text(encoding='utf-8'))
    words = sorted({item['word'] for level in bank['levels'].values() for item in level['target_words']+level['extra_words']})
    languages[info['language']] = words
    target_words_by_language[info['language']] = sorted({item['word'] for level in bank['levels'].values() for item in level['target_words']})
    extra_words_by_language[info['language']] = sorted({item['word'] for level in bank['levels'].values() for item in level['extra_words']})
    if info['language'] == 'english':
        english = bank
english_words = set(languages['english'])
original = {'version':'xapk-1.4.0-accepted-words-v1','packageName':catalogue['packageName'],
    'sha256':catalogue['sha256'], 'basis':'Exact target_words or extra_words in the original five packaged level banks; definition-only entries do not confer gameplay acceptance.',
    'languages':languages,'targetWordsByLanguage':target_words_by_language,'extraWordsByLanguage':extra_words_by_language,
    'englishDefinitions':{w:definitions[w] for w in sorted(english_words) if w in definitions}}
(ROOT/'data/game-review').mkdir(parents=True, exist_ok=True)
(ROOT/'data/game-review/original-package.json').write_text(json.dumps(original,ensure_ascii=False)+'\n',encoding='utf-8')

focus = ['BRA','GOOSE','NATURAL','PRIVATE','COCK','DICK','ASS','SEX','TIT','TITS','PUSSY','PENIS','VAGINA','FUCK','SHIT','RAPE','NUDE','NAKED','BREAST','BOOB','BITCH','WINE','BET','DEAD','RATED','NAT','DELL','OAT','LAD','BOA','FRO','ROAN']
statistics = {}
for word in focus:
    target_ids, extra_ids, target_types, extra_types = [], [], {}, {}
    for lid, level in english['levels'].items():
        for role, ids, types in [('target_words',target_ids,target_types),('extra_words',extra_ids,extra_types)]:
            for entry in level[role]:
                if entry['word'] == word:
                    ids.append(int(lid))
                    key = str(entry.get('type'))
                    types[key] = types.get(key,0)+1
    target_set, extra_set = set(target_ids), set(extra_ids)
    target_positions = [i+1 for i,lid in enumerate(english['orders']['main']) if lid in target_set]
    extra_positions = [i+1 for i,lid in enumerate(english['orders']['main']) if lid in extra_set]
    statistics[word] = {'distinctTargetLevels':len(target_ids),'distinctExtraLists':len(extra_ids),
        'targetTypes':target_types,'extraTypes':extra_types,
        'mainTargetPositions':target_positions,'mainExtraPositions':extra_positions,
        'definition':definitions.get(word), 'acceptedInPackagedLevels':word in english_words}

selected = []
code = []
for typ in meta.types:
    if ('WordDefinition' in typ['name'] or re.search(r'Dictionary|LikedWord|DislikedWord|CollectedWord',typ['name'])) and 3700 <= typ['index'] < 4800:
        item={**typ,'fields':meta.fields(typ),'methods':meta.methods[typ['methodStart']:typ['methodStart']+typ['methodCount']]}
        selected.append(item)
        print(typ['index'],typ['namespace']+'.'+typ['name'],'FIELDS',','.join(f['name'] for f in item['fields']),'METHODS',','.join(m['name']+'@'+hex(m.get('address',0)) for m in item['methods']))
        for method in item['methods']:
            if 'address' in method:
                code.append('\n'+typ['namespace']+'.'+typ['name']+'.'+method['name']+' '+hex(method['address']))
                code.extend(native.disasm(method['address'],limit=1800))
    if typ['name'] in ('InGamePanelController','GameManager','InputManager'):
        for method in meta.methods[typ['methodStart']:typ['methodStart']+typ['methodCount']]:
            if method['name'] in ('ShowInGameDictionaryPopup','IsDictionaryAvailable','RefreshDictionaryButton','TryOpenDictionaryForTargetWord','CompleteLevelWin') and 'address' in method:
                code.append('\n'+typ['namespace']+'.'+typ['name']+'.'+method['name']+' '+hex(method['address']))
                code.extend(native.disasm(method['address'],limit=2500))
# Async state machines are not guaranteed to have the enclosing class name.
for typ in meta.types:
    if re.search(r'LoadDefinitionsForLevel|GetCollectedDefinitions|CollectWord|LoadDefinitions',typ['name']):
        methods=meta.methods[typ['methodStart']:typ['methodStart']+typ['methodCount']]
        print('STATE',typ['index'],typ['name'],meta.fields(typ))
        for method in methods:
            if 'address' in method:
                code.append('\n'+typ['namespace']+'.'+typ['name']+'.'+method['name']+' '+hex(method['address']))
                code.extend(native.disasm(method['address'],limit=2500))
report={'package':catalogue,'method':'Static original level JSON, packaged definitions and mapped ARM IL2CPP; APK not executed.',
    'englishDistinctLevels':len(english['levels']),'englishMainPositions':len(english['orders']['main']),
    'definitionCount':len(definitions),'definitionFiles':definition_paths,
    'definitionSenseCounts':{str(n):sum(len(entry['senses'])==n for entry in definitions.values()) for n in sorted({len(e['senses']) for e in definitions.values()})},
    'acceptedWordCounts':{lang:len(words) for lang,words in languages.items()},'words':statistics}
(ROOT/'reports/apk-word-policy.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(apk.OUT/'definition-runtime-types.json').write_text(json.dumps(selected,ensure_ascii=False,indent=2),encoding='utf-8')
(apk.OUT/'native-definition-flow.txt').write_text('\n'.join(code),encoding='utf-8')
print('COUNTS', report['acceptedWordCounts'])
for w in focus:
    s=statistics[w]
    print(w,'target',s['distinctTargetLevels'],'extra',s['distinctExtraLists'],'main target',len(s['mainTargetPositions']),'main extra',len(s['mainExtraPositions']),'types',s['targetTypes'],s['extraTypes'],'def',s['definition'])
