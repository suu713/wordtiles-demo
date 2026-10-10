import math
import unittest
from build_lexicon import classify_zipf, collect_forms, build_entries

class ClassifierTests(unittest.TestCase):
    def test_thresholds(self):
        cases = {7.73:1, 5.0:1, 4.99:2, 4.0:2, 3.99:3, 3.0:3, 2.99:4, 2.0:4, 1.99:5, 1.0:5}
        for score, expected in cases.items():
            with self.subTest(score=score): self.assertEqual(classify_zipf(score), expected)
    def test_missing_is_unrated(self):
        self.assertEqual(classify_zipf(0), 0)
        self.assertEqual(classify_zipf(None), 0)
    def test_invalid_scores_rejected(self):
        for score in [-1, math.nan, math.inf, True, '5']:
            with self.subTest(score=score):
                with self.assertRaises(ValueError): classify_zipf(score)
    def test_no_length_cutoff(self):
        forms, _ = collect_forms('a\nI\ncat\nbreakfast\ncharacteristically\n')
        self.assertEqual(len(forms), 5)
        self.assertIn('CHARACTERISTICALLY', forms)
    def test_no_punctuation_stripping(self):
        forms, excluded = collect_forms("don't\nmother-in-law\ncafé\nhello world\nC3PO\n")
        self.assertFalse(forms)
        self.assertEqual(len(excluded), 5)
    def test_original_case_is_preserved(self):
        forms, _ = collect_forms('Mark\nmark\nmark\nNASA\n')
        self.assertEqual(forms['MARK'], {'Mark','mark'})
        self.assertEqual(forms['NASA'], {'NASA'})
    def test_unreviewed_never_production_approved(self):
        forms, _ = collect_forms('cat\nCAT\nNASA\n')
        entries = build_entries(forms, lambda w: 5.2)
        self.assertTrue(all(not e['targetEnabled'] for e in entries))
        self.assertTrue(all(e['reviewStatus']=='pending' for e in entries))
    def test_case_flag_not_claimed_proper_noun(self):
        forms, _ = collect_forms('I\nA\nNASA\ncat\n')
        entries = {e['word']:e for e in build_entries(forms, lambda w: 4.2)}
        self.assertFalse(entries['I']['caseReviewRequired'])
        self.assertFalse(entries['A']['caseReviewRequired'])
        self.assertFalse(entries['CAT']['caseReviewRequired'])
        self.assertTrue(entries['NASA']['caseReviewRequired'])
    def test_zero_serializes_to_null_score(self):
        forms, _ = collect_forms('test\n')
        entry = build_entries(forms, lambda w: 0)[0]
        self.assertIsNone(entry['zipf'])
        self.assertIsNone(entry['frequencyTier'])
    def test_sort_is_deterministic(self):
        a, _ = collect_forms('dog\nCAT\ncat\n')
        b, _ = collect_forms('cat\ndog\nCAT\n')
        self.assertEqual(build_entries(a, lambda w: 4), build_entries(b, lambda w: 4))

if __name__ == '__main__': unittest.main(verbosity=2)
