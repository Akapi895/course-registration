"""CLI used identically by local Python and Docker Compose."""
import argparse
import hashlib
import json
import os
import sys
from datetime import timedelta

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from crawl import ROOT, crawl, dump
from demo import TABLES, academic_semester_name, generate, lecturer_name


def connect():
    return psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row)


def schema_fingerprint(conn):
    queries = [
        "SELECT table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
        "SELECT conrelid::regclass::text AS table_name,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2",
        "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2"]
    result = [conn.execute(q).fetchall() for q in queries]
    return hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()


def migrate(conn):
    migration = (ROOT / 'migrations/001_initial.sql').read_text(encoding='utf-8')
    digest = hashlib.sha256(migration.encode()).hexdigest()
    conn.execute('SELECT pg_advisory_xact_lock(20261020)')
    tables = conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'").fetchall()
    if not tables:
        conn.execute(migration)
        metadata = json.dumps(dict(migration=digest, schema=schema_fingerprint(conn)))
        conn.execute(sql.SQL('COMMENT ON TABLE users IS {}').format(sql.Literal(metadata)))
        print(f'Applied 001_initial.sql ({len(TABLES)} tables)')
    else:
        if {r['tablename'] for r in tables} != set(TABLES):
            raise ValueError('Database has unexpected tables; refusing migration')
        comment = conn.execute("SELECT obj_description('users'::regclass)").fetchone()['obj_description']
        metadata = json.loads(comment or '{}')
        if metadata != dict(migration=digest, schema=schema_fingerprint(conn)):
            raise ValueError('Existing schema differs from the migration; refusing to modify it')
        print('Migration already applied; schema verified')


COMPOSITE_KEYS = {
    'course_prerequisites': ('course_id', 'prerequisite_course_id'),
    'course_results': ('student_id', 'course_id'),
}


def row_key(table):
    return COMPOSITE_KEYS.get(table, ('id',))


def normalize_class_codes(conn):
    """Rename only legacy fixture class codes, without recreating registrations."""
    conn.execute('SELECT pg_advisory_xact_lock(20261020)')
    renamed = conn.execute(
        "UPDATE course_classes SET class_code = replace(class_code, '-DEMO', '-') "
        "WHERE class_code ~ '^[A-Z]{3}[0-9]{4}-DEMO[0-9]{2}$' RETURNING id"
    ).fetchall()
    print(f'Normalized {len(renamed)} legacy class codes')


def normalize_semester_names(conn):
    """Replace legacy fixture labels without changing registration windows."""
    conn.execute('SELECT pg_advisory_xact_lock(20261020)')
    legacy = {'Demo - đã đóng': (-1, -90), 'Demo - đang mở': (0, -7), 'Demo - chưa mở': (1, 60)}
    rows = conn.execute('SELECT id, name, registration_opens_at FROM semesters WHERE name = ANY(%s) FOR UPDATE',
                        (list(legacy),)).fetchall()
    for row in rows:
        relative, opens_offset = legacy[row['name']]
        reference = row['registration_opens_at'] - timedelta(days=opens_offset)
        name = academic_semester_name(reference, relative)
        conn.execute('UPDATE semesters SET name = %s WHERE id = %s', (name, row['id']))
    print(f'Normalized {len(rows)} legacy semester names')


def normalize_lecturer_names(conn):
    """Replace generated placeholders while preserving administrator edits."""
    conn.execute('SELECT pg_advisory_xact_lock(20261020)')
    rows = conn.execute(
        "SELECT id, course_id FROM course_classes "
        "WHERE lecturer_name ~ '^Giảng viên giả lập [0-9]{2}$' FOR UPDATE"
    ).fetchall()
    for row in rows:
        conn.execute('UPDATE course_classes SET lecturer_name = %s WHERE id = %s',
                     (lecturer_name(row['course_id']), row['id']))
    print(f'Normalized {len(rows)} legacy lecturer names')


def read_table(conn, table):
    order = ', '.join(row_key(table))
    return conn.execute(sql.SQL('SELECT * FROM {} ORDER BY ' + order).format(sql.Identifier(table))).fetchall()


