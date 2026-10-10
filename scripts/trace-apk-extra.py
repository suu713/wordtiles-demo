"""Trace original extra-word gameplay code and inspect level/definition examples."""
import importlib.util
import json
from pathlib import Path
import re
import sys
import zipfile
import io

sys.stdout.reconfigure(encoding='utf-8')
spec = importlib.util.spec_from_file_location('il2cpp_static', Path(__file__).with_name('analyze-il2cpp.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Metadata, Native, OUT = module.Metadata, module.Native, module.OUT
meta = Metadata()
native = Native()
native.locate_modules(meta)

names = {
    'OnExtraWordCollected', 'DuplicateExtraWordCollected',
    'RegisterExtraWordCollectProgress', 'PlayExtraWordCollectFlow',
    'ShowDuplicateExtraWordTooltip', 'OnTargetWordCollected',
    'OnWordCollected', 'OnWordSelected', 'OnWordSelectionEnded',
    'OnWordSubmitted', 'GetExpression', 'SelectExpression',
}
selected = []
owners = set()
for method in meta.methods:
    typ = meta.types[method['owner']]
    if method['name'] in names or (typ['namespace'].startswith('Gameplay') and re.search(r'ExtraWord|Release|Submit|SelectionEnd|Validate.*Word|Word.*Valid', method['name'])):
        owners.add(method['owner'])
        selected.append({**method, 'ownerName': typ['namespace']+'.'+typ['name']})

types = []
for typ in meta.types:
    methods = meta.methods[typ['methodStart']:typ['methodStart']+typ['methodCount']]
    if typ['index'] in owners or (3700 <= typ['index'] <= 4700 and re.search(r'InventoryItemType|WordType|Expression|Cell|Tile|Input|Select|ExtraWordCollect', typ['name'])):
        types.append({**typ, 'fields': meta.fields(typ), 'methods': methods})
        print('TYPE', typ['index'], typ['namespace']+'.'+typ['name'], 'FIELDS', ','.join(f['name'] for f in meta.fields(typ)), 'METHODS', ','.join(m['name']+'@'+hex(m.get('address',0)) for m in methods))
(OUT/'extra-gameplay-types.json').write_text(json.dumps(types, ensure_ascii=False, indent=2), encoding='utf-8')
lines = []
for method in selected:
    if 'address' not in method:
        continue
    lines.append('\n'+method['ownerName']+'.'+method['name']+' '+hex(method['address']))
    lines.extend(native.disasm(method['address'], limit=1200))
(OUT/'native-extra-gameplay.txt').write_text('\n'.join(lines), encoding='utf-8')
print('SAVED', len(selected), 'methods', len(lines), 'lines')

xapk = Path('C:/Users/huyi/Downloads/Word+Tiles+-+Relaxing+Puzzle_1.4.0_APKPure.xapk')
definitions = {}
with zipfile.ZipFile(xapk) as outer:
    for name in outer.namelist():
        if not name.endswith('.apk'):
            continue
        with zipfile.ZipFile(io.BytesIO(outer.read(name))) as inner:
            for entry in inner.namelist():
                if re.fullmatch(r'assets/Definitions/english/[a-z]\.json', entry):
                    content = json.loads(inner.read(entry))
                    definitions[entry] = content
print('DEFINITION_FILES', len(definitions))
for entry, content in definitions.items():
    if entry.endswith('/j.json'):
        print('J_SHARD_TYPE', type(content).__name__)
        print('JIB_DEFINITION', json.dumps(content.get('JIB', content.get('jib')) if isinstance(content,dict) else [x for x in content if 'jib' in str(x).lower()], ensure_ascii=False)[:3000])

root = OUT.parents[1]
english = json.loads((root/'dist/source-levels/english.json').read_text(encoding='utf-8'))
print('BANK_KEYS', list(english))
for lid in ('191596', '191599'):
    print('LEVEL', lid, json.dumps(english['levels'][lid], ensure_ascii=False))
