"""Build a reproducible English familiarity table, separate from answer policy."""
from pathlib import Path
import hashlib
import json
import sys
from importlib.metadata import version

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.openai/tmp/playtest/python'))
from wordfreq import zipf_frequency

web_path = ROOT / 'dist/web-word-bank.json'
web = json.loads(web_path.read_text(encoding='utf-8'))
assert web['source']['kind'] == 'package-union', 'Build the current package union first'
words = {entry['word'] for entry in web['entries']}
records = {w: zipf_frequency(w.lower(), 'en', wordlist='best') for w in sorted(words)}
digest = hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest()
output = {'version': 'english-wordfreq-3.1.1-' + digest[:12], 'language': 'english',
          'source': {'name': 'wordfreq', 'version': version('wordfreq'), 'url': 'https://github.com/rspeer/wordfreq',
                     'dataLicense': 'CC BY-SA 4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
                     'meaning': 'Corpus Zipf frequency; not a measured probability of knowing a word. Zero means not observed, not impossible.'},
          'sha256': digest, 'zipf': records}
(ROOT / 'dist/playtest').mkdir(exist_ok=True)
(ROOT / 'dist/playtest/english-frequency.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(json.dumps({'words': len(records), 'version': output['version'], 'zero': sum(v == 0 for v in records.values())}))