def sorted_rows(table, rows):
    return sorted(rows, key=lambda r: tuple(r[k] for k in row_key(table)))


def seed(conn, data):
    conn.execute('SELECT pg_advisory_xact_lock(20261020)')
    for table in TABLES:
        conn.execute(sql.SQL('LOCK TABLE {} IN EXCLUSIVE MODE').format(sql.Identifier(table)))
    existing = {t: read_table(conn,t) for t in TABLES}
    if any(existing.values()):
        if all(existing[t] == sorted_rows(t,data[t]) for t in TABLES):
            print('Identical demo already exists; no changes')
            return
        raise ValueError('Database contains different data. Refusing seed; use a separate database or explicit reset.')
    for table in TABLES:
        for row in data[table]:
            columns = list(row)
            conn.execute(sql.SQL('INSERT INTO {} ({}) VALUES ({})').format(sql.Identifier(table),
                sql.SQL(',').join(map(sql.Identifier,columns)),
                sql.SQL(',').join(sql.Placeholder() for _ in columns)), list(row.values()))
        if data[table] and table not in COMPOSITE_KEYS:
            conn.execute("SELECT setval(pg_get_serial_sequence(%s,'id'), %s)",
                         (table,max(r['id'] for r in data[table])))
    print('Seed inserted atomically')


def validate_fixture(data):
    assert len(data['users']) == 102 and len(data['course_classes']) == 80
    courses = {r['id']:r for r in data['courses']}
    classes = {r['id']:r for r in data['course_classes']}
    users = {r['id']:r for r in data['users']}
    for faculty in ('Công nghệ thông tin','Điện tử - Viễn thông'):
        assert sum(courses[c['course_id']]['faculty']==faculty for c in classes.values()) >= 30
    graph = {}
    for edge in data['course_prerequisites']:
        graph.setdefault(edge['course_id'],[]).append(edge['prerequisite_course_id'])
    def visit(node, path):
        assert node not in path, f'Prerequisite cycle at {node}'
        for child in graph.get(node,[]):
            visit(child,path|{node})
    for node in graph:
        visit(node,set())
    results = {(r['student_id'],r['course_id']):r['passed'] for r in data['course_results']}
    for result in data['course_results']:
        assert users[result['student_id']]['role']=='student'
    registrations = data['registrations']
    for registration in registrations:
        for prerequisite in graph.get(classes[registration['class_id']]['course_id'],[]):
            assert results.get((registration['student_id'],prerequisite)) is True, 'Registered class lacks a passed prerequisite'
    semesters = {s['id']:s for s in data['semesters']}
    for registration in data['registrations']:
        cls = classes[registration['class_id']]
        semester = semesters[cls['semester_id']]
        assert users[registration['student_id']]['role']=='student'
        assert semester['registration_opens_at']<=registration['registered_at']<=semester['registration_closes_at']
        assert cls['status']=='active'
    schedules = {}
    for s in data['class_schedules']:
        schedules.setdefault(s['class_id'],[]).append(s)
    for cls in classes.values():
        assert cls['enrolled']==sum(r['class_id']==cls['id'] for r in registrations)
        assert cls['enrolled']<=cls['max_capacity']
    for student in users:
        for semester in data['semesters']:
            selected = [classes[r['class_id']] for r in registrations if r['student_id']==student and classes[r['class_id']]['semester_id']==semester['id']]
            assert not selected or users[student]['role']=='student'
            assert len({c['course_id'] for c in selected})==len(selected), 'Duplicate course for student'
            assert sum(courses[c['course_id']]['credits'] for c in selected)<=semester['max_credits']
            meetings = [s for c in selected for s in schedules[c['id']]]
            for i,a in enumerate(meetings):
                for b in meetings[i+1:]:
                    assert not (a['day_of_week']==b['day_of_week'] and a['start_period']<=b['end_period'] and b['start_period']<=a['end_period']), 'Overlapping registered schedules'


