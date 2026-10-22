"""Bounded source acquisition and parsers for the two selected UET documents."""
import hashlib
import json
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[1]
CODE = re.compile(r'[A-Z]{3}\s*\d{4}')
FACULTIES = ['Công nghệ thông tin', 'Điện tử - Viễn thông']
MAJORS = ['Công nghệ thông tin', 'Công nghệ kỹ thuật điện tử - viễn thông']
PDF_URL = 'https://fet.uet.vnu.edu.vn/wp-content/uploads/2024/03/2.-Khung-chuong-trinh-dai-hoc-he-chuan_Cong-nghe-ky-thuat-dien-tu-Vien-thong_2023.pdf'
HTML_URL = 'https://services.uet.vnu.edu.vn/books/CT_DT_CNTT/files/basic-html/page{}.html'


def clean(text):
    return ' '.join(unicodedata.normalize('NFC', text or '').split())


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def prerequisites(text):
    text = clean(text)
    codes = [re.sub(r'\s', '', m) for m in CODE.findall(text)]
    remainder = clean(CODE.sub('', text)).strip(', ')
    # Multiple plain codes in this column mean all are required. Never infer OR.
    return codes if not remainder else None


def parse_pdf(path):
    rows, issues = [], []
    block, kind = '', 'required'
    with pdfplumber.open(path) as pdf:
        for page_no, page in enumerate(pdf.pages, 1):
            if page_no < 7:
                continue
            for table in page.extract_tables():
                credit_idx = next(i for i, c in enumerate(table[0]) if c and 'Số tín' in c)
                for row_no, row in enumerate(table[2:], 3):
                    ordinal, raw_code = clean(row[0]), clean(row[1])
                    loc = {'source': 'fet.pdf', 'page': page_no, 'row': row_no}
                    if not ordinal.isdigit():
                        if raw_code:
                            block = raw_code
                            if 'lựa chọn' in block or 'bổ trợ' in block or 'Định hướng' in block:
                                kind = 'elective'
                            elif 'bắt buộc' in block or 'thực tập và tốt nghiệp' in block:
                                kind = 'required'
                            elif 'thay thế' in block:
                                kind = 'alternative'
                        continue
                    name_parts = '\n'.join(c for c in row[2:credit_idx] if c).splitlines()
                    # PDF italic text is the English translation. Use actual font metadata
                    # to retain Vietnamese names that wrap over several lines.
                    code_match = CODE.fullmatch(raw_code)
                    if not code_match:
                        issues.append(dict(loc, reason='missing_code', raw=row))
                        continue
                    code = re.sub(r'\s', '', raw_code)
                    credit = clean(row[credit_idx])
                    if not credit.isdigit() or int(credit) <= 0:
                        issues.append(dict(loc, reason='invalid_credits', raw=row))
                        continue
                    # Crop the name cell via table geometry; roman (non-italic) glyphs
                    # are the Vietnamese title, including ASCII-only titles such as IoT.
                    found_table = page.find_tables()[0]
                    cells = found_table.rows[row_no-1].cells
                    name_cells = [c for c in cells[2:credit_idx] if c]
                    chars = []
                    seen = set()
                    for box in name_cells:
                        for c in page.crop(box).chars:
                            key = (c['x0'], c['top'], c['text'])
                            if 'Italic' not in c['fontname'] and key not in seen:
                                chars.append(c)
                                seen.add(key)
                    from pdfplumber.utils import extract_text
                    name = clean(extract_text(chars)) if chars else clean(name_parts[0])
                    rows.append(dict(loc, ordinal=int(ordinal), code=code, name=name,
                                     credits=int(credit), block=block, kind=kind,
                                     prerequisite_raw=clean(row[-1]), program='fet'))
    return rows, issues


