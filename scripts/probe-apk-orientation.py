"""Read APK grid coordinates without installing or executing Android code."""
import importlib.util
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
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
matched = []
for typ in meta.types:
    if not 3500 <= typ['index'] <= 4800 or not re.search(r'Grid|LevelData|Letter|Cell|Board|Coordinate', typ['name']):
        continue
    methods = meta.methods[typ['methodStart']:typ['methodStart']+typ['methodCount']]
    item = {**typ, 'fields':meta.fields(typ), 'methods':methods}
    matched.append(item)
    print('TYPE', typ['index'], typ['namespace']+'.'+typ['name'], 'FIELDS', ','.join(f['name'] for f in item['fields']))
    print('METHODS', ','.join(m['name']+'@'+hex(m.get('address',0)) for m in methods))
(apk.OUT/'grid-orientation-types.json').write_text(json.dumps(matched,ensure_ascii=False,indent=2),encoding='utf-8')
selected = {
    'GridManager': {'CreateGrid','CreateBoard','ApplyBoardLayoutPositions','GetGridTopY','GetGridPositionForAreaCenter','GetGridContentCenter'},
    'WordGrid': {'Initialize','Reset','GetCell','GetCellAt','GetWorldPosition','GetCellPosition'},
    'GridLayoutRuleset': {'GetRuleset','.ctor','GetContentHeight'},
    'LevelDataExtensions': {'TryGetLetterAt'},
}
lines = []
for typ in matched:
    for method in typ['methods']:
        if method['name'] not in selected.get(typ['name'],set()) or 'address' not in method:
            continue
        lines.append('\n'+typ['namespace']+'.'+typ['name']+'.'+method['name']+' '+hex(method['address']))
        lines.extend(native.disasm(method['address'],limit=2000))
(apk.OUT/'native-grid-orientation.txt').write_text('\n'.join(lines),encoding='utf-8')
helpers = []
for address in [0x1dd9b70, 0x1dd9b90, 0x1dd9c98, 0x1dd9a28]:
    helpers.append('\nHELPER '+hex(address))
    helpers.extend(native.disasm(address,limit=40))
(apk.OUT/'native-grid-coordinate-helpers.txt').write_text('\n'.join(helpers),encoding='utf-8')
constant_blocks = {
    'height_at_most_2': {'address':'0xf44ab0','values':struct.unpack_from('<4f',native.raw,native.offset(0xf44ab0))},
    'height_above_2': {'address':'0xf44ac0','values':struct.unpack_from('<4f',native.raw,native.offset(0xf44ac0))},
}
for block in constant_blocks.values():
    step_x,step_y,padding_x,padding_top=block['values']
    block.update(cellScale=step_y,stepX=step_x,stepY=step_y,paddingX=padding_x,paddingTop=padding_top)
    assert step_y > 0
xapk_path=Path(sys.argv[1]) if len(sys.argv)>1 else Path('C:/Users/huyi/Downloads/Word+Tiles+-+Relaxing+Puzzle_1.4.0_APKPure.xapk')
bank=json.loads((apk.ROOT/'dist/source-levels/english.json').read_text(encoding='utf-8'))
first=bank['levels'][str(bank['orders']['main'][0])]
with zipfile.ZipFile(xapk_path) as outer:
    manifest=json.loads(outer.read('manifest.json'))
    base=next(item['file'] for item in manifest['split_apks'] if item['id']=='base')
    with zipfile.ZipFile(io.BytesIO(outer.read(base))) as inner:
        for entry in inner.namelist():
            if not entry.startswith('assets/Levels/english/') or not entry.endswith('.level'):
                continue
            data=inner.read(entry)
            original=json.loads(gzip.decompress(data) if data[:2]==b'\x1f\x8b' else data)
            if original['id']==first['id']:
                assert original==first
                first_entry=entry
                break
        else:
            raise AssertionError('First original level not found in supplied XAPK')
report={
    'packageName':manifest['package_name'],'version':manifest['version_name'],
    'xapkSha256':hashlib.sha256(xapk_path.read_bytes()).hexdigest(),
    'nativeSha256':hashlib.sha256(native.raw).hexdigest(),
    'coordinateRule':{'storedRows':'bottom-to-top','lettersInEachRow':'left-to-right','localPosition':'(column * positiveStepX, row * positiveStepY, 0)'},
    'layoutConstants':constant_blocks,
    'evidence':[
        {'method':'Gameplay.GridManager.CreateGrid','address':'0xf6a010','detail':'Split letters on comma; take row sl and column sb directly, no height-1-row conversion; local y is row times stepY.'},
        {'method':'UnityEngine.Transform.set_localPosition','thunk':'0x1dd9b70','address':'0x315b364','detail':'CreateGrid places cells with this transform API.'},
        {'method':'Agave.LevelDataExtensions.TryGetLetterAt','address':'0xe84d38','detail':'Reads comma-separated rows[y][x] directly.'},
        {'method':'Gameplay.GridManager.GetGridTopY','address':'0xf7233c','detail':'Top Y = grid transform Y + (height - 1) * positiveStepY + half cell scale.'},
        {'method':'Gameplay.GridManager.ApplyBoardLayoutPositions','address':'0xf6b520','detail':'Centers grid by translating its parent, without reversing row indexes.'},
    ],
    'example':{'id':first['id'],'entry':first_entry,'storedLetters':first['letters'],'storedRows':first['letters'].split(','),'screenRowsTopToBottom':list(reversed(first['letters'].split(','))),'extractedJsonEqualsApk':True},
    'limitation':'Static evidence from supplied Word Tiles 1.4.0; no Android device or app was executed.'
}
(apk.ROOT/'reports/apk-grid-orientation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
print('CODE_SAVED',len(lines),'lines')
