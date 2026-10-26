import copy
import json
import unittest

from crawl import ROOT, normalize, parse_html, parse_pdf, prerequisites
from demo import generate
from manage import validate_fixture


class ParserTests(unittest.TestCase):
    def test_html_multiline_and_prerequisite_columns(self):
        rows, _ = parse_html((ROOT/'sources/cntt-20.html').read_bytes(),20)
        courses = {r['code']:r for r in rows}
        self.assertEqual(courses['INT3110']['name'],'Phân tích và thiết kế hướng đối tượng')
        self.assertEqual(prerequisites(courses['INT3306']['prerequisite_raw']),['INT2204','INT2211'])
        self.assertNotIn('INT1008',courses)  # Appears only in prerequisite column.
        self.assertEqual(courses['MAT1101']['credits'],3)  # Unnumbered alternative.
        _, missing = parse_html((ROOT/'sources/cntt-23.html').read_bytes(),23)
        self.assertTrue(any('66' in issue['raw'] for issue in missing))

    def test_pdf_names_and_missing_codes(self):
        rows, issues = parse_pdf(ROOT/'sources/fet.pdf')
        course = next(r for r in rows if r['code']=='ELT3294')
        self.assertEqual(course['name'],'Cơ sở chế tạo, đóng gói linh kiện vi điện tử')
        self.assertEqual(len({r['code'] for r in rows}),74)
        self.assertEqual(len(issues),4)
        self.assertTrue(all(r['reason']=='missing_code' for r in issues))

    def test_no_inferred_complex_prerequisites(self):
        self.assertEqual(prerequisites('INT1008, INT2210'),['INT1008','INT2210'])
        self.assertIsNone(prerequisites('INT1008 hoặc INT2210'))
        self.assertIsNone(prerequisites('học trước INT1008'))

    def test_conflicts_and_shared_course(self):
        base = dict(source='fixture',page=1,name='Học phần',credits=3,block='A',kind='required',prerequisite_raw='')
        rows = [dict(base,program='cntt',code='INT1000'),dict(base,program='fet',code='INT1000')]
        data, conflicts = normalize(rows,[],{})
        self.assertFalse(conflicts)
        self.assertEqual(data['courses'][0]['faculty'],'Liên khoa')
        self.assertIsNone(data['courses'][0]['major'])
        rows[1]['credits']=4
        self.assertEqual(len(normalize(rows,[],{})[1]),1)


class FixtureTests(unittest.TestCase):
    def test_lecturer_names_are_consistent_across_classes_of_a_course(self):
        data, _ = generate('2026-10-20',20261020)
        teachers = {}
        for cls in data['course_classes']:
            name = cls['lecturer_name']
            self.assertGreaterEqual(len(name.split()), 3)
            self.assertNotIn('giả lập', name)
            self.assertFalse(any(c.isdigit() for c in name))
            previous = teachers.setdefault(cls['course_id'], name)
            self.assertEqual(name, previous)

    def test_academic_semester_names_across_year_boundaries(self):
        for reference, current in [('2026-10-20', 'Học kỳ 1 năm học 2026-2027'),
                                   ('2027-02-01', 'Học kỳ 2 năm học 2026-2027')]:
            data, _ = generate(reference,20261020)
            names = [s['name'] for s in data['semesters']]
            self.assertEqual(names[1], current)
            self.assertEqual(len(set(names)), 3)
            self.assertTrue(all(name.startswith('Học kỳ ') and 'Demo' not in name for name in names))

    def test_class_codes_are_readable_unique_and_match_scenarios(self):
        data, scenarios = generate('2026-10-20',20261020)
        courses = {c['id']: c['code'] for c in data['courses']}
        classes = {c['id']: c for c in data['course_classes']}
        keys = set()
        for cls in classes.values():
            self.assertRegex(cls['class_code'], r'^[A-Z]{3}[0-9]{4}-[0-9]{2}$')
            self.assertTrue(cls['class_code'].startswith(courses[cls['course_id']] + '-'))
            key = (cls['semester_id'], cls['class_code'])
            self.assertNotIn(key, keys)
            keys.add(key)
        for scenario in scenarios['scenarios']:
            self.assertEqual(scenario['class_code'], classes[scenario['class_id']]['class_code'])

    def test_reproducible_and_valid(self):
        first, scenarios = generate('2026-10-20',20261020)
        second, _ = generate('2026-10-20',20261020)
        self.assertEqual(first,second)
        validate_fixture(first)
        self.assertEqual(len(scenarios['scenarios']),10)
        catalog=json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8'))
        success_course_id=first['course_classes'][6]['course_id']
        success_code=next(c['code'] for c in first['courses'] if c['id']==success_course_id)
        self.assertTrue(all(not r['prerequisite_raw'] for r in catalog['memberships'] if r['code']==success_code))
        import bcrypt
        self.assertTrue(bcrypt.checkpw(b'DemoUET@123',first['users'][0]['password_hash'].encode()))

    def test_validator_rejects_drift(self):
        data, _ = generate('2026-10-20',20261020)
        wrong = copy.deepcopy(data)
        wrong['course_classes'][0]['enrolled']=0
        with self.assertRaises(AssertionError):
            validate_fixture(wrong)
        wrong=copy.deepcopy(data)
        wrong['course_prerequisites']=[dict(course_id=1,prerequisite_course_id=2),dict(course_id=2,prerequisite_course_id=1)]
        with self.assertRaises(AssertionError):
            validate_fixture(wrong)
        wrong=copy.deepcopy(data)
        wrong['course_results']=[r for r in data['course_results'] if not r['passed']]
        with self.assertRaises(AssertionError):
            validate_fixture(wrong)

    def test_catalog_provenance_and_coverage(self):
        catalog=json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8'))
        self.assertEqual(len(catalog['courses']),126)
        for p,n in [('cntt',66),('fet',74)]:
            self.assertEqual(len({r['code'] for r in catalog['memberships'] if r['program']==p}),n)
        self.assertTrue(all(r['name'] and r['credits']>0 for r in catalog['courses']))
        import hashlib
        for filename, meta in catalog['sources'].items():
            self.assertEqual(hashlib.sha256((ROOT/'sources'/filename).read_bytes()).hexdigest(),meta['sha256'])

    def test_generation_does_not_require_source_network(self):
        from unittest.mock import patch
        with patch('requests.sessions.Session.request',side_effect=AssertionError('Source network must not be used')):
            data, _ = generate('2026-10-20',20261020)
            validate_fixture(data)


if __name__=='__main__':
    unittest.main()
