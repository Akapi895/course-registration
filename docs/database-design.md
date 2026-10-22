# Thiết kế cơ sở dữ liệu

## 1. Tổng quan cơ sở dữ liệu

Hệ thống sử dụng PostgreSQL để lưu trữ và quản lý dữ liệu phục vụ các chức năng theo SRS Phase 1.

Cơ sở dữ liệu gồm 9 bảng: quản lý người dùng, học kỳ, học phần, điều kiện tiên quyết, kết quả học tập, lớp học phần, lịch học, đăng ký học phần và phiên đăng nhập.

Thiết kế sử dụng các ràng buộc cơ sở dữ liệu và transaction để bảo đảm tính toàn vẹn và nhất quán dữ liệu.

## 2. Sơ đồ quan hệ thực thể (ERD)

Sơ đồ ERD được định nghĩa trong file `database.dbml` và thể hiện quan hệ giữa 9 bảng. Các quan hệ chính gồm: người dùng với đăng ký học phần, kết quả học tập và phiên đăng nhập; học kỳ và học phần với lớp học phần; lớp học phần với lịch học và đăng ký; quan hệ tiên quyết giữa các học phần và kết quả học tập của sinh viên.

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

### 3.8. `auth_sessions` – Phiên đăng nhập

| Trường | Kiểu dữ liệu | Ràng buộc / ý nghĩa |
|---|---|---|
| `id` | UUID | PK, DEFAULT `gen_random_uuid()` |
| `user_id` | BIGINT | NOT NULL, FK → `users.id` |
| `refresh_token_hash` | TEXT | NOT NULL; giá trị băm của Refresh Token |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` |
| `expires_at` | TIMESTAMPTZ | NOT NULL; thời điểm hết hạn phiên |
| `revoked_at` | TIMESTAMPTZ | Có thể NULL; thời điểm thu hồi phiên |

Mỗi phiên đăng nhập thuộc về một người dùng. Backend lưu giá trị băm của Refresh Token và sử dụng `expires_at`, `revoked_at` để xác định phiên còn hiệu lực hay đã hết hạn hoặc bị thu hồi.

### 3.9. `course_results` – Kết quả học tập

| Trường | Kiểu dữ liệu | Ràng buộc / ý nghĩa |
|---|---|---|
| `student_id` | BIGINT | PK ghép, FK → `users.id` |
| `course_id` | BIGINT | PK ghép, FK → `courses.id` |
| `passed` | BOOLEAN | NOT NULL; kết quả đạt/chưa đạt học phần |

Khóa chính ghép (`student_id`, `course_id`) bảo đảm mỗi sinh viên chỉ có một kết quả cho mỗi học phần. Trường `passed` được sử dụng để kiểm tra điều kiện tiên quyết khi đăng ký học phần. Chỉ mục phụ trên `course_id` hỗ trợ kiểm tra khóa ngoại khi cập nhật hoặc xóa học phần và truy vấn kết quả theo học phần.

## 4. Ràng buộc và tính toàn vẹn dữ liệu

- **Ràng buộc dữ liệu:** PostgreSQL sử dụng PK, FK, UNIQUE, NOT NULL và CHECK để kiểm soát tính hợp lệ, tính duy nhất và mối quan hệ giữa các bảng.
- **Kiểm tra nghiệp vụ:** Backend kiểm tra thời gian đăng ký, sĩ số, đăng ký trùng, trùng lịch, điều kiện tiên quyết, giới hạn tín chỉ và quyền truy cập trước khi cập nhật dữ liệu.
- **Quản lý phiên đăng nhập:** JWT chứa `sid` tham chiếu đến `auth_sessions.id`. Backend xác minh JWT và kiểm tra phiên còn hiệu lực trước khi cho phép truy cập. Khi đăng xuất, phiên được đánh dấu thu hồi để JWT tương ứng không tiếp tục được sử dụng.
- **Tính nhất quán:** Đăng ký và hủy học phần sử dụng transaction để cập nhật đồng bộ bản ghi đăng ký và sĩ số lớp học phần. Nếu có lỗi xảy ra, các thay đổi sẽ không được ghi nhận.
