# Thiết kế cơ sở dữ liệu (MVP)

- Nguồn: `docs/srs.md`, ADR-02 (PostgreSQL)
- Trạng thái: đề xuất — chờ chốt vài câu hỏi mở ở cuối tài liệu

## Ba nguyên tắc của thiết kế này

1. **Mỗi bảng tồn tại vì một yêu cầu cụ thể trong SRS.** Không có bảng "dự phòng cho tương lai". Khi SRS không yêu cầu, không thiết kế.
2. **Ràng buộc xuống database khi nó bảo vệ tính nhất quán dữ liệu; xuống tầng service khi nó phụ thuộc thời điểm hiện tại hoặc dữ liệu ngoài giao dịch.** Lớp đầy là điều kiện nguyên tử → database. "Đã hết hạn đăng ký" phụ thuộc thời điểm gọi API → service.
3. **Chuẩn hóa vừa đủ.** Lookup table chỉ tạo khi có ràng buộc thật cần giữ (khóa ngoại). Khoa, ngành chỉ là dữ liệu lọc và hiển thị → cột text.

## Phân định trước khi tạo bảng

Bốn phân định này quyết định hình dạng schema, đã ghi trong `GLOSSARY.md`:

- **Học phần ≠ Lớp học phần.** SRS viết số tín chỉ và tiên quyết cạnh "lớp học phần", nhưng tín chỉ thuộc về học phần (không đổi theo lớp) và tiên quyết kiểm theo học phần. Schema tách hai thực thể: `courses` giữ tín chỉ + tiên quyết, `course_classes` là lớp cụ thể trong một kỳ với sĩ số riêng.
- **Tài khoản ≠ Sinh viên.** Admin cũng đăng nhập nhưng không có hồ sơ sinh viên. Tách `users` và `students` qua quan hệ một-một.
- **Thời khóa biểu là khung nhìn.** Tính lúc truy vấn từ đăng ký + lịch học, không lưu bảng.
- **Hủy đăng ký = xóa bản ghi.** SRS không yêu cầu lưu lịch sử hủy cho MVP. Xóa hẳn giữ schema gọn và UNIQUE constraint hoạt động đúng (hủy xong đăng ký lại được).

## Sơ đồ quan hệ

```
users 1──1 students
semesters 1──n course_classes
courses 1──n course_classes
courses n──n courses          (course_prerequisites, tự tham chiếu)
course_classes 1──n class_schedules
courses 1──n course_results   (cùng students: n──n qua course_results)
students 1──n registrations
course_classes 1──n registrations
```

## Danh sách bảng

### 1. `semesters` — học kỳ, đồng thời là cấu hình đợt đăng ký

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigserial PK | |
| name | text NOT NULL UNIQUE | ví dụ "HK1 2026-2027" |
| registration_opens_at | timestamptz NOT NULL | quy tắc 2 |
| registration_closes_at | timestamptz NOT NULL | CHECK: closes > opens |
| max_credits | int NOT NULL CHECK (> 0) | quy tắc 5 |
| min_credits | int NOT NULL CHECK (>= 0) | quy tắc 6 |

Một bảng giữ trọn bộ cấu hình theo kỳ của SRS (mục 3.3, quy tắc 2/5/6) — không cần bảng `settings` riêng.

### 2. `users` — tài khoản đăng nhập

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigserial PK | |
| username | text NOT NULL UNIQUE | |
| password_hash | text NOT NULL | bcrypt/argon2, NFR mục 6.5 |
| role | text NOT NULL CHECK (IN 'student', 'admin') | không bảng roles — chỉ hai vai trò |
| created_at | timestamptz NOT NULL DEFAULT now() | |

### 3. `students` — hồ sơ sinh viên

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigserial PK | |
| user_id | bigint NOT NULL UNIQUE → users.id ON DELETE CASCADE | quan hệ 1-1 |
| student_code | text NOT NULL UNIQUE | |
| full_name | text NOT NULL | |
| faculty | text NOT NULL | lọc + hiển thị |
| major | text NOT NULL | lọc + hiển thị |

Cập nhật thông tin (SRS 3.4) chỉ đụng các cột profile; username, password, role không nằm trong bảng này.

### 4. `courses` — học phần

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigserial PK | |
| code | text NOT NULL UNIQUE | "INT2211"... |
| name | text NOT NULL | |
| credits | int NOT NULL CHECK (BETWEEN 1 AND 20) | |
| faculty | text NOT NULL | dùng cho filter SRS 3.2 |

SRS 3.5 chỉ quản trị lớp học phần, không quản trị học phần — học phần nạp bằng seed/migration.

### 5. `course_prerequisites` — tiên quyết, tự tham chiếu

| Cột | Kiểu | Ghi chú |
|---|---|---|
| course_id | bigint → courses.id | PK composite |
| prerequisite_course_id | bigint → courses.id | PK composite, CHECK: khác course_id |

Cặp khóa là PK — database tự chặn khai báo trùng tiên quyết.

### 6. `course_classes` — lớp học phần

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigserial PK | |
| course_id | bigint NOT NULL → courses.id | |
| semester_id | bigint NOT NULL → semesters.id | |
| class_code | text NOT NULL UNIQUE | "INT2211-01" |
| lecturer_name | text NOT NULL | |
| room | text | cho phép trống khi chưa xếp phòng |
| max_capacity | int NOT NULL CHECK (> 0) | |
| enrolled | int NOT NULL DEFAULT 0 CHECK (BETWEEN 0 AND max_capacity) | bộ đếm của cơ chế ADR-02 |

