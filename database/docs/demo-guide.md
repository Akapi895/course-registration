# Hướng dẫn chạy demo database

Demo hiện thực hiện bằng PostgreSQL và `psql`; chưa có website để đăng nhập hay API đăng ký học phần. Các tài khoản demo được lưu sẵn để backend sử dụng sau này. Xem [tổng quan dữ liệu](overview.md) và [nguồn crawl](data-sources.md).

## 1. Chuẩn bị và khởi động

Mở Docker Desktop, chọn Linux containers, sau đó mở PowerShell:

```powershell
Set-Location D:\UET\KTPM\course-registration
# Chỉ tạo .env nếu chưa có, không ghi đè cấu hình đang dùng
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
Get-Content .env
docker compose build seed
docker compose up -d db
docker compose run --rm migrate
docker compose run --rm seed
docker compose run --rm verify
docker compose ps
```

Lần build đầu cần Internet để tải image/thư viện. Seed dùng catalog đã lưu, không cần crawl UET lại. Các service công cụ dùng chung image; khi sửa requirements hoặc Dockerfile, chạy lại `docker compose build seed`. Mã Python và dataset được bind mount nên lần chạy tiếp theo đọc trực tiếp thay đổi trong repo.

Kết quả mong đợi: service `db` có trạng thái `healthy`; verify in `PASS` và các số lượng: 102 users, 3 semesters, 126 courses, 83 course_prerequisites, 80 course_classes, 82 class_schedules, 103 registrations, 0 auth_sessions, 100 course_results. Seed lần hai báo `Identical demo already exists; no changes`.

`.env` local hiện đặt `POSTGRES_PORT=55432` vì Windows từ chối bind cổng 5432. File `.env.example` vẫn mặc định 5432; nếu tạo lại `.env` từ file mẫu trên máy này, đổi lại thành 55432 trước khi chạy `docker compose up -d db`. Cổng nội bộ giữa các container luôn là `db:5432`.

## 2. Kết nối database

Mở `psql` ngay trong container, không cần cài PostgreSQL lên Windows:

```powershell
docker compose exec db psql -U course_app -d course_registration
```

Nếu đã đổi `POSTGRES_USER`/`POSTGRES_DB`, thay hai giá trị tương ứng trong lệnh. Với DBeaver, DataGrip hoặc pgAdmin, dùng cấu hình mặc định:

| Thuộc tính | Giá trị |
|---|---|
| Host | `127.0.0.1` |
| Port | `5432`, hoặc giá trị `POSTGRES_PORT` trong `.env` |
| Database | `course_registration` |
| User | `course_app` |
| Password | `local_demo_only` |

Đây là tài khoản **database**. Tài khoản ứng dụng `student001` … `student100`, `admin1`, `admin2` có mật khẩu `DemoUET@123`, chưa dùng đăng nhập được khi chưa có backend.

## 3. Xem dữ liệu mẫu trong psql

Các khối SQL bên dưới chạy trong `psql`, không chạy trực tiếp trong PowerShell. Tắt phân trang để dễ xem, liệt kê đúng 9 bảng:

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

Xem lớp, lịch và sĩ số:

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

Xem đăng ký của `student001`. Bảng chỉ lưu đăng ký còn hiệu lực; không có bản ghi ở lớp 6:

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

Xem sĩ số lớp đầy (1), còn một chỗ (2), đã hủy (3) và lớp để đăng ký thành công (7):

```sql
SELECT id, class_code, status, enrolled, max_capacity
FROM course_classes WHERE id IN (1,2,3,7) ORDER BY id;
```

Xem kết quả học tập của `student001`, dùng để kiểm tra tiên quyết của các đăng ký hiện hành:

```sql
SELECT cr.course_id, c.code, c.name, cr.passed
FROM course_results cr
JOIN courses c ON c.id = cr.course_id
WHERE cr.student_id = 1
ORDER BY cr.course_id;
```

