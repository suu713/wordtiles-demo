import collections
import importlib.util
import io
import json
from pathlib import Path
import re
import struct
import sys
import zipfile

root=Path(__file__).resolve().parents[1]
output=root/'reports'/'apk-analysis'
metadata=(output/'assets_bin_Data_Managed_Metadata_global-metadata.dat').read_bytes()
header=struct.unpack_from('<'+'I'*72,metadata)
print('HEADER '+str(header[:24]))
print('MODULES '+json.dumps({name:bool(importlib.util.find_spec(name)) for name in ['UnityPy','elftools','capstone','dnfile','androguard','lief']}))
string_offset,string_size=header[6:8]
strings=[]
cursor=string_offset
for item in metadata[string_offset:string_offset+string_size].split(b'\0'):
    value=item.decode('utf-8',errors='replace')
    if re.search(r'extra.?word|bonus.?word|valid.?word|word.?valid|word.?found|find.?word|word.?find|dictionary|word.?list|submit.?word|word.?submit|word.?check|check.?word|coin.*word|word.*coin',value,re.I):
        strings.append({'offset':cursor-string_offset,'value':value})
    cursor+=len(item)+1
print('METHOD_STRINGS '+json.dumps(strings,ensure_ascii=True))
(output/'word-method-strings.json').write_text(json.dumps(strings,ensure_ascii=False,indent=2),encoding='utf-8')
with zipfile.ZipFile(sys.argv[1]) as container:
    for name in container.namelist():
        if not name.endswith('.apk'): continue
        with zipfile.ZipFile(io.BytesIO(container.read(name))) as apk:
            for filename in apk.namelist():
                if filename.endswith('/libil2cpp.so') or filename.endswith('/data.unity3d'):
                    target=output/filename.replace('/','_')
                    target.write_bytes(apk.read(filename));print('EXTRACTED '+str(target))
            if 'assets/dic' in apk.namelist():
                raw=apk.read('assets/dic');print('DIC '+repr(raw[:500]))
                (output/'dic').write_bytes(raw)
            for filename in ['assets/Definitions/english/f.json','assets/builddatas.json','assets/bin/Data/ScriptingAssemblies.json']:
                if filename in apk.namelist():
                    raw=apk.read(filename);print(filename+' '+raw[:1500].decode('utf-8',errors='replace'))
                    (output/filename.replace('/','_')).write_bytes(raw)
