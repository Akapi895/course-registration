"""Exercise the Render image against a disposable PostgreSQL, without local volumes."""
import argparse
import json
import subprocess
import time
import urllib.error
import urllib.request
import uuid


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True, encoding='utf-8').strip()


def wait_for(check, label):
    for _ in range(45):
        try:
            if check():
                return
        except (OSError, subprocess.CalledProcessError):
            pass
        time.sleep(1)
    raise AssertionError(f'Timed out waiting for {label}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', default='course-registration-render-test')
    parser.add_argument('--browser', action='store_true', help='Also exercise the UI with Python Playwright/Chromium')
    args = parser.parse_args()
    prefix = 'render-smoke-' + uuid.uuid4().hex[:8]
    network, db, app = prefix, prefix + '-db', prefix + '-app'
    created = []
    try:
        docker('network', 'create', network)
        docker('run', '-d', '--name', db, '--network', network, '--network-alias', 'db',
               '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_USER=demo',
               '-e', 'POSTGRES_PASSWORD=demo_test_only', '-e', 'POSTGRES_DB=demo', 'postgres:16')
        created.append(db)
        wait_for(lambda: 'accepting connections' in docker('exec', db, 'pg_isready', '-U', 'demo', '-d', 'demo'), 'PostgreSQL')
        docker('run', '-d', '--name', app, '--network', network, '--memory', '512m',
               '-p', '127.0.0.1::12345', '-e', 'PORT=12345', '-e', 'GIN_MODE=release',
               '-e', 'DATABASE_URL=postgresql://demo:demo_test_only@db:5432/demo',
               '-e', 'JWT_SECRET=render_smoke_test_only_secret', args.image)
        created.append(app)
        port = docker('port', app, '12345/tcp').rsplit(':', 1)[1]
        base = 'http://127.0.0.1:' + port

        def request(path, method='GET', body=None, token=None):
            headers = {'Accept': 'application/json'}
            if token:
                headers['Authorization'] = 'Bearer ' + token
            if body is not None:
                headers['Content-Type'] = 'application/json'
            req = urllib.request.Request(base + path, method=method, headers=headers,
                                         data=None if body is None else json.dumps(body).encode())
            try:
                response = urllib.request.urlopen(req, timeout=3)
            except urllib.error.HTTPError as exc:
                response = exc
            with response:
                raw = response.read().decode()
                payload = json.loads(raw) if 'application/json' in response.headers.get('Content-Type', '') else raw
                return response.status, payload

        def ready():
            return request('/health')[0] == 200

        def login(username):
            code, result = request('/api/auth/login', 'POST', {'username': username, 'password': 'DemoUET@123'})
            assert code == 200, result
            return result['data']['access_token']

        def snapshot():
            return docker('exec', db, 'psql', '-U', 'demo', '-d', 'demo', '-At', '-c',
                          "SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM registrations), "
                          "(SELECT count(*) FROM auth_sessions), lecturer_name FROM course_classes WHERE id=7")

        wait_for(ready, 'application and initial seed')
        assert 'Demo initialized with reference date' in docker('logs', app)
        assert request('/')[0] == 200
        assert request('/favicon.svg')[0] == 200
        assert request('/swagger/doc.json')[0] == 200
        assert request('/api/unknown')[0] == 404
        assert request('/api/classes')[0] == 401
        print('PASS startup: automatic migration/seed, frontend, Swagger, API isolation and dynamic PORT')

        student = login('student001')
        code, catalog = request('/api/classes', token=student)
        assert code == 200 and catalog['data']['semester']['registration_open'] is True
        assert len(catalog['data']['classes']) == 75
        assert all('registration_open' not in c for c in catalog['data']['classes'])
        code, registration = request('/api/registrations', 'POST', {'class_ids': [7]}, student)
        assert code == 200 and registration['data']['registered_count'] == 1, registration
        registration_id = registration['data']['results'][0]['id']
        code, result = request(f'/api/registrations/{registration_id}', 'DELETE', token=student)
        assert code == 200 and result == {'status': 'success', 'data': {}}
        print('PASS student: login, current registration window, register and cancel')

        admin = login('admin1')
        code, result = request('/api/classes/7', token=admin)
        assert code == 200
        cls = result['data']
        code, result = request('/api/classes/7', 'PUT', {
            'class_code': cls['class_code'], 'lecturer_name': 'Render smoke retained',
            'max_capacity': cls['max_capacity'], 'schedules': cls['schedules'],
        }, admin)
        assert code == 200, result
        before = snapshot()
        docker('restart', app)
        # Docker can assign a different ephemeral host port on restart.
        base = 'http://127.0.0.1:' + docker('port', app, '12345/tcp').rsplit(':', 1)[1]
        wait_for(ready, 'restarted application')
        assert snapshot() == before, 'restart changed the existing database'
        assert 'Existing database retained; skipping demo seed' in docker('logs', app)
        code, result = request('/api/classes/7', token=admin)
        assert code == 200 and result['data']['lecturer_name'] == 'Render smoke retained'
        print('PASS restart: modified records and existing JWT sessions retained without re-seeding')

        assert request('/api/auth/logout', 'POST', token=student)[0] == 200
        assert request('/api/auth/me', token=student)[0] == 401
        print('PASS logout: revoked token rejected')
        if args.browser:
            from playwright.sync_api import expect, sync_playwright
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                errors = []
                page.on('pageerror', lambda err: errors.append(str(err)))
                page.goto(base + '/#/login')
                page.locator('#username').fill('admin1')
                page.locator('#password').fill('DemoUET@123')
                page.get_by_role('button', name='Đăng nhập', exact=True).click()
                expect(page.get_by_role('button', name='Tạo lớp học phần', exact=True)).to_be_visible()
                page.get_by_role('button', name='Tạo lớp học phần', exact=True).click()
                expect(page.locator('#cf-sem')).to_have_value('Demo - đang mở')
                expect(page.locator('#cf-sem')).to_have_attribute('readonly', '')
                page.evaluate("window.location.hash = '/admin/registration-period'")
                expect(page.locator('#rp-sem')).to_have_value('Demo - đang mở')
                assert not errors, errors
                browser.close()
            print('PASS browser: same-origin login, dashboard and automatic semester in both admin forms')
        print('PASS all Render image smoke checks (isolated disposable database)')
    finally:
        for name in reversed(created):
            subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['docker', 'network', 'rm', network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
