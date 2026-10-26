# Thiết kế cơ sở dữ liệu

## 1. Tổng quan cơ sở dữ liệu

Hệ thống sử dụng PostgreSQL để lưu trữ và quản lý dữ liệu theo đặc tả yêu cầu phần mềm (SRS).

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
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()`; thời điểm tạo phiên |
| `expires_at` | TIMESTAMPTZ | NOT NULL; thời điểm phiên tự hết hạn |
| `logged_out_at` | TIMESTAMPTZ | Có thể NULL; thời điểm người dùng chủ động đăng xuất trước khi hết hạn |

Mỗi phiên thuộc về một người dùng. Khóa chính `id` được đưa vào claim `sid` của JWT. Bảng có chỉ mục ghép (`user_id`, `created_at`) để hỗ trợ lấy phiên gần nhất; khóa ngoại `user_id` tham chiếu `users.id`. Không có các cột `refresh_token_hash`, `revoked_at`, `status` hoặc `cooldown_until`.

**Thời hạn và trạng thái phiên:**
- JWT chứa các claim `sub` (ID người dùng), `role`, `sid` (ID phiên), `iat` (thời điểm phát hành) và `exp` (thời điểm hết hạn).
- Thời điểm `expires_at` được backend đặt bằng `created_at + JWT_TTL` (cấu hình sử dụng 20 phút); giá trị `exp` phải khớp `expires_at` ở độ chính xác giây. `SESSION_TTL` phải bằng `JWT_TTL`.
- Phiên chỉ hoạt động khi `logged_out_at IS NULL` và thời gian hiện tại **nhỏ hơn** `expires_at`. Khi đến hạn, phiên tự hết hiệu lực theo phép so sánh thời gian; không cần cập nhật bảng hay chạy tác vụ nền.
- Khi người dùng chủ động đăng xuất và phiên vẫn còn hiệu lực, backend đặt `logged_out_at` một lần bằng thời điểm đăng xuất. Không thay đổi `expires_at`. Nếu phiên đã hết hạn, không ghi đè `logged_out_at` bằng thời điểm muộn hơn.

**Quy tắc đăng nhập lại (áp dụng cho mọi thiết bị):**
- Mỗi tài khoản được có tối đa **một phiên đang hoạt động**. Khi phiên hiện tại còn hoạt động, lần đăng nhập mới bị từ chối; không tạo phiên mới và không gia hạn thời hạn.
- Thời điểm kết thúc thực tế của phiên gần nhất là `COALESCE(logged_out_at, expires_at)`. Sau khi phiên kết thúc, tài khoản phải đợi đủ `LOGIN_COOLDOWN` (cấu hình sử dụng 20 phút) mới được đăng nhập lại.
- Backend kiểm tra phiên gần nhất và tạo phiên mới trong **cùng transaction có khóa dòng `users`**, ngăn hai lần đăng nhập đồng thời vượt qua điều kiện một phiên. Mỗi lần được phép đăng nhập tạo một `sid` mới.
- JWT chỉ được chấp nhận khi chữ ký, thời hạn và claim hợp lệ; session có `sid` tương ứng đang hoạt động; `sub` khớp `user_id` và `exp` khớp `expires_at`. Để tránh sử dụng quyền cũ, khi xác thực cần đối chiếu claim `role` với vai trò hiện tại của tài khoản trước khi phân quyền.

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
- **Quản lý phiên đăng nhập:** JWT chứa `sub`, `role`, `sid`, `iat`, `exp`; `sid` tham chiếu đến `auth_sessions.id`. Backend kiểm tra JWT, vai trò tài khoản và phiên tương ứng. Đăng xuất chủ động ghi `logged_out_at`; hết hạn tự động dựa trên `expires_at`. Sau khi kết thúc phiên, người dùng phải chờ đủ thời gian cooldown trước khi đăng nhập lại.
- **Tính nhất quán:** Đăng ký và hủy học phần sử dụng transaction để cập nhật đồng bộ bản ghi đăng ký và sĩ số lớp học phần. Nếu có lỗi xảy ra, các thay đổi sẽ không được ghi nhận.