`CHECK (BETWEEN 0 AND max_capacity)` là lưới an toàn cuối: dù code sai, database vẫn không cho phép nhận vượt số chỗ. UNIQUE(class_code) chặn trùng mã lớp giữa các kỳ.

### 7. `class_schedules` — lịch học theo tuần

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigserial PK | |
| class_id | bigint NOT NULL → course_classes.id ON DELETE CASCADE | xóa lớp thì xóa lịch |
| day_of_week | smallint NOT NULL CHECK (BETWEEN 1 AND 7) | 1 = thứ Hai |
| start_period | smallint NOT NULL CHECK (BETWEEN 1 AND 12) | |
| end_period | smallint NOT NULL CHECK (end > start) | |

Lưu theo "khoảng tiết" (đặc thù đại học Việt Nam) thay vì timestamp — kiểm tra trùng lịch thành phép so giao nhau trên (day, start, end), không cần xử lý múi giờ.

### 8. `course_results` — kết quả học phần của sinh viên

| Cột | Kiểu | Ghi chú |
|---|---|---|
| student_id | bigint → students.id | PK composite |
| course_id | bigint → courses.id | PK composite |
| passed | boolean NOT NULL | MVP chỉ cần đạt/chưa đạt |

Nguồn dữ liệu duy nhất để kiểm tra quy tắc 4 (tiên quyết). Nạp bằng seed; SRS không yêu cầu nhập điểm trong phạm vi MVP.

### 9. `registrations` — đăng ký

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigserial PK | id này là `{id}` trong DELETE /api/registrations/{id} |
| student_id | bigint NOT NULL → students.id | |
| class_id | bigint NOT NULL → course_classes.id | ON DELETE RESTRICT — xóa lớp có người đăng ký phải bị chặn |
| created_at | timestamptz NOT NULL DEFAULT now() | |

`UNIQUE(student_id, class_id)` làm hai việc: chặn double-submit khi bấm đăng ký nhiều lần, và đồng bộ với nghiệp vụ hủy (xóa bản ghi thì chỗ được trả, đăng ký lại được).

Index: `registrations(student_id)` (query đăng ký của sinh viên), `registrations(class_id)` (đếm theo lớp), `course_classes(semester_id)` (danh sách lớp đang mở).

## Phân công kiểm tra quy tắc

| Quy tắc SRS | Xử lý ở đâu | Cách làm |
|---|---|---|
| 1. Giới hạn sĩ số | Database | `UPDATE ... SET enrolled = enrolled + 1 WHERE id = $1 AND enrolled < max_capacity` (ADR-02) + CHECK |
| 2. Thời gian đăng ký | Service | So `now()` với `registration_opens_at/closes_at` của học kỳ |
| 3. Không trùng lịch | Service | Query giao nhau trên `class_schedules` giữa lớp mới và các lớp đã đăng ký trong cùng học kỳ |
| 4. Tiên quyết | Service | Join `course_prerequisites` với `course_results` |
| 5/6. Giới hạn tín chỉ | Service | SUM tín chỉ đăng ký trong kỳ + tín chỉ lớp muốn đăng ký, so với `max/min_credits` |
| 7. Quyền sở hữu | Middleware + Service | Token cho student_id; mọi query đăng ký đều WHERE theo student_id từ token |
| 8. Dữ liệu lớp hợp lệ | Validation + Database | Validate ở service, NOT NULL/CHECK/FK làm lưới cuối |
| Đăng ký trùng lớp | Database | UNIQUE(student_id, class_id) |
| Nghiệm thu số 6 (1 chỗ, N request) | Database | Cơ chế UPDATE có điều kiện + transaction (ADR-02) |

## Cố tình không làm

Ghi ra đây để ai đọc code sau này không "bổ sung về sau" rồi làm phình hệ thống:

- **Không bảng roles/permissions.** Cột `role` + middleware là đủ với hai vai trò.
- **Không lookup table cho khoa/ngành.** Text, vì SRS chỉ cần lọc và hiển thị.
- **Không soft delete, không audit log.** SRS không yêu cầu.
- **Không bảng thời khóa biểu.** Tính khi truy vấn.
- **Không Redis/hàng đợi cho đăng ký.** Bài toán chỉ cần nhất quán sĩ số — PostgreSQL transaction giải quyết; load test mới là nơi đánh giá hiệu năng thật.
- **Không lịch theo ngày cụ thể (nghỉ lễ, bù giờ).** Lịch tuần lặp đủ cho MVP.
- **Không quản trị học phần qua API.** Học phần là dữ liệu gốc, seed theo kỳ.

## Câu hỏi cần chốt trước khi viết migration

1. **Lịch học dùng khoảng tiết (1–12) như thiết kế, hay giờ cụ thể?** Đề xuất: tiết.
2. **Giá trị mặc định** `max_credits`/`min_credits` trong seed (đề xuất: 24/12, chỉnh qua seed, không hardcode trong code).
3. **Xóa lớp đang có người đăng ký:** chặn (RESTRICT) như thiết kế, hay admin cần chức năng "hủy lớp" trả chỗ cho tất cả? Đề xuất MVP: chỉ chặn, không có hủy.
4. **Đăng ký hai lớp khác nhau của cùng một học phần trong một kỳ:** SRS không nói thẳng, đề xuất từ chối — kiểm ở service bằng so học phần của các lớp đã đăng ký trong kỳ.

Nếu bốn điểm trên được đồng ý, viết migration theo thứ tự bảng 1 → 9 (đúng thứ tự phụ thuộc FK), đặt trong `database/migrations/`.
