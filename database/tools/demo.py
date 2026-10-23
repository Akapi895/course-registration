"""Deterministic synthetic fixtures. Academic catalog is supplied separately."""
import json
import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from crawl import ROOT, FACULTIES, MAJORS

TABLES = ['users', 'semesters', 'courses', 'course_prerequisites', 'course_classes',
          'class_schedules', 'registrations', 'auth_sessions', 'course_results']


def generate(reference_date, random_seed):
    rng = random.Random(random_seed)
    ref = datetime.fromisoformat(reference_date).replace(tzinfo=ZoneInfo('Asia/Ho_Chi_Minh'))
    catalog = json.loads((ROOT / 'data/catalog.json').read_text(encoding='utf-8'))
    password_hash = json.loads((ROOT / 'data/demo-password.json').read_text())['hash']
    data = {t: [] for t in TABLES}
    for i in range(1, 103):
        student = i <= 100
        faculty = 0 if i <= 50 else 1
        data['users'].append(dict(id=i, username=f'student{i:03}' if student else f'admin{i-100}',
            password_hash=password_hash, role='student' if student else 'admin',
            full_name=f'Sinh viên giả lập {i:03}' if student else f'Quản trị demo {i-100}',
            student_code=f'DEMO{i:05}' if student else None,
            faculty=FACULTIES[faculty] if student else None,
            major=MAJORS[faculty] if student else None, created_at=ref-timedelta(days=90)))
    for i, (name, opens, closes) in enumerate([('Demo - đã đóng', -90, -60),
            ('Demo - đang mở', -7, 30), ('Demo - chưa mở', 60, 90)], 1):
        data['semesters'].append(dict(id=i, name=name, registration_opens_at=ref+timedelta(days=opens),
            registration_closes_at=ref+timedelta(days=closes), max_credits=12))
    for i, course in enumerate(catalog['courses'], 1):
        data['courses'].append(dict(id=i, **course))
    by_code = {c['code']: c for c in data['courses']}
    for course, prerequisite in catalog['prerequisites']:
        data['course_prerequisites'].append(dict(course_id=by_code[course]['id'],
            prerequisite_course_id=by_code[prerequisite]['id']))
    pools = [[c for c in data['courses'] if c['faculty'] == f and c['credits'] == 3] for f in FACULTIES]
    assert all(len(pool) >= 10 for pool in pools), 'Not enough verified specialized courses'
    shared = [c for c in data['courses'] if c['faculty'] == 'Liên khoa']
    selected = [pools[0][i % len(pools[0])] for i in range(35)]
    selected += [pools[1][i % len(pools[1])] for i in range(35)]
    selected += [shared[i % len(shared)] for i in range(6)]
    selected += [pools[0][0], pools[1][0], pools[0][1], pools[1][1]]
    # An independent no-prerequisite course makes the successful demo unambiguous.
    requires = {edge['course_id'] for edge in data['course_prerequisites']}
    source_requires = {r['code'] for r in catalog['memberships'] if r['prerequisite_raw']}
    selected[6] = next(c for c in pools[0] if c['id'] not in requires and c['code'] not in source_requires)
    for i, course in enumerate(selected, 1):
        semester = 2 if i <= 76 else 1 if i <= 78 else 3
        data['course_classes'].append(dict(id=i, course_id=course['id'], semester_id=semester,
            class_code=f"{course['code']}-DEMO{i:02}", lecturer_name=f'Giảng viên giả lập {i:02}',
            max_capacity=2 if i in (1, 2) else 40, enrolled=0,
            status='cancelled' if i == 3 else 'active'))
        slot = 0 if i in (4, 5) else (i-1) % 24
        day, start = 2 + slot // 4, 1 + (slot % 4)*3
        data['class_schedules'].append(dict(id=len(data['class_schedules'])+1, class_id=i,
            day_of_week=day, start_period=start, end_period=start+2, room=f'DEMO-A2-{rng.randint(101,410)}'))
        if i in (30, 60):
            data['class_schedules'].append(dict(id=len(data['class_schedules'])+1, class_id=i,
                day_of_week=2+(day-1)%6, start_period=start, end_period=start+2, room=f'DEMO-LAB-{i}'))
    def register(student, class_id, status='registered'):
        cls = data['course_classes'][class_id-1]
        semester = data['semesters'][cls['semester_id']-1]
        at = semester['registration_opens_at'] + timedelta(days=1)
        data['registrations'].append(dict(id=len(data['registrations'])+1, student_id=student,
            class_id=class_id, status=status, registered_at=at))
        if status == 'registered':
            cls['enrolled'] += 1
    for student, cls in [(1,4),(3,1),(4,1),(5,2),(2,10),(2,11),(2,12),(2,13)]:
        register(student, cls)
    register(1,6,'cancelled')
    for student in range(6, 101):
        # One class/student, keeping room for all controlled edge cases.
        register(student, rng.choice(list(range(17,35)) if student <= 50 else list(range(36,69))))
    # Every prerequisite of a registered class is passed, so the fixture meets the rule the backend enforces.
    prerequisites_of = {}
    for edge in data['course_prerequisites']:
        prerequisites_of.setdefault(edge['course_id'], set()).add(edge['prerequisite_course_id'])
    # Prepare prerequisites for the re-registration and credit-limit scenarios.
    scenario_targets = {1: 6, 2: 14}
    for student in range(1, 101):
        passed = set()
        for r in data['registrations']:
            if r['student_id'] == student and r['status'] == 'registered':
                passed |= prerequisites_of.get(data['course_classes'][r['class_id']-1]['course_id'], set())
        if student in scenario_targets:
            cls = data['course_classes'][scenario_targets[student]-1]
            passed |= prerequisites_of.get(cls['course_id'], set())
        data['course_results'].extend(dict(student_id=student, course_id=c, passed=True) for c in sorted(passed))
        # Some students also have a failed course that is not a prerequisite of any registered class.
        if student % 5 == 0:
            failed = rng.choice([c['id'] for c in data['courses'] if c['id'] not in passed])
            data['course_results'].append(dict(student_id=student, course_id=failed, passed=False))
    def target(class_id):
        c = data['course_classes'][class_id-1]
        return dict(class_id=class_id, class_code=c['class_code'])
    scenarios = [dict(name=name, username=user, **target(cid), expected=expected) for name,user,cid,expected in [
        ('Đăng ký thành công','student001',7,'Đủ chỗ, không trùng lịch, tổng 6/12 tín chỉ'),
        ('Trùng lịch','student001',5,'Trùng buổi học lớp 4'),
        ('Đăng ký trùng','student001',4,'Đã có bản ghi registered'),
        ('Vượt tín chỉ','student002',14,'Từ 12 lên 15 tín chỉ'),
        ('Ngoài thời gian - đã đóng','student001',77,'Học kỳ đã đóng'),
        ('Ngoài thời gian - chưa mở','student001',79,'Học kỳ chưa mở'),
        ('Lớp đầy','student001',1,'Sĩ số 2/2'),
        ('Còn một chỗ','student001',2,'Sĩ số 1/2; kiểm tra thêm lịch trước khi đăng ký'),
        ('Đăng ký lại sau hủy','student001',6,'Tái sử dụng bản ghi cancelled'),
        ('Lớp đã hủy','student001',3,'Lớp cancelled')]]
    return data, dict(reference_date=reference_date, random_seed=random_seed,
        password='DemoUET@123', max_credits_note='12 là cấu hình demo, không phải quy định UET',
        scenarios=scenarios, prerequisite_check='Mọi tiên quyết của đăng ký hiện hành và hai tình huống vượt tín chỉ, đăng ký lại đã đạt; luật đăng ký mới do backend kiểm tra')