def parse_html(content, page_no):
    soup = BeautifulSoup(content, 'html.parser')
    pre = soup.find('pre')
    if not pre:
        raise ValueError(f'CNTT page {page_no}: missing preformatted curriculum')
    lines = pre.get_text().splitlines()
    rows, issues, names = [], [], []
    block, kind = '', 'required'
    name_start = 32
    after_row = False
    pending_prereq = []
    for line_no, line in enumerate(lines, 1):
        if line_no <= (8 if page_no == 19 else 4):
            continue
        # Fixed columns of the source's HTML book, not arbitrary whitespace splitting.
        match = re.match(r'^\s*(?:(\d+)\s+)?([A-Z]{3}\d{4})\b', line[:name_start])
        numbered = re.match(r'^\s*(\d+)(?:\s|$)', line[:name_start])
        name = clean(line[name_start:94])
        left_text = clean(line[:name_start])
        if not match and not numbered and left_text:
            block = clean(line[:94])
            kind = 'elective' if any(x in block.lower() for x in ('tự chọn','lựa chọn','định hướng')) else 'required'
            names = []
            pending_prereq = []
            after_row = False
            continue
        if match:
            ordinal, code = match.groups()
            credit = re.search(r'\s+(\d+)\b', line[max(match.end(), 64):74])
            loc = {'source': f'cntt-{page_no}.html', 'page': page_no, 'line': line_no}
            if not code or not credit:
                issues.append(dict(loc, reason='missing_code_or_credits', raw=line))
                names = []
                continue
            # Name may precede the numbered line, whose name cell starts English.
            credit_pos = max(match.end(), 64) + credit.start()
            inline_name = clean(line[match.end():credit_pos])
            if re.search(r'[À-ỹĐđ]', inline_name):
                names.append(inline_name)
            title = clean(' '.join(names))
            number = int(ordinal) if ordinal else 18
            if number <= 8:
                block, kind = 'Khối kiến thức chung', 'required'
            elif number <= 15:
                block, kind = 'Khối kiến thức theo lĩnh vực', 'required'
            elif number <= 18:
                block, kind = 'Khối kiến thức theo khối ngành', 'elective' if number == 18 else 'required'
            elif number <= 26:
                block, kind = 'Khối kiến thức theo nhóm ngành', 'required'
            elif number <= 32:
                block, kind = 'Khối kiến thức ngành bắt buộc', 'required'
            elif number <= 62:
                block, kind = 'Khối kiến thức ngành tự chọn', 'elective'
            elif number <= 68:
                block, kind = 'Khối kiến thức bổ trợ', 'required' if number == 63 else 'elective'
            else:
                block, kind = 'Khối kiến thức tốt nghiệp', 'alternative' if number == 71 else 'required'
            rows.append(dict(loc, ordinal=int(ordinal) if ordinal else None, code=code, name=title,
                             credits=int(credit.group(1)), block=block, kind=kind,
                             prerequisite_raw=clean(' '.join(pending_prereq + [line[94:]])), program='cntt'))
            names = []
            pending_prereq = []
            after_row = True
        elif numbered:
            issues.append(dict(source=f'cntt-{page_no}.html', page=page_no, line=line_no,
                               reason='missing_code_or_credits', raw=line))
            names = []
            pending_prereq = []
            after_row = False
        elif name:
            if any(x in name for x in ('Khối kiến', 'Bắt buộc', 'Tự chọn', 'Các học phần', 'Định hướng')):
                block = name
                if 'Tự chọn' in name or 'tự chọn' in name or 'lựa chọn' in name:
                    kind = 'elective'
                elif 'Bắt buộc' in name or 'bắt buộc' in name:
                    kind = 'required'
                names = []
            elif re.search(r'[À-ỹĐđ]', name) or (names and name[0].islower()):
                if after_row and name[0].islower() and rows and not names:
                    rows[-1]['name'] = clean(rows[-1]['name'] + ' ' + name)
                else:
                    names.append(name)
                    after_row = False
                if clean(line[94:]):
                    pending_prereq.append(clean(line[94:]))
            else:
                # English continuation belongs to the preceding numbered row.
                after_row = False
                if rows and clean(line[94:]):
                    rows[-1]['prerequisite_raw'] = clean(rows[-1]['prerequisite_raw'] + ' ' + line[94:])
        elif clean(line[94:]) and rows:
            rows[-1]['prerequisite_raw'] = clean(rows[-1]['prerequisite_raw'] + ' ' + line[94:])
    return rows, issues


