"""Static inspection of the supplied APK; never install or execute APK code."""
import collections
import io
import json
from pathlib import Path
import re
import sys
import zipfile

source = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1]
output = root / 'reports' / 'apk-analysis'
output.mkdir(parents=True, exist_ok=True)
inventory = []
with zipfile.ZipFile(source) as xapk:
    manifest = json.loads(xapk.read('manifest.json'))
    print(json.dumps(manifest, ensure_ascii=True))
    for apkname in xapk.namelist():
        if not apkname.endswith('.apk'):
            continue
        with zipfile.ZipFile(io.BytesIO(xapk.read(apkname))) as apk:
            entries = [{'name': entry.filename, 'size': entry.file_size} for entry in apk.infolist()]
            counts = collections.Counter('/'.join(entry['name'].split('/')[:2]) for entry in entries)
            interesting = [entry for entry in entries if re.search(r'\.dex$|\.dll$|\.so$|metadata|dictionary|dictionaries|wordlist|word_list|extra|bonus', entry['name'], re.I)]
            nonlevels = [entry for entry in entries if entry['name'].startswith('assets/') and not entry['name'].startswith(('assets/Levels/', 'assets/LevelLists/'))]
            print(json.dumps({'apk': apkname, 'entries': len(entries), 'prefixes': counts.most_common(18), 'interesting': interesting, 'other_assets': nonlevels[:100]}, ensure_ascii=True))
            inventory.append({'apk': apkname, 'entries': entries})
            for entry in entries:
                name = entry['name']
                if name.endswith('.dex') or 'global-metadata.dat' in name or name.endswith('Assembly-CSharp.dll'):
                    destination = output / name.replace('/', '_')
                    destination.write_bytes(apk.read(name))
                    print('EXTRACTED ' + str(destination) + ' ' + str(entry['size']))
(output / 'inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding='utf-8')
