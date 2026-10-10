"""Read user-provided XAPK data; no APK code is installed or executed."""
import collections
import gzip
import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile

source = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1]
destination = root / 'dist' / 'source-levels'
destination.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(source) as container:
    manifest = json.loads(container.read('manifest.json'))
    base_name = next(item['file'] for item in manifest['split_apks'] if item['id'] == 'base')
    with zipfile.ZipFile(io.BytesIO(container.read(base_name))) as apk:
        banks = {}
        for name in apk.namelist():
            parts = name.split('/')
            if len(parts) != 4 or parts[:2] != ['assets', 'Levels'] or not name.endswith('.level'):
                continue
            language = parts[2]
            bank = banks.setdefault(language, {'language': language, 'levels': {}, 'levelLists': {}, 'orders': {}})
            raw = apk.read(name)
            if raw[:2] == b'\x1f\x8b':
                raw = gzip.decompress(raw)
            level = json.loads(raw)
            bank['levels'][str(level['id'])] = level
        for name in apk.namelist():
            parts = name.split('/')
            if len(parts) != 4 or parts[:2] != ['assets', 'LevelLists'] or parts[2] not in banks:
                continue
            banks[parts[2]]['levelLists'][parts[3]] = apk.read(name).decode('utf-8-sig')
        index = {'schemaVersion': 1, 'algorithm': 1, 'packageName': manifest['package_name'],
                 'version': manifest['version_name'], 'sourceFile': source.name,
                 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'languages': []}
        for language, bank in sorted(banks.items()):
            main_ids = []
            for key in sorted(bank['levelLists']):
                if key.startswith('level_list_'):
                    main_ids.extend(int(item) for item in bank['levelLists'][key].split(',') if item.strip().isdigit())
            present = set(bank['levels'])
            bank['orders']['main'] = [value for value in main_ids if str(value) in present]
            bank['orders']['all'] = sorted(int(value) for value in present)
            bank['missingMainIds'] = sorted(set(value for value in main_ids if str(value) not in present))
            shapes = collections.Counter(f"{level['width']}x{level['height']}" for level in bank['levels'].values())
            item = {'language': language, 'file': f'{language}.json', 'count': len(present),
                    'mainCount': len(bank['orders']['main']), 'missingMainCount': len(bank['missingMainIds']),
                    'shapes': dict(shapes)}
            index['languages'].append(item)
            (destination / item['file']).write_text(json.dumps(bank, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        index['total'] = sum(item['count'] for item in index['languages'])
        (destination / 'catalogue.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(index, ensure_ascii=True, indent=2))
