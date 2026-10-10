import collections
import io
import json
from pathlib import Path
import re
import sys
import zipfile
root=Path(__file__).resolve().parents[1]/'reports'/'apk-analysis'
sys.path.insert(0,str(root/'vendor'))
import UnityPy
with zipfile.ZipFile(sys.argv[1]) as container:
    with zipfile.ZipFile(io.BytesIO(container.read('com.agavegames.wordtiles.apk'))) as apk:
        for filename in ['assets/AssetResources/localizations.abundle']:
            (root/filename.replace('/','_')).write_bytes(apk.read(filename))
for filename in ['assets_bin_Data_data.unity3d','assets_AssetResources_localizations.abundle']:
    env=UnityPy.load(str(root/filename)); counts=collections.Counter(obj.type.name for obj in env.objects)
    print(filename,'COUNTS',dict(counts))
    descriptions=[]
    for obj in env.objects:
        if obj.type.name not in ('TextAsset','MonoScript','MonoBehaviour'):continue
        try:
            tree=obj.read_typetree()
            name=tree.get('m_Name','')
            script=tree.get('m_Script',{})
            if obj.type.name=='MonoScript':
                if re.search(r'Word|Dictionary|Config|Settings|Level',name,re.I):print('SCRIPT',obj.path_id,name,tree.get('m_ClassName'))
                continue
            if obj.type.name=='TextAsset':
                print('TEXTASSET',obj.path_id,name,str(script)[:250])
                (root/('text-'+re.sub(r'[^A-Za-z0-9_-]','_',name)+'.json')).write_text(json.dumps(tree,ensure_ascii=False),encoding='utf-8')
            if obj.type.name=='MonoBehaviour':
                text=json.dumps(tree,ensure_ascii=False,default=str)
                if re.search(r'ExtraWord|Extra Word|extra word|ExtraWordCollectLevels|DictionaryData|bonus word|BONUS_WORD',text,re.I):
                    descriptions.append({'pathId':obj.path_id,'tree':tree})
                    print('MONO_MATCH',obj.path_id,name,text[:1800])
        except Exception as error:
            if obj.type.name!='MonoBehaviour':print('ASSET_ERROR',obj.type.name,str(error))
    (root/(filename+'-matches.json')).write_text(json.dumps(descriptions,ensure_ascii=False,default=str,indent=2),encoding='utf-8')
