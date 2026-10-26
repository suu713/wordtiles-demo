"""Package the supplied WT 1.4.0 English levels without executing APK code."""
import gzip,hashlib,io,json,sys,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1])
with zipfile.ZipFile(source) as container:
    manifest=json.loads(container.read('manifest.json'))
    assert manifest['package_name']=='com.agavegames.wordtiles' and manifest['version_name']=='1.4.0'
    base=next(v['file'] for v in manifest['split_apks'] if v['id']=='base')
    with zipfile.ZipFile(io.BytesIO(container.read(base))) as apk:
        levels={};lists={}
        for name in apk.namelist():
            if name.startswith('assets/Levels/english/') and name.endswith('.level'):
                b=apk.read(name);b=gzip.decompress(b) if b[:2]==b'\x1f\x8b' else b
                raw=json.loads(b);levels[str(raw['id'])]=raw
            if name.startswith('assets/LevelLists/english/'):
                key=Path(name).name
                if key.startswith('level_list_') or key=='daily_puzzle_level_list':
                    lists[key]=apk.read(name).decode('utf-8-sig')
orders={k:[int(v) for v in s.split(',') if v.strip()] for k,s in sorted(lists.items())}
assert len(levels)==3459
assert all(str(i) in levels for order in orders.values() for i in order)
assert {k:len(v) for k,v in orders.items()}=={'daily_puzzle_level_list':366,'level_list_0':1500,'level_list_1':1500,'level_list_2':1000,'level_list_3':1000}
orders['all']=sorted(map(int,levels));orders['main']=orders['level_list_0'][:]
labels={'level_list_0':'主线表0','level_list_1':'主线表1','level_list_2':'主线表2','level_list_3':'主线表3','daily_puzzle_level_list':'每日谜题','all':'全部独立关卡'}
info=[{'key':k,'label':labels[k],'count':len(orders[k])} for k in labels]
bank={'schemaVersion':2,'language':'english','levels':levels,'levelLists':lists,'orders':orders,'lists':info}
payload=(json.dumps(bank,ensure_ascii=False,separators=(',',':'))+'\n').encode('utf8')
catalogue={'schemaVersion':2,'packageName':manifest['package_name'],'version':'1.4.0','sourceFile':source.name,
    'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'defaultOrder':'level_list_0','total':len(levels),
    'languages':[{'language':'english','file':'english.json','count':len(levels),'mainCount':1500,'lists':info,
        'sha256':hashlib.sha256(payload).hexdigest()}]}
dest=root/'dist/source-levels';dest.mkdir(exist_ok=True)
(dest/'english.json').write_bytes(payload)
(dest/'catalogue.json').write_text(json.dumps(catalogue,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(catalogue,ensure_ascii=False,indent=2))