Danh sách đầy đủ 10 tình huống cùng tài khoản, mã lớp và kết quả mong đợi nằm trong [scenarios.json](../data/scenarios.json). Ví dụ `student001` đăng ký lớp 5 sẽ trùng lịch lớp 4; `student002` đăng ký lớp 14 sẽ vượt 12 tín chỉ. Backend sau này phải kiểm tra và trả lỗi nghiệp vụ; database hiện không tự từ chối mọi tình huống này.

## 4. Thử transaction đăng ký và rollback

Ví dụ này chỉ minh họa ghi đăng ký và tăng sĩ số nguyên tử trên **fixture chưa chỉnh sửa**. Các luật thời gian, lịch, tín chỉ và tiên quyết vẫn cần backend kiểm tra. Trong dữ liệu mẫu, `student001` có ID 1 và lớp đích có ID 7.

Chạy toàn bộ khối trong cùng phiên `psql`:

```sql
BEGIN;

-- Chỉ ghi đăng ký nếu tăng sĩ số thành công; toàn bộ câu lệnh là nguyên tử.
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
SELECT student_id, class_id, registered_at FROM registrations
WHERE student_id = 1 AND class_id = 7;

-- Hoàn tác để bộ demo giữ nguyên cho lần chạy tiếp theo.
ROLLBACK;
```

Sau rollback, không còn đăng ký student 1/lớp 7 và sĩ số quay lại giá trị ban đầu. Sequence ID có thể có khoảng trống sau rollback, đây là hành vi PostgreSQL bình thường. Nếu thao tác lỗi và psql báo transaction aborted, chạy `ROLLBACK;` trước khi tiếp tục.

Thoát psql bằng `\q`, rồi kiểm tra lại từ PowerShell:

```powershell
docker compose run --rm verify
```

## 5. Kiểm thử, dừng và chạy lại

```powershell
docker compose run --rm crawl test
docker compose run --rm seed
docker compose restart db
docker compose run --rm verify
docker compose stop db
# Lần sau mở lại
docker compose up -d db
```

Tests dùng nguồn đã lưu; verify kiểm tra schema, fixture, DAG tiên quyết, lịch/tín chỉ, sĩ số và các constraint bằng savepoint rollback. Volume giữ dữ liệu qua dừng/restart. Đổi user/password/database trong `.env` không tự thay đổi database đã khởi tạo trong volume.

## 6. Reset khi chủ động muốn bỏ thay đổi demo

Reset **xóa toàn bộ dữ liệu trong 9 bảng**, giữ schema. Không cần reset nếu chỉ chạy các truy vấn đọc và transaction rollback ở trên.

```powershell
docker compose run --rm seed reset --confirm-reset
docker compose run --rm seed
docker compose run --rm verify
```

Nếu seed báo database chứa dữ liệu khác, đây là cơ chế tránh ghi đè thay đổi của bạn. Chỉ reset nếu muốn bỏ những thay đổi đó. Muốn chuyển ngày demo, đặt `REFERENCE_DATE` trong `.env` trước khi seed database sạch; dữ liệu thời gian không tự chạy theo ngày hiện tại. Giới hạn 12 tín chỉ là cấu hình demo.

`registrations` chỉ gồm `id`, `student_id`, `class_id`, `registered_at`: hủy đăng ký xóa vật lý bản ghi, đăng ký lại tạo ID mới. Database có schema khác phải được dựng lại; `reset` ở trên chỉ xóa dữ liệu, không đổi schema. Với database demo local có thể bỏ toàn bộ dữ liệu: chạy `docker compose down -v`, sau đó thực hiện lại quy trình database mới tại [README gốc §2](../../README.md#2-khởi-chạy-lần-đầu-với-database-mới). Build lại image không đổi schema trong volume cũ.

Compose chỉ mở PostgreSQL trên loopback. Nếu tự cấu hình mật khẩu có ký tự đặc biệt, cần percent-encode thành phần mật khẩu trong URI `DATABASE_URL`; cấu hình mặc định hiện tại không gặp vấn đề này.
