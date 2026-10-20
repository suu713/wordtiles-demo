"""Read every packaged Zen level resource. Never run APK code or fetch remote levels."""
from pathlib import Path
from collections import defaultdict
import hashlib
import json
import re
import struct
import sys
import zipfile
import warnings

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'reports/apk-analysis/vendor'))
import UnityPy
UnityPy.config.FALLBACK_UNITY_VERSION = '6000.3.16f1'
warnings.filterwarnings('ignore', category=Warning, module='UnityPy')
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('C:/Users/huyi/Downloads/Zen Word - v2.44.0.apk')
DEST = ROOT / 'dist/zen-levels'
DEST.mkdir(exist_ok=True)
SHA = hashlib.file_digest(SOURCE.open('rb'), 'sha256').hexdigest()
assert SHA == '6d5678c333fbe74bad85f3d63de46cdcdb1360e480afccef64fbc6d303957770', 'Unexpected supplied APK'
LANG = {'en-us':'english','pt':'portuguese','ru':'russian','es':'spanish','tr':'turkish'}
KEY = b'iDailybread.org'

class Reader:
    def __init__(self, data): self.data, self.pos = data, 0
    def u8(self):
        value = self.data[self.pos]; self.pos += 1; return value
    def u32(self):
        value = struct.unpack_from('<I', self.data, self.pos)[0]; self.pos += 4; return value
    def string(self):
        size = shift = 0
        while True:
            b = self.u8(); size |= (b & 127) << shift
            if b < 128: break
            shift += 7
            assert shift < 35
        assert self.pos + size <= len(self.data)
        value = self.data[self.pos:self.pos + size].decode('utf-8'); self.pos += size; return value
    def words(self, count=None): return [self.string() for _ in range(self.u8() if count is None else count)]
    def finish(self): assert self.pos == len(self.data), (self.pos, len(self.data))

def main(data, cross=False):
    r = Reader(data); count, flags = r.u32(), r.u32()
    assert 0 < count < 100000 and flags in range(8), (count, flags)
    levels = []
    for _ in range(count):
        item = {'letter': r.string(), 'levelID': r.string()}
        for role in ['answer', 'extra', 'onlyExtra', 'bonus']: item[role] = r.words()
        if cross:
            item['rows'], item['columns'] = r.u8(), r.u8()
            item['placements'] = [{'row': r.u8(), 'column': r.u8(), 'direction': r.u8()} for _ in item['answer']]
        if flags & 1: item['time'] = r.u32()
        if flags & 2: item['timeOrder'] = r.words(r.u32())
        if flags & 4: item['DifficultyScore'] = r.u32()
        levels.append(item)
    r.finish(); return levels

def daily(data):
    r = Reader(data); count = r.u32(); assert 0 < count < 10000
    days = []
    for _ in range(count):
        item = {'letter': r.string(), 'day': r.u32(), 'groups': []}
        for _ in range(r.u8()):
            group = {'id': r.string()}
            for role in ['answer', 'extra', 'onlyExtra']: group[role] = r.words()
            item['groups'].append(group)
        days.append(item)
    r.finish(); return days

def bubble(data):
    r = Reader(data); count = r.u32(); assert 0 < count < 10000
    levels = []
    for _ in range(count):
        levels.append({'groups': [{'theme': r.string(), 'answer': r.words(4)} for _ in range(r.u8())]})
    r.finish(); return levels

def xor(raw, key): return bytes(b ^ key[i % len(key)] for i, b in enumerate(raw))
def decoded(raw, mode):
    candidates = [raw, xor(raw, KEY), xor(raw, b'VCW-Games.org')]
    errors = []
    for data in candidates:
        try:
            if data[:1] in (b'{', b'['): return json.loads(data.decode('utf-8'))
            if mode == 'daily': return daily(data)
            if mode == 'bubble': return bubble(data)
            if mode in ('main', 'cross'): return main(data, mode == 'cross')
        except Exception as error: errors.append(str(error))
    raise ValueError(str(errors)[:250])

def write(name, data):
    (DEST / name).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')