def acquire(refresh=False, allow_expired_tls=False):
    folder = ROOT / 'sources'
    folder.mkdir(exist_ok=True)
    manifest_path = folder / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    session = requests.Session()
    retry = Retry(total=2, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
    session.mount('https://', HTTPAdapter(max_retries=retry))
    sources = [('fet.pdf', PDF_URL)] + [(f'cntt-{n}.html', HTML_URL.format(n)) for n in range(19, 25)]
    for filename, url in sources:
        path = folder / filename
        cached = manifest.get(filename)
        if not refresh and path.exists() and cached:
            if hashlib.sha256(path.read_bytes()).hexdigest() != cached['sha256']:
                raise ValueError(f'Cache checksum mismatch: {filename}')
            continue
        insecure = allow_expired_tls and url.startswith('https://services.uet.vnu.edu.vn/')
        response = session.get(url, timeout=(10, 60), verify=not insecure)
        response.raise_for_status()
        path.write_bytes(response.content)
        manifest[filename] = dict(url=url, fetched_at=datetime.now(timezone.utc).isoformat(),
                                  sha256=hashlib.sha256(response.content).hexdigest(),
                                  tls_verified=not insecure)
        dump(manifest_path, manifest)
        time.sleep(1)
    return manifest


def normalize(rows, issues, corrections):
    catalog, memberships = {}, []
    unresolved = []
    for row in rows:
        row = dict(row)
        key = f"{row['program']}:{row['code']}"
        fix = corrections.get(key, {})
        for field in ('name', 'credits', 'prerequisite_raw', 'block', 'kind'):
            if field in fix:
                row[field] = fix[field]
        row['name'] = clean(row['name'])
        memberships.append(row)
        course = catalog.get(row['code'])
        if course and (course['name'], course['credits']) != (row['name'], row['credits']):
            unresolved.append(dict(code=row['code'], existing=course, incoming=row))
        elif not course:
            catalog[row['code']] = {k: row[k] for k in ('code', 'name', 'credits')}
    edges = set()
    prerequisite_variants = {}
    for row in memberships:
        parsed = prerequisites(row['prerequisite_raw'])
        prerequisite_variants.setdefault(row['code'], set()).add(tuple(sorted(parsed)) if parsed is not None else None)
    for row in memberships:
        if len(prerequisite_variants[row['code']]) > 1:
            issues.append(dict(row, reason='prerequisites_vary_between_programs'))
            continue
        codes = prerequisites(row['prerequisite_raw'])
        if codes is None:
            issues.append(dict(row, reason='complex_prerequisite'))
            continue
        for code in codes:
            if code not in catalog:
                issues.append(dict(row, reason='missing_prerequisite_target', target=code))
            else:
                edges.add((row['code'], code))
    empty_names = [r for r in memberships if not r['name']]
    if empty_names:
        unresolved.extend(dict(reason='empty_name', incoming=r) for r in empty_names)
    for code, course in catalog.items():
        programs = {r['program'] for r in memberships if r['code'] == code}
        idx = 0 if programs == {'cntt'} else 1
        # A prefix does not establish the owning faculty for general education.
        specialized = code.startswith('INT') if idx == 0 else code.startswith(('ELT', 'AIT'))
        shared = len(programs) > 1 or not specialized
        course.update(faculty='Liên khoa' if shared else FACULTIES[idx],
                      major=None if shared else MAJORS[idx])
    return dict(courses=sorted(catalog.values(), key=lambda c: c['code']),
                memberships=memberships, prerequisites=[list(e) for e in sorted(edges)]), unresolved


def crawl(refresh=False, allow_expired_tls=False):
    manifest = acquire(refresh, allow_expired_tls)
    rows, issues = parse_pdf(ROOT / 'sources/fet.pdf')
    for page in range(19, 25):
        parsed, problems = parse_html((ROOT / f'sources/cntt-{page}.html').read_bytes(), page)
        rows.extend(parsed)
        issues.extend(problems)
    corrections_path = ROOT / 'data/corrections.json'
    corrections = json.loads(corrections_path.read_text(encoding='utf-8')) if corrections_path.exists() else {}
    dataset, conflicts = normalize(rows, issues, corrections)
    dataset['programs'] = [dict(id='cntt', faculty=FACULTIES[0], major=MAJORS[0], version='Khung công khai trong sách UET; chưa xác minh khóa áp dụng'),
                           dict(id='fet', faculty=FACULTIES[1], major=MAJORS[1], version='Điều chỉnh 2023, áp dụng từ khóa 2022')]
    dataset['sources'] = manifest
    report = dict(course_count=len(dataset['courses']), membership_count=len(rows),
                  by_program={p: len({r['code'] for r in rows if r['program'] == p}) for p in ('cntt','fet')},
                  issues=issues, conflicts=conflicts)
    report['candidate_sha256'] = hashlib.sha256(json.dumps(dataset,ensure_ascii=False,indent=2).encode()+b'\n').hexdigest()
    dump(ROOT / 'data/crawl-report.json', report)
    dump(ROOT / 'data/candidate.json', dataset)
    if conflicts:
        raise ValueError(f'{len(conflicts)} conflicts; review crawl-report.json and corrections.json before promotion')
    print(json.dumps({k:v for k,v in report.items() if k not in ('issues','conflicts')}, ensure_ascii=False))
    print('Candidate ready. Review report, then run promote to accept the snapshot.')
