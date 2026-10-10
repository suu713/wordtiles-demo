import json
import re
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('il2cpp_static',Path(__file__).with_name('analyze-il2cpp.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
Metadata,Native,OUT=module.Metadata,module.Native,module.OUT
meta=Metadata();native=Native();native.locate_modules(meta)
selected=[]
for typ in meta.types:
    if 3700<=typ['index']<=4700 and (re.search(r'Word|Dictionary|GameConfig|RemoteConfig|SaveService|ObjectiveService',typ['name']) or any(m['name']=='IsValidWord' for m in meta.methods[typ['methodStart']:typ['methodStart']+typ['methodCount']])):
        item={**typ,'fields':meta.fields(typ),'methods':meta.methods[typ['methodStart']:typ['methodStart']+typ['methodCount']]}
        selected.append(item)
        print(typ['index'],typ['namespace']+'.'+typ['name'],'FIELDS',','.join(f['name'] for f in item['fields']),'METHODS',','.join(m['name']+'@'+hex(m.get('address',0)) for m in item['methods']))
(OUT/'word-runtime-types.json').write_text(json.dumps(selected,ensure_ascii=False,indent=2),encoding='utf-8')
code=[]
for typ in selected:
    if re.search(r'WordValidation|WordCheck|ExtraWordService|ExtraWordsPopupController|RemoteConfig|ObjectiveService',typ['name']):
        for method in typ['methods']:
            if 'address' not in method:continue
            code.append('\n'+typ['name']+'.'+method['name']+' '+hex(method['address']))
            code.extend(native.disasm(method['address']))
(OUT/'native-word-services.txt').write_text('\n'.join(code),encoding='utf-8')
