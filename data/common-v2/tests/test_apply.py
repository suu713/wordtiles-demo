import copy, importlib.util, json, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('applier',ROOT/'apply_whitelist.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
POLICY=json.loads((ROOT/'dictionary.json').read_text())
def fixture():
 return {'metadata':{'version':'source-v1','license':{'name':'retain me'},'embeddedNotices':{'copyright':'retain me'}},'entries':[
  {'word':'APPLE','zipf':4.73,'frequencyTier':2,'reviewStatus':'pending','targetEnabled':False},
  {'word':'RATED','zipf':4.2,'frequencyTier':2,'reviewStatus':'pending','targetEnabled':False},
  {'word':'NAT','zipf':4.0,'frequencyTier':2,'reviewStatus':'pending','targetEnabled':False},
  {'word':'ELDERBERRY','zipf':None,'frequencyTier':None,'reviewStatus':'pending','targetEnabled':False}]}
class ApplyTests(unittest.TestCase):
 def test_exact_intersection(self):
  a,r,report=m.apply_policy(fixture(),POLICY);self.assertEqual(r['words'],['APPLE']);self.assertEqual(report['disabledCount'],3)
 def test_unchanged_source(self):
  a=fixture();b=copy.deepcopy(a);m.apply_policy(a,POLICY);self.assertEqual(a,b)
 def test_frequency_preserved(self):
  a,_,_=m.apply_policy(fixture(),POLICY)
  for old,new in zip(fixture()['entries'],a['entries']):
   self.assertEqual(old['zipf'],new['zipf']);self.assertEqual(old['frequencyTier'],new['frequencyTier'])
 def test_notices_preserved(self):
  a,_,_=m.apply_policy(fixture(),POLICY);self.assertEqual(a['metadata']['license'],fixture()['metadata']['license']);self.assertEqual(a['metadata']['embeddedNotices'],fixture()['metadata']['embeddedNotices'])
 def test_existing_block_preserved(self):
  f=fixture();f['entries'][0]['reviewStatus']='blocked';_,r,_=m.apply_policy(f,POLICY);self.assertEqual(r['words'],[])
 def test_unknown_never_defaults_approved(self):
  a,_,_=m.apply_policy(fixture(),POLICY);self.assertTrue(all(not e['targetEnabled'] for e in a['entries'][1:]))
 def test_no_singularization(self):
  f=fixture();f['entries']=[{'word':'APPLES'}];a,r,_=m.apply_policy(f,POLICY);self.assertEqual(r['words'],[]);self.assertEqual(a['entries'][0]['word'],'APPLES')
 def test_no_punctuation_stripping(self):
  f=fixture();f['entries']=[{'word':"APPLE'S"}];_,r,_=m.apply_policy(f,POLICY);self.assertEqual(r['words'],[])
 def test_invalid_schema(self):
  with self.assertRaises(ValueError):m.apply_policy({'words':[]},POLICY)
 def test_duplicate_entry_rejected(self):
  f=fixture();f['entries']=[{'word':'APPLE'},{'word':'apple'}]
  with self.assertRaises(ValueError):m.apply_policy(f,POLICY)
 def test_missing_or_malformed_entry_rejected(self):
  f=fixture();f['entries']=[{}]
  with self.assertRaises(ValueError):m.apply_policy(f,POLICY)
 def test_deterministic(self):self.assertEqual(m.apply_policy(fixture(),POLICY),m.apply_policy(fixture(),POLICY))
 def test_content_change_changes_version(self):
  f=fixture();_,r,_=m.apply_policy(f,POLICY);f['entries'][0]['zipf']=4.74;_,r2,_=m.apply_policy(f,POLICY);self.assertNotEqual(r['version'],r2['version'])
if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(ApplyTests);res=unittest.TextTestRunner(verbosity=2).run(suite)
 (ROOT/'tests/apply-results.json').write_text(json.dumps({'tests':res.testsRun,'passed':res.testsRun-len(res.failures)-len(res.errors),'failed':len(res.failures)+len(res.errors),'scope':'synthetic schema fixtures, not the unavailable user local master'},indent=2)+'\n')
 raise SystemExit(0 if res.wasSuccessful() else 1)
