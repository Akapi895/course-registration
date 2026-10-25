"""Initialize an empty demo database once, preserve changes, then start the API."""
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'database' / 'tools'))

import psycopg
from psycopg import sql

from manage import TABLES, connect, dump, generate, migrate, seed, validate_fixture


def initialize():
    scenarios = None
    with connect() as conn:
        # migrate holds a transaction-level advisory lock, including on redeploys.
        # Keep the empty check and seed in the same transaction under that lock.
        migrate(conn)
        populated = {
            table: conn.execute(sql.SQL('SELECT EXISTS (SELECT 1 FROM {}) AS present')
                                .format(sql.Identifier(table))).fetchone()['present']
            for table in TABLES
        }
        if any(populated.values()):
            if not all(populated[t] for t in ('users', 'semesters', 'courses', 'course_classes', 'class_schedules')):
                raise ValueError('Database is partially populated; automatic seed will not overwrite it')
            print('Existing database retained; skipping demo seed')
        else:
            reference = os.getenv('REFERENCE_DATE') or datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date().isoformat()
            data, scenarios = generate(reference, int(os.getenv('RANDOM_SEED', '20261020')))
            validate_fixture(data)
            seed(conn, data)
            print(f'Demo initialized with reference date {reference}')
    if scenarios is not None:
        dump(Path(__file__).resolve().parents[1] / 'database' / 'data' / 'scenarios.json', scenarios)


def main():
    if not os.getenv('DATABASE_URL') or not os.getenv('JWT_SECRET'):
        raise ValueError('DATABASE_URL and JWT_SECRET are required')
    initialize()
    print('Starting API and frontend on the same port', flush=True)
    os.execv('/app/api', ['/app/api'])


if __name__ == '__main__':
    try:
        main()
    except (ValueError, AssertionError, psycopg.Error) as exc:
        print(f'Demo startup failed: {exc}', file=sys.stderr)
        raise SystemExit(1)