def verify(conn, expected):
    migrate(conn)
    actual = {t:read_table(conn,t) for t in TABLES}
    validate_fixture(actual)
    for t in TABLES:
        assert actual[t]==sorted_rows(t,expected[t]), f'{t}: data differs from reproducible fixture'
    # Constraint probes run in nested transactions (SAVEPOINT), always rolled back.
    probes = [
        ("UPDATE users SET student_code=NULL WHERE id=1", '23514'),
        ("UPDATE users SET username='student001' WHERE id=2", '23505'),
        ("UPDATE users SET role='teacher' WHERE id=1", '23514'),
        ("UPDATE users SET full_name=NULL WHERE id=1", '23502'),
        ("UPDATE users SET student_code='DEMO00001' WHERE id=101", '23514'),
        ("UPDATE semesters SET registration_closes_at=registration_opens_at WHERE id=1", '23514'),
        ("UPDATE courses SET credits=0 WHERE id=1", '23514'),
        ("INSERT INTO course_prerequisites VALUES (1,1)", '23514'),
        ("UPDATE course_classes SET course_id=-1 WHERE id=1", '23503'),
        ("UPDATE course_classes SET enrolled=max_capacity+1 WHERE id=1", '23514'),
        ("UPDATE course_classes SET max_capacity=0 WHERE id=1", '23514'),
        ("UPDATE course_classes SET status='invalid' WHERE id=1", '23514'),
        ("UPDATE class_schedules SET day_of_week=1 WHERE id=1", '23514'),
        ("UPDATE class_schedules SET end_period=0 WHERE id=1", '23514'),
        ("INSERT INTO registrations(student_id,class_id) VALUES (1,4)", '23505'),
        ("INSERT INTO auth_sessions(user_id,expires_at) VALUES (-1,now())", '23503'),
        ("INSERT INTO course_results(student_id,course_id,passed) SELECT student_id,course_id,true FROM course_results ORDER BY student_id,course_id LIMIT 1", '23505'),
        ("INSERT INTO course_results(student_id,course_id,passed) VALUES (1,1,NULL)", '23502'),
        ("INSERT INTO course_results(student_id,course_id,passed) VALUES (-1,1,true)", '23503'),
        ("INSERT INTO course_results(student_id,course_id,passed) VALUES (1,-1,true)", '23503'),
        ("DELETE FROM course_classes WHERE id=4", '23503')]
    for query, state in probes:
        try:
            with conn.transaction():
                conn.execute(query)
                raise AssertionError(f'Constraint unexpectedly allowed {query}')
        except psycopg.Error as exc:
            assert exc.sqlstate==state, (query,exc.sqlstate)
    class RollbackProbe(Exception):
        pass
    # Verify drift protection and ON DELETE CASCADE without retaining mutations.
    try:
        with conn.transaction():
            conn.execute("UPDATE users SET full_name='changed by test' WHERE id=1")
            try:
                seed(conn,expected)
            except ValueError:
                pass
            else:
                raise AssertionError('Seed accepted non-demo data')
            raise RollbackProbe()
    except RollbackProbe:
        pass
    try:
        with conn.transaction():
            conn.execute("INSERT INTO course_classes(id,course_id,semester_id,class_code,lecturer_name,max_capacity) VALUES (10001,1,2,'PROBE','PROBE',1)")
            conn.execute("INSERT INTO class_schedules(class_id,day_of_week,start_period,end_period,room) VALUES (10001,2,1,2,'PROBE')")
            conn.execute('DELETE FROM course_classes WHERE id=10001')
            assert conn.execute('SELECT count(*) AS n FROM class_schedules WHERE class_id=10001').fetchone()['n']==0
            session=conn.execute("INSERT INTO auth_sessions(user_id,expires_at) VALUES (1,now()+interval '1 hour') RETURNING id,created_at,logged_out_at").fetchone()
            assert session['id'] and session['created_at'] and session['logged_out_at'] is None
            raise RollbackProbe()
    except RollbackProbe:
        pass
    try:
        with conn.transaction():
            conn.execute('ALTER TABLE users ADD COLUMN drift_probe TEXT')
            try:
                migrate(conn)
            except ValueError:
                pass
            else:
                raise AssertionError('Migration accepted changed schema')
            raise RollbackProbe()
    except RollbackProbe:
        pass
    print(json.dumps({t:len(actual[t]) for t in TABLES},ensure_ascii=False))
    print('PASS: schema, exact fixture, counts, DAG, schedules, credits, capacity and constraint probes')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command',choices=['crawl','promote','migrate','seed','verify','generate','test','reset','normalize-class-codes','normalize-semester-names','normalize-lecturer-names','expire-sessions'])
    parser.add_argument('--refresh',action='store_true')
    parser.add_argument('--allow-expired-uet-tls',action='store_true')
    parser.add_argument('--confirm-reset',action='store_true')
    parser.add_argument('--confirm-expire-sessions',action='store_true')
    parser.add_argument('--reference-date',default=os.getenv('REFERENCE_DATE','2026-10-20'))
    parser.add_argument('--random-seed',type=int,default=int(os.getenv('RANDOM_SEED','20261020')))
    args = parser.parse_args()
    if args.command=='crawl':
        crawl(args.refresh,args.allow_expired_uet_tls)
        return
    if args.command=='promote':
        report = json.loads((ROOT/'data/crawl-report.json').read_text(encoding='utf-8'))
        if report['conflicts']:
            raise ValueError('Resolve conflicts before promotion')
        content = (ROOT/'data/candidate.json').read_bytes()
        if hashlib.sha256(content).hexdigest()!=report.get('candidate_sha256'):
            raise ValueError('Candidate does not match reviewed report; rerun crawl')
        candidate = json.loads((ROOT/'data/candidate.json').read_text(encoding='utf-8'))
        dump(ROOT/'data/catalog.json',candidate)
        print('Accepted reviewed candidate as catalog.json')
        return
    if args.command=='test':
        import unittest
        suite = unittest.defaultTestLoader.discover(str(ROOT/'tests'))
        if not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful():
            raise SystemExit(1)
        return
    if args.command=='reset':
        if not args.confirm_reset:
            raise ValueError(f'Reset deletes all {len(TABLES)} tables of demo data. Pass --confirm-reset explicitly.')
        with connect() as conn:
            migrate(conn)
            conn.execute(sql.SQL('TRUNCATE {} RESTART IDENTITY').format(sql.SQL(',').join(map(sql.Identifier,TABLES))))
        print('Demo data deleted; schema retained')
        return
    if args.command=='expire-sessions':
        if not args.confirm_expire_sessions:
            raise ValueError('This ends active sessions. Pass --confirm-expire-sessions explicitly.')
        with connect() as conn:
            migrate(conn)
            result = conn.execute(
                "UPDATE auth_sessions SET logged_out_at = now() "
                "WHERE logged_out_at IS NULL AND expires_at > now()"
            )
            print(f'Logged out {result.rowcount} active sessions; login cooldown starts at logged_out_at')
        return
    if args.command=='migrate':
        with connect() as conn:
            migrate(conn)
        return
    if args.command=='normalize-class-codes':
        with connect() as conn:
            migrate(conn)
            normalize_class_codes(conn)
        return
    if args.command=='normalize-semester-names':
        with connect() as conn:
            migrate(conn)
            normalize_semester_names(conn)
        return
    if args.command=='normalize-lecturer-names':
        with connect() as conn:
            migrate(conn)
            normalize_lecturer_names(conn)
        return
    data, scenarios = generate(args.reference_date,args.random_seed)
    validate_fixture(data)
    if args.command=='generate':
        dump(ROOT/'data/scenarios.json',scenarios)
        print('Fixture valid; scenarios.json generated')
        return
    with connect() as conn:
        if args.command=='seed':
            migrate(conn)
            seed(conn,data)
        else:
            verify(conn,data)
    if args.command=='seed':
        dump(ROOT/'data/scenarios.json',scenarios)


if __name__=='__main__':
    try:
        main()
    except (ValueError, AssertionError, psycopg.Error) as exc:
        print(f'ERROR: {exc}',file=sys.stderr)
        raise SystemExit(1)
