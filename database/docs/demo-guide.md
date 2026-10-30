# Hướng dẫn chạy demo database

Hướng dẫn xem và thử dữ liệu mẫu trong PostgreSQL bằng `psql`. Cách dựng cả hệ thống (database, backend, frontend) nằm ở [README gốc](../../README.md) mục 5. Dữ liệu mẫu được giải thích ở [overview.md](overview.md), nguồn crawl ở [data-sources.md](data-sources.md). Mọi lệnh chạy từ thư mục gốc repository.

## 1. Khởi động database

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose build seed
docker compose up -d --wait db
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm seed
docker compose --profile tools run --rm verify
```

Lần build đầu cần Internet. Seed dùng catalog đã lưu nên không crawl lại UET. Kết quả mong đợi: `db` ở trạng thái `healthy`, `verify` in `PASS` với số lượng 102 users, 3 semesters, 126 courses, 83 course_prerequisites, 80 course_classes, 82 class_schedules, 103 registrations, 0 auth_sessions, 100 course_results. Chạy seed lần hai báo `Identical demo already exists; no changes`.

`verify` đòi hỏi 0 phiên đăng nhập, nên chạy nó trước khi đăng nhập hoặc gọi API. Nếu cổng 5432 trên máy đã bị chiếm, đặt `POSTGRES_PORT` khác trong `.env` trước khi `up`; cổng giữa các container luôn là `db:5432`.

## 2. Kết nối database

Mở `psql` ngay trong container, không cần cài PostgreSQL lên máy:

```powershell
docker compose exec db psql -U course_app -d course_registration
```

Nếu đã đổi `POSTGRES_USER` hoặc `POSTGRES_DB` trong `.env`, thay hai giá trị này trong lệnh. Với DBeaver, DataGrip hoặc pgAdmin, dùng:

| Thuộc tính | Giá trị |
|---|---|
| Host | `127.0.0.1` (Compose chỉ mở PostgreSQL trên loopback) |
| Port | `5432`, hoặc giá trị `POSTGRES_PORT` trong `.env` |
| Database | `course_registration` |
| User | `course_app` |
| Password | `local_demo_only` |

Đây là tài khoản database, khác với tài khoản ứng dụng (`student001` … `student100`, `admin1`, `admin2`, mật khẩu `DemoUET@123`).

## 3. Xem dữ liệu mẫu

Các khối SQL dưới đây chạy trong `psql`, không chạy trong PowerShell. Tắt phân trang rồi liệt kê 9 bảng, số học phần theo khoa, sinh viên và học kỳ:

```sql
\pset pager off
\dt

SELECT faculty, COUNT(*) AS courses
FROM courses GROUP BY faculty ORDER BY faculty;

SELECT username, full_name, faculty, major
FROM users WHERE role = 'student' ORDER BY id LIMIT 10;

SELECT id, name, registration_opens_at, registration_closes_at, max_credits
FROM semesters ORDER BY id;
```

Lớp, lịch và sĩ số:

```sql
SELECT cc.id, cc.class_code, c.name, c.faculty, c.credits,
       cc.status, cc.enrolled, cc.max_capacity,
       cs.day_of_week, cs.start_period, cs.end_period, cs.room
FROM course_classes cc
JOIN courses c ON c.id = cc.course_id
JOIN class_schedules cs ON cs.class_id = cc.id
WHERE cc.semester_id = 2
ORDER BY cc.id, cs.id LIMIT 20;
```

Đăng ký của `student001`. Bảng chỉ lưu đăng ký còn hiệu lực nên không có bản ghi ở lớp 6:

```sql
SELECT r.id, u.username, cc.id AS class_id, cc.class_code,
       c.name, c.credits, r.registered_at
FROM registrations r
JOIN users u ON u.id = r.student_id
JOIN course_classes cc ON cc.id = r.class_id
JOIN courses c ON c.id = cc.course_id
WHERE u.username = 'student001'
ORDER BY r.id;
```

Sĩ số các lớp đầy (1), còn một chỗ (2), đã hủy (3) và lớp để đăng ký thành công (7):

```sql
SELECT id, class_code, status, enrolled, max_capacity
FROM course_classes WHERE id IN (1,2,3,7) ORDER BY id;
```

Kết quả học tập của `student001`, dùng để kiểm tra tiên quyết của các đăng ký hiện hành:

```sql
SELECT cr.course_id, c.code, c.name, cr.passed
FROM course_results cr
JOIN courses c ON c.id = cr.course_id
WHERE cr.student_id = 1
ORDER BY cr.course_id;
```

10 tình huống kiểm thử, kèm tài khoản, mã lớp và kết quả mong đợi, nằm trong [scenarios.json](../data/scenarios.json). Ví dụ `student001` đăng ký lớp 5 sẽ trùng lịch lớp 4, `student002` đăng ký lớp 14 sẽ vượt 12 tín chỉ. Các luật này do backend kiểm tra, database không tự từ chối.

## 4. Thử transaction đăng ký

Ví dụ dưới ghi đăng ký và tăng sĩ số trong một câu lệnh nguyên tử, trên fixture chưa chỉnh sửa (`student001` có ID 1, lớp đích có ID 7). Các luật về thời gian, lịch, tín chỉ và tiên quyết vẫn do backend kiểm tra. Chạy cả khối trong cùng phiên `psql`:

```sql
BEGIN;

WITH reserved AS (
    UPDATE course_classes
    SET enrolled = enrolled + 1
    WHERE id = 7 AND status = 'active' AND enrolled < max_capacity
    RETURNING id
)
INSERT INTO registrations (student_id, class_id)
SELECT 1, id FROM reserved
RETURNING id, student_id, class_id, registered_at;

SELECT id, enrolled, max_capacity FROM course_classes WHERE id = 7;

-- Hoàn tác để giữ nguyên bộ demo.
ROLLBACK;
```

Sau `ROLLBACK`, đăng ký và sĩ số trở về ban đầu (ID của sequence có thể bị nhảy số). Nếu `psql` báo transaction aborted, chạy `ROLLBACK;` trước khi làm tiếp. Thoát bằng `\q` rồi chạy lại `verify`.

## 5. Kiểm thử, dừng và reset

```powershell
docker compose --profile tools run --rm crawl test   # kiểm thử pipeline bằng nguồn đã lưu
docker compose stop db
docker compose up -d --wait db                       # lần sau mở lại
```

`verify` kiểm tra schema, fixture, DAG tiên quyết, lịch và tín chỉ, sĩ số và các constraint (dùng savepoint rồi rollback). Volume giữ dữ liệu qua dừng và restart. Đổi user, password hay tên database trong `.env` không đổi database đã khởi tạo trong volume.

Reset xóa dữ liệu của 9 bảng và giữ schema:

```powershell
docker compose --profile tools run --rm seed reset --confirm-reset
docker compose --profile tools run --rm seed
docker compose --profile tools run --rm verify
```

Nếu seed báo database chứa dữ liệu khác, đó là cơ chế tránh ghi đè thay đổi của bạn; chỉ reset khi muốn bỏ chúng. Muốn đổi ngày demo, đặt `REFERENCE_DATE` trong `.env` trước khi seed database sạch.

`reset` không đổi schema. Với volume có schema cũ, chạy `docker compose down -v` rồi làm lại từ mục 1; build lại image không đổi schema trong volume. Nếu mật khẩu database có ký tự đặc biệt, phải percent-encode nó trong `DATABASE_URL`; cấu hình mặc định không gặp vấn đề này.