groups = {}; resources = []; roles = defaultdict(lambda: defaultdict(set)); groupwords = {}
with zipfile.ZipFile(SOURCE) as archive:
    names = [n for n in archive.namelist() if re.search(r'/local_config_(game_(play|cross|dailylevel|campaign|chain|quiz)_|bubble_)', n) and n.endswith('.ab')]
    for name in names:
        match = re.search(r'local_config_game_(play|cross|dailylevel|campaign|chain|quiz)_(.*?)_[0-9a-f]{32}\.ab$', name)
        mode = {'play':'main','dailylevel':'daily'}.get(match[1], match[1]) if match else 'bubble'
        variant = match[2] if match else 'english'
        iso = 'en-us' if 'en-us' in variant else variant.split('_')[0]
        language = LANG.get(iso, iso) if mode != 'bubble' else 'english'
        difficulty = int(re.search(r'difficulty(\d+)', variant)[1]) if 'difficulty' in variant else None
        key = f'{mode}-{variant}'
        label = f'活动 · Difficulty{difficulty}' if mode == 'campaign' else f'{mode} · {variant}'
        group = groups.setdefault(key, {'key':key,'label':label,'mode':mode,'language':language,'difficulty':difficulty,'levels':[],'resources':[]})
        group['resources'].append(name)
        for obj in UnityPy.load(archive.read(name)).objects:
            if obj.type.name != 'TextAsset': continue
            asset = obj.read(); raw = asset.m_Script.encode('utf-8', errors='surrogateescape')
            evidence = {'resource':name,'asset':asset.m_Name,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
            try:
                value = decoded(raw, mode)
                if isinstance(value, dict) and 'levels' in value: items = list(enumerate(value['levels'], 1))
                elif isinstance(value, list): items = list(enumerate(value, 1))
                elif isinstance(value, dict): items = list(value.items())
                else: raise ValueError('Unsupported level root')
                for original_key, entry in items:
                    original = entry
                    if isinstance(entry, dict) and isinstance(entry.get('B'), dict): entry = entry['B']
                    if mode == 'chain': targets = entry.get('answers', [])
                    elif entry.get('groups'): targets = list(dict.fromkeys(w for g in entry['groups'] for w in (g.get('answer') or [])))
                    else: targets = entry.get('answer') or []
                    assert targets and all(isinstance(w, str) and w for w in targets), 'No target words'
                    position = len(group['levels']) + 1
                    role_lists = {'answer':targets}
                    for role in ['extra','onlyExtra','bonus']:
                        role_lists[role] = (list(dict.fromkeys(w for g in entry['groups'] for w in (g.get(role) or []))) if entry.get('groups') else entry.get(role)) or []
                    for role, words in role_lists.items(): roles[language][role].update(words)
                    group['levels'].append({'kind':'zen','id':entry.get('levelID',f'{asset.m_Name}-{original_key}'),
                        'mode':mode,'letters':entry.get('letter',''),'targets':targets,'wordRoles':role_lists,
                        'source':{'packageName':'kidultlovin.word.zen','version':'2.44.0','sha256':SHA,'language':language,
                            'bank':key,'position':position,'difficulty':difficulty,'asset':asset.m_Name,'originalKey':str(original_key)},
                        'original':original})
                evidence.update(status='decoded', levels=len(items))
            except Exception as error:
                evidence.update(status='unparsed',error=str(error))
                # Preserve opaque resources for inspection; never pretend they were played.
                filename = re.sub(r'[^A-Za-z0-9_.-]','_',key+'-'+asset.m_Name)+'.bin'
                (DEST / filename).write_bytes(raw); evidence['file'] = filename
            resources.append(evidence)

catalogue = []
for key, group in groups.items():
    if not group['levels']: continue
    filename = key + '.json'; write(filename, group)
    words = sorted({w for level in group['levels'] for ws in level['wordRoles'].values() for w in ws})
    groupwords[key] = words
    catalogue.append({k:v for k,v in group.items() if k not in ['levels'] } | {'file':filename,'count':len(group['levels']),'wordCount':len(words)})
vocabulary = {'sourceSha256':SHA,'languages':{language: sorted(set().union(*mapping.values())) for language,mapping in roles.items()},
              'rolesByLanguage':{language:{role:sorted(words) for role,words in mapping.items()} for language,mapping in roles.items()}, 'groups':groupwords}
write('vocabulary.json',vocabulary)
english_groups = {g['key']: {'label':g['label'],'mode':g['mode'],'difficulty':g['difficulty'],
    'targets':sorted({w for level in groups[g['key']]['levels'] for w in level['wordRoles']['answer']}),
    'allWords':groupwords[g['key']]} for g in catalogue if g['language']=='english' and g['mode']!='bubble'}
write('english-dictionary.json', {'version':'zen-english-2.44.0-'+SHA[:12],'sourceSha256':SHA,'groups':english_groups})
manifest = {'schemaVersion':1,'packageName':'kidultlovin.word.zen','version':'2.44.0','sha256':SHA,
            'sourceFile':SOURCE.name,'scope':'All packaged level TextAssets; remote resources are not present in the supplied APK.',
            'groups':catalogue,'resources':resources,'total':sum(g['count'] for g in catalogue),
            'unparsed':[r for r in resources if r['status']!='decoded']}
write('catalogue.json',manifest)
print(json.dumps({'levels':manifest['total'],'groups':len(catalogue),'resources':len(resources),
                  'englishGroups':[(g['key'],g['count']) for g in catalogue if g['language']=='english'],
                  'unparsed':manifest['unparsed']},ensure_ascii=True))
