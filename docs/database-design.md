# Thiết kế cơ sở dữ liệu

## 1. Tổng quan cơ sở dữ liệu

PostgreSQL gồm 9 bảng: người dùng, học kỳ, học phần, điều kiện tiên quyết, kết quả học tập, lớp học phần, lịch học, đăng ký học phần và phiên đăng nhập.

## 2. Sơ đồ quan hệ thực thể (ERD)

Sơ đồ ERD có thể được xem trực quan tại thư mục [`docs/diagrams/erd/`](diagrams/erd/) (hỗ trợ [`README.md`](diagrams/erd/README.md), [`erd.mmd`](diagrams/erd/erd.mmd), [`erd.puml`](diagrams/erd/erd.puml) hoặc chỉnh sửa trên dbdiagram.io qua [`database.dbml`](diagrams/erd/database.dbml)).

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
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()`; thời điểm tạo phiên |
| `expires_at` | TIMESTAMPTZ | NOT NULL; thời điểm phiên tự hết hạn |
| `logged_out_at` | TIMESTAMPTZ | Có thể NULL; thời điểm người dùng chủ động đăng xuất trước khi hết hạn |

`id` là claim `sid` của JWT. Chỉ mục (`user_id`, `created_at`) phục vụ lấy phiên gần nhất.

**Thời hạn và trạng thái phiên:**
- `expires_at = created_at + JWT_TTL` (mặc định 20 phút), hoặc `created_at + ADMIN_JWT_TTL` (mặc định 8 giờ) với quản trị viên; `exp` của JWT khớp `expires_at` ở độ chính xác giây. `SESSION_TTL` phải bằng `JWT_TTL`.
- Phiên hoạt động khi `logged_out_at IS NULL` và thời gian hiện tại **nhỏ hơn** `expires_at`. Hết hạn chỉ là phép so sánh thời gian, không cần cập nhật bảng hay tác vụ nền.
- Đăng xuất khi phiên còn hiệu lực đặt `logged_out_at` một lần, không đổi `expires_at`. Phiên đã hết hạn không bị ghi `logged_out_at`.

**Quy tắc đăng nhập lại (sinh viên, mọi thiết bị):**
- Mỗi sinh viên có tối đa **một phiên hoạt động**. Khi còn phiên hoạt động, đăng nhập mới bị từ chối, không tạo phiên và không gia hạn. Quản trị viên có thể có nhiều phiên hoạt động và không có cooldown.
- Phiên gần nhất kết thúc tại `COALESCE(logged_out_at, expires_at)`; sau đó phải đợi `LOGIN_COOLDOWN` (mặc định 20 phút).
- Kiểm tra phiên gần nhất và tạo phiên mới nằm trong **một transaction khóa dòng `users`**, nên hai lần đăng nhập đồng thời không tạo hai phiên. Mỗi lần đăng nhập tạo `sid` mới.
- JWT được chấp nhận khi chữ ký, claim hợp lệ, phiên `sid` đang hoạt động, `sub` khớp `user_id`, `exp` khớp `expires_at` và `role` khớp vai trò hiện tại của tài khoản.

Ví dụ: đăng nhập 10:00 → tự đăng xuất 10:05 → được đăng nhập lại từ 10:25; nếu không tự đăng xuất thì hết hạn 10:20 → được đăng nhập lại từ 10:40.

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
- **Phiên đăng nhập:** quy tắc ở §3.8.
- **Tính nhất quán:** Đăng ký và hủy học phần sử dụng transaction để cập nhật đồng bộ bản ghi đăng ký và sĩ số lớp học phần. Nếu có lỗi xảy ra, các thay đổi sẽ không được ghi nhận.
