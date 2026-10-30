# Thiết kế cơ sở dữ liệu

## 1. Tổng quan cơ sở dữ liệu

PostgreSQL gồm 9 bảng, mô tả ở §3.

## 2. Sơ đồ quan hệ thực thể (ERD)

ERD nằm trong [`docs/diagrams/erd/`](diagrams/erd/): [`README.md`](diagrams/erd/README.md) (Mermaid), [`erd.mmd`](diagrams/erd/erd.mmd), [`erd.puml`](diagrams/erd/erd.puml) và [`database.dbml`](diagrams/erd/database.dbml) cho dbdiagram.io.

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

Thời điểm mở đăng ký phải trước thời điểm đóng (`chk_registration_period`). Giá trị do seed đặt.

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

Một học phần không thể là tiên quyết của chính nó (`course_id <> prerequisite_course_id`).

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
| `registered_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` |

Cặp (`student_id`, `class_id`) là duy nhất. Bảng chỉ lưu các đăng ký còn hiệu lực: hủy đăng ký (hoặc quản trị viên hủy lớp) xóa bản ghi, không lưu lịch sử, và đăng ký lại tạo bản ghi mới với `id` và `registered_at` mới.

### 3.8. `auth_sessions` – Phiên đăng nhập

| Trường | Kiểu dữ liệu | Ràng buộc / ý nghĩa |
|---|---|---|
| `id` | UUID | PK, DEFAULT `gen_random_uuid()` |
| `user_id` | BIGINT | NOT NULL, FK → `users.id` |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()`; thời điểm tạo phiên |
| `expires_at` | TIMESTAMPTZ | NOT NULL; thời điểm phiên tự hết hạn |
| `logged_out_at` | TIMESTAMPTZ | Có thể NULL; thời điểm người dùng chủ động đăng xuất trước khi hết hạn |

`id` là claim `sid` của JWT. Chỉ mục (`user_id`, `created_at`) phục vụ lấy phiên gần nhất.

Phiên hoạt động khi `logged_out_at IS NULL` và thời gian hiện tại nhỏ hơn `expires_at`; hết hạn chỉ là phép so sánh thời gian, không cần cập nhật bảng hay tác vụ nền. Đăng xuất đặt `logged_out_at` một lần và không đổi `expires_at`, còn phiên tự hết hạn giữ `logged_out_at` là `NULL`. Quy tắc TTL, một phiên mỗi sinh viên và cooldown nằm ở SRS §3.1.

### 3.9. `course_results` – Kết quả học tập

| Trường | Kiểu dữ liệu | Ràng buộc / ý nghĩa |
|---|---|---|
| `student_id` | BIGINT | PK ghép, FK → `users.id` |
| `course_id` | BIGINT | PK ghép, FK → `courses.id` |
| `passed` | BOOLEAN | NOT NULL; kết quả đạt/chưa đạt học phần |

`passed` dùng để kiểm tra điều kiện tiên quyết khi đăng ký. Chỉ mục phụ trên `course_id` hỗ trợ kiểm tra khóa ngoại khi cập nhật hoặc xóa học phần và truy vấn kết quả theo học phần.
