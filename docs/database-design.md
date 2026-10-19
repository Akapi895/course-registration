# Thiết kế cơ sở dữ liệu

## 1. Tổng quan cơ sở dữ liệu

Hệ thống sử dụng PostgreSQL để lưu trữ và quản lý dữ liệu phục vụ các chức năng theo SRS Phase 1.

Cơ sở dữ liệu gồm 7 bảng: quản lý người dùng, học kỳ, học phần, điều kiện tiên quyết, lớp học phần, lịch học và đăng ký học phần.

Thiết kế sử dụng các ràng buộc cơ sở dữ liệu và transaction để bảo đảm tính toàn vẹn và nhất quán dữ liệu.

## 2. Sơ đồ quan hệ thực thể (ERD)

Sơ đồ ERD được định nghĩa trong file `database.dbml` và thể hiện quan hệ giữa 7 bảng. Các quan hệ chính gồm: người dùng với đăng ký học phần; học kỳ và học phần với lớp học phần; lớp học phần với lịch học và đăng ký; quan hệ tiên quyết giữa các học phần.

## 3. Thiết kế chi tiết các bảng

### 3.1. `users` – Người dùng

| Trường | Kiểu dữ liệu | Ràng buộc / ý nghĩa |
|---|---|---|
| `id` | BIGSERIAL | PK |
| `username` | TEXT | NOT NULL, UNIQUE |
| `password_hash` | TEXT | NOT NULL |
| `role` | TEXT | NOT NULL; `student`, `admin` |
| `full_name` | TEXT | NOT NULL |
| `student_code` | TEXT | UNIQUE, có thể NULL |
| `faculty` | TEXT | Có thể NULL |
| `major` | TEXT | Có thể NULL |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` |

Thông tin sinh viên và quản trị viên được lưu chung. `student_code` bắt buộc đối với sinh viên và phải là `NULL` đối với quản trị viên.

### 3.2. `semesters` – Học kỳ

| Trường | Kiểu dữ liệu | Ràng buộc / ý nghĩa |
|---|---|---|
| `id` | BIGSERIAL | PK |
| `name` | TEXT | NOT NULL, UNIQUE |
| `registration_opens_at` | TIMESTAMPTZ | NOT NULL |
| `registration_closes_at` | TIMESTAMPTZ | NOT NULL |
| `max_credits` | INT | NOT NULL, > 0 |

Mỗi học kỳ có một khoảng thời gian đăng ký; thời điểm mở phải trước thời điểm đóng.

### 3.3. `courses` – Học phần

| Trường | Kiểu dữ liệu | Ràng buộc / ý nghĩa |
|---|---|---|
| `id` | BIGSERIAL | PK |
| `code` | TEXT | NOT NULL, UNIQUE; mã học phần, ví dụ `INT3401` |
| `name` | TEXT | NOT NULL |
| `credits` | INT | NOT NULL, > 0 |
| `faculty` | TEXT | NOT NULL |
| `major` | TEXT | Có thể NULL |

### 3.4. `course_prerequisites` – Học phần tiên quyết

| Trường | Kiểu dữ liệu | Ràng buộc / ý nghĩa |
|---|---|---|
| `course_id` | BIGINT | PK ghép, FK → `courses.id` |
| `prerequisite_course_id` | BIGINT | PK ghép, FK → `courses.id` |

Khóa chính ghép (`course_id`, `prerequisite_course_id`); hai trường không được có cùng giá trị.

### 3.5. `course_classes` – Lớp học phần

| Trường | Kiểu dữ liệu | Ràng buộc / ý nghĩa |
|---|---|---|
| `id` | BIGSERIAL | PK; định danh nội bộ của lớp |
| `course_id` | BIGINT | NOT NULL, FK → `courses.id` |
| `semester_id` | BIGINT | NOT NULL, FK → `semesters.id` |
| `class_code` | TEXT | NOT NULL; mã lớp, ví dụ `INT3401-01` |
| `lecturer_name` | TEXT | NOT NULL |
| `max_capacity` | INT | NOT NULL, > 0 |
| `enrolled` | INT | NOT NULL, DEFAULT 0 |
| `status` | TEXT | NOT NULL, DEFAULT `active`; `active`, `cancelled` |

Mã lớp là duy nhất trong từng học kỳ (`semester_id`, `class_code`). Sĩ số hiện tại phải từ 0 đến `max_capacity`.

### 3.6. `class_schedules` – Lịch học

| Trường | Kiểu dữ liệu | Ràng buộc / ý nghĩa |
|---|---|---|
| `id` | BIGSERIAL | PK; định danh buổi học |
| `class_id` | BIGINT | NOT NULL, FK → `course_classes.id` |
| `day_of_week` | SMALLINT | NOT NULL, từ 2 đến 7 (thứ Hai đến thứ Bảy) |
| `start_period` | SMALLINT | NOT NULL, > 0; tiết bắt đầu ca học |
| `end_period` | SMALLINT | NOT NULL, ≥ `start_period`; tiết kết thúc ca học |
| `room` | TEXT | NOT NULL; phòng học/giảng đường |

Mỗi bản ghi thể hiện một buổi học lặp theo tuần. Một lớp học phần có thể có nhiều buổi học; `class_id` là ID tham chiếu, khác với mã lớp `class_code`.

### 3.7. `registrations` – Đăng ký học phần

| Trường | Kiểu dữ liệu | Ràng buộc / ý nghĩa |
|---|---|---|
| `id` | BIGSERIAL | PK |
| `student_id` | BIGINT | NOT NULL, FK → `users.id` |
| `class_id` | BIGINT | NOT NULL, FK → `course_classes.id` |
| `status` | TEXT | NOT NULL, DEFAULT `registered`; `registered`, `cancelled` |
| `registered_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` |

Cặp (`student_id`, `class_id`) là duy nhất. Khi hủy, hệ thống chuyển trạng thái thành `cancelled`; nếu đăng ký lại, bản ghi được chuyển về `registered` và cập nhật `registered_at`.

## 4. Ràng buộc và tính toàn vẹn dữ liệu

- **Ràng buộc dữ liệu:** PostgreSQL sử dụng PK, FK, UNIQUE, NOT NULL và CHECK để kiểm soát tính hợp lệ, tính duy nhất và mối quan hệ giữa các bảng.
- **Kiểm tra nghiệp vụ:** Backend kiểm tra thời gian đăng ký, sĩ số, đăng ký trùng, trùng lịch, điều kiện tiên quyết, giới hạn tín chỉ và quyền truy cập trước khi cập nhật dữ liệu.
- **Tính nhất quán:** Đăng ký và hủy học phần sử dụng transaction để cập nhật đồng bộ bản ghi đăng ký và sĩ số lớp học phần. Nếu có lỗi xảy ra, các thay đổi sẽ không được ghi nhận.

**Giới hạn dữ liệu:** `course_prerequisites` chỉ lưu quan hệ tiên quyết giữa các học phần. Thiết kế 7 bảng hiện tại chưa lưu kết quả học tập của từng sinh viên, nên cần xác định nguồn dữ liệu đó để thực hiện kiểm tra học phần tiên quyết theo SRS.