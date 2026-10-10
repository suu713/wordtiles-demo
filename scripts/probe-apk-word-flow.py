"""Inspect the original submission flow, target consumption and word definitions."""
import importlib.util
import io
import json
from pathlib import Path
import struct
import sys
import zipfile

sys.stdout.reconfigure(encoding='utf-8')
spec = importlib.util.spec_from_file_location('il2cpp_static', Path(__file__).with_name('analyze-il2cpp.py'))
apk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apk)
meta = apk.Metadata()
native = apk.Native()
native.locate_modules(meta)
selected = {
    'CollectManager': {'SelectionComplete', 'ResolveCollectResult', 'CreateSelectionWord', 'OnTargetWordCollectComplete'},
    'InputManager': {'HandleInputEnd', 'HandleInputBegin', 'HandleInputDrag', 'SelectLetter', 'IsAdjacentToLastSelected'},
    'GameManager': {'StartGame', 'CheckLevelWin', 'SaveProgress', 'Reset', 'Update', 'TryShowNoThreeLetterNotification'},
    'GridManager': {'UpdateUsageCounts'},
    'WordPathService': {'FindWordPaths', 'FindPathsForWord', 'SearchPathsFromCell', 'ConsumeTargetWordUsage', '.cctor'},
    'WordDefinitionService': {'LoadDefinitionsForLevel', 'TryGetDefinition', 'GetCollectedDefinitions'},
    'ExpressionManager': {'GetRareHardLocalizationKey'},
    'ExtraWordsPopup': {'OnCollectButtonClicked', 'OnRewardedAdCompleted'},
    'RemoteConfigService': {'LoadExtraWordCollectLevels'},
    'TutorialManager': {'IsAllowedWord'},
    'LevelDataExtensions': {'HasNoThreeLetterTargetWords'},
}
lines = []
for typ in meta.types:
    if typ['name'] not in selected:
        continue
    for method in meta.methods[typ['methodStart']:typ['methodStart']+typ['methodCount']]:
        if method['name'] not in selected[typ['name']] or 'address' not in method:
            continue
        print(typ['namespace']+'.'+typ['name']+'.'+method['name'], hex(method['address']), 'PARAMS', method['params'])
        lines.append('\n'+typ['namespace']+'.'+typ['name']+'.'+method['name']+' '+hex(method['address']))
        lines.extend(native.disasm(method['address'], limit=1800))
(apk.OUT/'native-word-flow.txt').write_text('\n'.join(lines), encoding='utf-8')

defaults = {}
for pos in range(meta.header[16], meta.header[16]+meta.header[17], 12):
    field_index, type_index, data_index = struct.unpack_from('<3I', meta.raw, pos)
    if data_index != 0xffffffff:
        first_byte = meta.raw[meta.header[18]+data_index]
        if first_byte < 0x80:
            # v31 integer defaults use a compressed unsigned value with a sign bit.
            value = first_byte >> 1
            defaults[field_index] = -value-1 if first_byte & 1 else value
for typ in meta.types:
    if typ['name'] in ('WordType', 'PlayerInventoryConstants', 'CollectResult'):
        print('CONSTANTS', typ['namespace']+'.'+typ['name'], {f['name']:defaults.get(f['index']) for f in meta.fields(typ)})

definitions = {}
with zipfile.ZipFile('C:/Users/huyi/Downloads/Word+Tiles+-+Relaxing+Puzzle_1.4.0_APKPure.xapk') as outer:
    for name in outer.namelist():
        if not name.endswith('.apk'):
            continue
        with zipfile.ZipFile(io.BytesIO(outer.read(name))) as inner:
            for entry in inner.namelist():
                if entry.startswith('assets/Definitions/english/') and entry.endswith('.json'):
                    content = json.loads(inner.read(entry))
                    definitions.update(content['entries'])
print('DEFINITIONS', len(definitions))
for word in ['JIB','FRO','ROAN','ION','BUN','ON','IS']:
    print('DEFINITION', word, json.dumps(definitions.get(word),ensure_ascii=False)[:1000])

root = apk.OUT.parents[1]
stats = {}
for bank_file in sorted((root/'dist/source-levels').glob('*.json')):
    bank = json.loads(bank_file.read_text(encoding='utf-8'))
    if 'levels' not in bank:
        continue
    levels = list(bank['levels'].values())
    extras = [entry for level in levels for entry in level['extra_words']]
    overlaps = [level['id'] for level in levels if {entry['word'] for entry in level['extra_words']} & {entry['word'] for entry in level['target_words']}]
    duplicates = [level['id'] for level in levels if len(level['extra_words']) != len({entry['word'] for entry in level['extra_words']})]
    stats[bank_file.stem] = {'levels':len(levels), 'withExtraWords':sum(bool(level['extra_words']) for level in levels), 'extraEntries':len(extras), 'minLength':min((len(entry['word']) for entry in extras),default=0), 'maxLength':max((len(entry['word']) for entry in extras),default=0), 'typeCounts':{str(i):sum(entry['type']==i for entry in extras) for i in (0,1,2)}, 'targetOverlapLevels':overlaps, 'duplicateExtraLevels':duplicates}
print('LEVEL_STATS',json.dumps(stats,ensure_ascii=False))
(apk.OUT/'extra-word-bank-stats.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf-8')

# Find dictionary-defined board words omitted from each level's acceptance lists.
trie = {}
for word in definitions:
    if len(word) < 2 or len(word) > 12 or not word.isalpha():
        continue
    node = trie
    for letter in word:
        node = node.setdefault(letter,{})
    node['$'] = word
bank = json.loads((root/'dist/source-levels/english.json').read_text(encoding='utf-8'))
examples = []
for lid in bank['orders']['main'][:50]:
    level = bank['levels'][str(lid)]
    rows = level['letters'].split(',')
    height,width = len(rows),len(rows[0])
    letters = ''.join(rows)
    paths = {}
    def search(index,node,visited):
        letter = letters[index]
        if letter not in node:
            return
        node = node[letter]
        path = visited+[index]
        if '$' in node:
            paths.setdefault(node['$'],path)
        r,c = divmod(index,width)
        for nr,nc in ((r-1,c),(r+1,c),(r,c-1),(r,c+1)):
            nxt = nr*width+nc
            if 0<=nr<height and 0<=nc<width and nxt not in path:
                search(nxt,node,path)
    for index in range(len(letters)):
        search(index,trie,[])
    accepted = {entry['word'] for entry in level['extra_words']+level['target_words']}
    excluded = sorted(set(paths)-accepted,key=lambda word:(-len(word),word))
    if excluded:
        item = {'id':level['id'],'letters':level['letters'],'targets':level['target_words'],'extras':level['extra_words'],'excludedDefinitions':{word:{'path':paths[word],'definition':definitions[word]} for word in excluded[:5]}}
        examples.append(item)
        print('COUNTEREXAMPLE',json.dumps(item,ensure_ascii=False)[:3000])
    if len(examples)>=5:
        break
(apk.OUT/'extra-word-counterexamples.json').write_text(json.dumps(examples,ensure_ascii=False,indent=2),encoding='utf-8')
print('SAVED',len(lines),'flow lines')
