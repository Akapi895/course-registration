# Thiết kế API

Tài liệu này cụ thể hóa SRS §5.2. Nếu có mâu thuẫn, SRS là căn cứ. Schema lấy từ `database.dbml` và được mô tả trong `database-design.md`.

## Phạm vi và phân quyền

Hiện có **13 endpoint nghiệp vụ**, tính theo cặp phương thức HTTP và đường dẫn. Danh sách dưới đây tương ứng với router backend và Swagger; `/health` và `/swagger/*any` là các route kỹ thuật, không tính vào 13 endpoint.

| STT | Nhóm | Phương thức | Endpoint | Quyền truy cập |
|---|---|---|---|---|
| 1 | Xác thực và người dùng | POST | `/api/auth/login` | Công khai |
| 2 | Xác thực và người dùng | POST | `/api/auth/logout` | Sinh viên hoặc quản trị viên |
| 3 | Xác thực và người dùng | GET | `/api/auth/me` | Sinh viên hoặc quản trị viên |
| 4 | Tra cứu lớp học phần | GET | `/api/classes` | Sinh viên hoặc quản trị viên |
| 5 | Tra cứu lớp học phần | GET | `/api/classes/{id}` | Sinh viên hoặc quản trị viên |
| 6 | Đăng ký học phần và thời khóa biểu | POST | `/api/registrations` | Chỉ sinh viên |
| 7 | Đăng ký học phần và thời khóa biểu | GET | `/api/registrations` | Chỉ sinh viên, xem đăng ký của chính mình |
| 8 | Đăng ký học phần và thời khóa biểu | DELETE | `/api/registrations/{id}` | Chỉ sinh viên sở hữu đăng ký |
| 9 | Đăng ký học phần và thời khóa biểu | GET | `/api/schedules` | Chỉ sinh viên, xem thời khóa biểu của chính mình |
| 10 | Quản trị hệ thống | POST | `/api/classes` | Chỉ quản trị viên |
| 11 | Quản trị hệ thống | PUT | `/api/classes/{id}` | Chỉ quản trị viên |
| 12 | Quản trị hệ thống | DELETE | `/api/classes/{id}` | Chỉ quản trị viên |
| 13 | Quản trị hệ thống | PUT | `/api/registration-period` | Chỉ quản trị viên |

Mọi endpoint trừ đăng nhập yêu cầu `Authorization: Bearer <access_token>` và phiên đăng nhập còn hiệu lực. Quản trị viên không được đăng ký/hủy học phần thay sinh viên hoặc truy cập các API đăng ký/thời khóa biểu dành riêng cho sinh viên.

Hai endpoint `GET /api/students/{id}` và `PUT /api/students/{id}` đã được gỡ bỏ; không có API danh sách/tìm kiếm sinh viên. Thông tin tài khoản hiện tại được đọc qua `GET /api/auth/me`.

## Hợp đồng request/response

Cột `Auth` cho biết yêu cầu gửi token; quyền theo vai trò được xác định tại bảng trên. Response lỗi trong bảng là ví dụ, các mã lỗi và ghi chú bên dưới mô tả thêm các trường hợp từ chối.

| Feature | Mô tả | Endpoint | Method | Request Body | Response Body | Response Fail | Auth |
|---|---|---|---|---|---|---|---|
| Xác thực và người dùng | Đăng nhập | /api/auth/login | POST | `{ "username": "student001", "password": "<password>" }` | `200` `{ "status": "success", "data": { "access_token": "<jwt>" } }` | `401 INVALID_CREDENTIALS`; `409 ALREADY_LOGGED_IN`; `429 LOGIN_COOLDOWN` — payload chi tiết tại mục Vòng đời xác thực bên dưới | none |
| Xác thực và người dùng | Đăng xuất và kết thúc phiên hiện tại | /api/auth/logout | POST | — | `200` `{ "status": "success", "data": {} }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Xác thực và người dùng | Lấy thông tin người dùng hiện tại | /api/auth/me | GET | — | `200` `{ "status": "success", "data": { "id": 7, "username": "sv001", "role": "student", "full_name": "Nguyễn Văn A", "student_code": "SV001", "faculty": "CNTT", "major": "Khoa học máy tính" } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Tra cứu lớp học phần | Lấy danh sách lớp học phần đang hoạt động của học kỳ hiện tại | /api/classes | GET | — | `200` `{ "status": "success", "data": { "semester": { "id": 2, "name": "Học kỳ 1 năm học 2026-2027", "max_credits": 24, "registration_opens_at": "2026-10-13T00:00:00+07:00", "registration_closes_at": "2026-11-19T00:00:00+07:00", "registration_open": true }, "classes": [ { "id": 10, "class_code": "INT3401-01", "course_code": "INT3401", "course_name": "Hệ điều hành", "lecturer_name": "Giảng viên A", "credits": 3, "enrolled": 42, "max_capacity": 50 } ] } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Tra cứu lớp học phần | Chi tiết lớp học phần | /api/classes/{id} | GET | — | `200` `{ "status": "success", "data": { "id": 10, "course_id": 5, "course_code": "INT3401", "course_name": "Hệ điều hành", "credits": 3, "faculty": "Công nghệ thông tin", "major": "Khoa học máy tính", "semester_id": 2, "semester_name": "Học kỳ 1 năm học 2026-2027", "class_code": "INT3401-01", "lecturer_name": "Giảng viên A", "max_capacity": 50, "enrolled": 42, "status": "active", "schedules": [ { "day_of_week": 2, "start_period": 1, "end_period": 3, "room": "A2-301" } ], "prerequisites": [ { "course_id": 4, "course_code": "INT2211", "course_name": "Cơ sở dữ liệu", "passed": true } ] } }` | `404` `{ "status": "fail", "data": { "code": "NOT_FOUND", "message": "Không tìm thấy dữ liệu" } }` | required |
| Đăng ký học phần và thời khóa biểu | Đăng ký một hoặc nhiều lớp học phần cho tài khoản hiện tại; xử lý từng lớp, lớp hợp lệ được ghi nhận, lớp bị từ chối được báo lại | /api/registrations | POST | `{ "class_ids": [10, 11, 12, 13, 14] }` | `200` `{ "status": "success", "data": { "registered_count": 3, "failed_count": 2, "results": [ { "class_id": 10, "status": "registered", "id": 301, "registered_at": "2026-10-21T09:00:00+07:00" }, { "class_id": 11, "status": "registered", "id": 302, "registered_at": "2026-10-21T09:00:00+07:00" }, { "class_id": 12, "status": "registered", "id": 303, "registered_at": "2026-10-21T09:00:00+07:00" }, { "class_id": 13, "status": "failed", "code": "CLASS_FULL", "message": "Lớp học phần đã đủ sĩ số" }, { "class_id": 14, "status": "failed", "code": "SCHEDULE_CONFLICT", "message": "Lớp bị trùng lịch với học phần đã đăng ký" } ] } }` | `400` `{ "status": "fail", "data": { "code": "VALIDATION_ERROR", "message": "Danh sách lớp bị trùng" } }` | required |
| Đăng ký học phần và thời khóa biểu | Xem toàn bộ học phần đã đăng ký của mình | /api/registrations | GET | — | `200` `{ "status": "success", "data": { "registrations": [ { "id": 301, "class_id": 10, "class_code": "INT3401-01", "course_code": "INT3401", "course_name": "Hệ điều hành", "credits": 3, "status": "registered", "registered_at": "2026-10-21T09:00:00+07:00" } ] } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Đăng ký học phần và thời khóa biểu | Hủy đăng ký của mình; `{id}` là `registrations.id` | /api/registrations/{id} | DELETE | — | `200` `{ "status": "success", "data": {} }` | `404` `{ "status": "fail", "data": { "code": "NOT_FOUND", "message": "Không tìm thấy đăng ký của bạn" } }` | required |
| Đăng ký học phần và thời khóa biểu | Thời khóa biểu của mình | /api/schedules | GET | — | `200` `{ "status": "success", "data": { "schedules": [ { "class_id": 10, "class_code": "INT3401-01", "course_code": "INT3401", "course_name": "Hệ điều hành", "day_of_week": 2, "start_period": 1, "end_period": 3, "room": "A2-301" } ] } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Quản trị hệ thống | Tạo lớp học phần kèm lịch học | /api/classes | POST | `{ "course_id": 5, "semester_id": 2, "class_code": "INT3401-01", "lecturer_name": "Giảng viên A", "max_capacity": 50, "schedules": [ { "day_of_week": 2, "start_period": 1, "end_period": 3, "room": "A2-301" } ] }` | `201` `{ "status": "success", "data": { "id": 10, "class_code": "INT3401-01", "status": "active", "enrolled": 0 } }` | `409` `{ "status": "fail", "data": { "code": "CONFLICT", "message": "class_code đã tồn tại trong học kỳ" } }` | required |
| Quản trị hệ thống | Cập nhật các trường được phép sửa của lớp | /api/classes/{id} | PUT | `{ "class_code": "INT3401-01", "lecturer_name": "Giảng viên B", "max_capacity": 60, "schedules": [ { "day_of_week": 3, "start_period": 4, "end_period": 6, "room": "A2-302" } ] }` | `200` `{ "status": "success", "data": { "id": 10, "class_code": "INT3401-01", "lecturer_name": "Giảng viên B", "max_capacity": 60 } }` | `409` `{ "status": "fail", "data": { "code": "SCHEDULE_LOCKED", "message": "Không thể sửa lịch học khi lớp đã có sinh viên đăng ký" } }` | required |
| Quản trị hệ thống | Hủy lớp học phần (không xóa vật lý) | /api/classes/{id} | DELETE | — | `200` `{ "status": "success", "data": {} }` | `409` `{ "status": "fail", "data": { "code": "CLASS_CANCELLED", "message": "Lớp học phần đã bị hủy" } }` | required |
| Quản trị hệ thống | Cập nhật thời gian đăng ký cho học kỳ | /api/registration-period | PUT | `{ "semester_id": 2, "registration_opens_at": "2026-11-01T00:00:00+07:00", "registration_closes_at": "2026-11-14T23:59:59+07:00" }` | `200` `{ "status": "success", "data": { "semester_id": 2, "registration_opens_at": "2026-11-01T00:00:00+07:00", "registration_closes_at": "2026-11-14T23:59:59+07:00" } }` | `400` `{ "status": "fail", "data": { "code": "VALIDATION_ERROR", "message": "Thời gian đóng đăng ký phải sau thời gian mở đăng ký" } }` | required |

## Thông tin tài khoản hiện tại

`POST /api/auth/login` chỉ trả `access_token`. Sau đăng nhập, frontend gọi `GET /api/auth/me` với token đó để lấy dữ liệu sau:

| Trường trong `data` | Kiểu dữ liệu | Ý nghĩa |
|---|---|---|
| `id` | integer | ID tài khoản hiện tại |
| `username` | string | Tên đăng nhập |
| `role` | string | `student` hoặc `admin` |
| `full_name` | string | Họ và tên |
| `student_code` | string hoặc null | Mã sinh viên; `null` với quản trị viên |
| `faculty` | string hoặc null | Khoa của người dùng, nếu có |
| `major` | string hoặc null | Ngành của người dùng, nếu có |

Endpoint chỉ trả thông tin của tài khoản gắn với JWT, không nhận ID tài khoản đích. Frontend dùng `faculty`, `major` để hiển thị tổng quan và lọc lớp theo ngành; không cần gọi API hồ sơ riêng. Response không chứa mật khẩu hoặc `password_hash`.

## Vòng đời xác thực

### JWT và phiên phía backend

JWT sử dụng **HS256**, gửi qua `Authorization: Bearer <access_token>`. Không phát hành refresh token. Mọi API nghiệp vụ trừ login kiểm tra chữ ký, thuật toán, claim và phiên trong database trước khi phân quyền:

| Claim | Kiểu JSON | Kiểm tra |
|---|---|---|
| `sub` | string | ID người dùng nguyên dương ở dạng chuẩn, ví dụ `"1"`; khớp `auth_sessions.user_id` |
| `role` | string | `student` hoặc `admin`; khớp vai trò hiện tại trong `users`, không chỉ tin vai trò đã lưu trong JWT |
| `sid` | string | UUID của phiên còn tồn tại, chưa logout và chưa hết hạn |
| `iat` | number | Bắt buộc, không nằm trong tương lai; khớp `auth_sessions.created_at` ở độ chính xác giây |
| `exp` | number | Bắt buộc, sau `iat` và thời gian hiện tại chưa đến `exp`; khớp `auth_sessions.expires_at` ở độ chính xác giây |

Backend dùng cùng một mốc thời gian ứng dụng cho kiểm tra JWT và điều kiện SQL của phiên, kể cả khi PostgreSQL chạy trên máy khác. Phiên chỉ hoạt động khi `logged_out_at IS NULL AND now < expires_at`. Không cần tác vụ nền để đánh dấu hết hạn.

`JWT_TTL` và `SESSION_TTL` mặc định cùng `20m` và bắt buộc bằng nhau; bỏ trống `SESSION_TTL` để theo `JWT_TTL`. Mỗi phiên mới có `expires_at = created_at + JWT_TTL`. Khi đổi TTL, các phiên đã lưu giữ nguyên thời hạn; không tính lại hạn của chúng theo cấu hình mới. `LOGIN_COOLDOWN` mặc định `20m` và được áp dụng theo cấu hình hiện hành khi kiểm tra đăng nhập.

### Login: kiểm tra mật khẩu → phiên hoạt động → cooldown

1. Xác thực username/password. Sai username hay password đều trả cùng response, trước khi kiểm tra trạng thái phiên:

   ```json
   { "status": "fail", "data": { "code": "INVALID_CREDENTIALS", "message": "Sai tên đăng nhập hoặc mật khẩu" } }
   ```

2. Khi thông tin hợp lệ, backend khóa dòng `users`, đọc phiên gần nhất theo `created_at`, kiểm tra và tạo phiên trong **cùng transaction**. Mỗi tài khoản chỉ có **một phiên hoạt động** trên mọi thiết bị/trình duyệt/tab. Nếu còn phiên hoạt động, trả **409**, giữ nguyên phiên và `expires_at`, không cấp token mới:

   ```json
   { "status": "fail", "data": { "code": "ALREADY_LOGGED_IN", "message": "Tài khoản đang đăng nhập trên một phiên khác" } }
   ```

3. Nếu phiên đã kết thúc, mốc được login lại là `COALESCE(logged_out_at, expires_at) + LOGIN_COOLDOWN` của **phiên gần nhất**. Chưa đến mốc này thì trả **429**, header `Retry-After` và dữ liệu:

   ```json
   { "status": "fail", "data": { "code": "LOGIN_COOLDOWN", "message": "Tài khoản đang trong thời gian chờ đăng nhập lại", "retry_after": 720, "login_allowed_at": "2026-10-26T03:25:00Z" } }
   ```

   `Retry-After: 720` và `data.retry_after` cùng là số giây còn chờ, làm tròn lên. `data.login_allowed_at` là thời điểm RFC 3339 theo backend. Với cooldown mặc định, logout lúc 10:05 UTC+7, thử login lúc 10:13 thì còn 12 phút và được login lại từ 10:25 UTC+7. Nếu để phiên hết hạn lúc 10:20 thì mốc là 10:40. Đúng khi hết cooldown được phép login.

4. Không có phiên trước hoặc đã hết cooldown: tạo phiên với `sid` mới và trả **200**, `data` chỉ chứa `access_token`. Frontend gọi `GET /api/auth/me` để lấy tài khoản và điều hướng theo vai trò. Quy tắc áp dụng cho cả sinh viên và quản trị viên.

### Logout và hết hạn

- `POST /api/auth/logout` lấy `sid` từ JWT đã xác thực, ghi `logged_out_at` **một lần** bằng thời điểm backend xử lý logout nếu phiên còn hoạt động. Không xóa bản ghi, không đổi `expires_at`; JWT cũ bị từ chối ngay. Thành công trả `200` với `data: {}`.
- JWT đã hết hạn bị middleware từ chối bằng `401 UNAUTHORIZED`; JWT còn hạn nhưng phiên đã logout hoặc không còn hoạt động trả `401 SESSION_REVOKED`. Gọi lại logout không ghi lại thời điểm kết thúc và không kéo dài cooldown.
- Tự hết hạn để `logged_out_at = NULL`; không gọi API logout để ghi một mốc kết thúc muộn hơn. Đóng tab/trình duyệt cũng không phải logout chủ động: nếu không gọi API logout, phiên backend tiếp tục tới `expires_at`.
- Bảng `auth_sessions` có đúng năm cột: `id`, `user_id`, `created_at`, `expires_at`, `logged_out_at`, kèm chỉ mục (`user_id`, `created_at`). Không có `refresh_token_hash`, `revoked_at`, `status` hay `cooldown_until`.

### Phiên và lỗi phía frontend

- Token và trạng thái chỉ xem lưu trong `sessionStorage` của tab; nếu storage không khả dụng thì chỉ giữ trong bộ nhớ. Reload kiểm tra `exp` trước: token đã hết hạn hoặc không đọc được hạn bị xóa cục bộ, không gửi `/api/auth/me`; token còn hạn phải được xác thực lại bằng `/api/auth/me`.
- Bộ hẹn giờ được đặt ngay khi nhận token, kể cả khi `/api/auth/me` còn đang chờ, cho cả sinh viên và admin. Frontend kiểm tra lại khi cửa sổ nhận `focus`, trang được khôi phục (`pageshow`) hoặc tab chuyển sang hiển thị (`visibilitychange`). Hết hạn xóa token, tài khoản và trạng thái chỉ xem; yêu cầu login còn chờ được hủy, giao diện trở về login. Các quyết định cho phép truy cập vẫn do backend kiểm tra.
- Trước request có token, frontend kiểm tra hạn; token hết hạn không được gửi tiếp. `401` của request dùng token hiện tại cũng xóa phiên. Phản hồi cũ, timer cũ hoặc yêu cầu bị thay thế không được ghi đè/xóa một phiên đăng nhập mới.
- `409 ALREADY_LOGGED_IN` hiển thị thông báo tài khoản còn phiên hoạt động, không tạo countdown cooldown và không tác động phiên đang dùng ở thiết bị khác. `429 LOGIN_COOLDOWN` hiển thị countdown theo `retry_after`, lưu riêng theo username trong `sessionStorage`, giữ qua reload và cập nhật khi quay lại tab. Đổi username không bị khóa theo cooldown của tài khoản khác; countdown chỉ phục vụ hiển thị, backend luôn kiểm tra lại.
- Lỗi mạng khi khôi phục một token còn hạn hiển thị thao tác thử lại; không tự coi là logout thành công hay xóa một phiên còn hạn. Timer hết hạn vẫn hoạt động trong lúc chờ hoặc khi trang báo lỗi mạng.

## Route kỹ thuật

| Phương thức | Đường dẫn | Xác thực | Kết quả |
|---|---|---|---|
| GET | `/health` | Không yêu cầu | `200` `{ "status": "success", "data": {} }`; phục vụ healthcheck backend, không truy vấn kiểm tra cơ sở dữ liệu |
| GET | `/swagger/*any` | Không yêu cầu | Swagger UI tại `/swagger/index.html`, tài liệu JSON tại `/swagger/doc.json` và các tài nguyên liên quan; không dùng envelope nghiệp vụ |

Các đường dẫn này truy cập trên backend. Khi chạy Compose với nginx frontend, proxy chỉ chuyển tiếp `/api/`, nên truy cập Swagger trực tiếp qua cổng backend. Cấu hình Render trong `deployment/` phục vụ frontend và backend cùng một Web Service, nên Swagger truy cập trên cùng domain của giao diện.

## Mã lỗi

| Mã lỗi | HTTP | Khi nào xảy ra |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Dữ liệu sai định dạng, thiếu tham số, gửi trường không được phép, hoặc thời gian không hợp lệ |
| `UNAUTHORIZED` | 401 | Chưa đăng nhập, thiếu token, token sai chữ ký, hết hạn JWT, claim không hợp lệ hoặc `role` trong JWT không khớp vai trò hiện tại |
| `INVALID_CREDENTIALS` | 401 | Sai username hoặc password |
| `ALREADY_LOGGED_IN` | 409 | Đúng thông tin đăng nhập nhưng tài khoản đang có một phiên hoạt động trên thiết bị hoặc tab bất kỳ; không tạo phiên khác |
| `LOGIN_COOLDOWN` | 429 | Đúng thông tin đăng nhập nhưng chưa qua `LOGIN_COOLDOWN` (mặc định 20 phút) kể từ lúc phiên gần nhất kết thúc; có `Retry-After`, `data.retry_after` và `data.login_allowed_at` |
| `SESSION_REVOKED` | 401 | Token còn đúng chữ ký nhưng phiên tương ứng đã chủ động đăng xuất hoặc không còn hoạt động (hết hạn trong database) |
| `FORBIDDEN` | 403 | Đã đăng nhập nhưng không đủ quyền |
| `NOT_FOUND` | 404 | Tài nguyên không tồn tại hoặc không thuộc người dùng hiện tại |
| `CONFLICT` | 409 | Trùng dữ liệu duy nhất, ví dụ `class_code` đã có trong học kỳ |
| `CLASS_CANCELLED` | 409 | Lớp học phần đã bị hủy |
| `CLASS_FULL` | 409 | Lớp học phần đã đủ sĩ số |
| `CAPACITY_BELOW_ENROLLED` | 409 | `max_capacity` mới nhỏ hơn số sinh viên đã đăng ký |
| `SCHEDULE_LOCKED` | 409 | Sửa lịch học khi lớp đã có sinh viên đăng ký |
| `REGISTRATION_CLOSED` | 409 | Đăng ký hoặc hủy ngoài thời gian đăng ký |
| `ALREADY_REGISTERED` | 409 | Sinh viên đã đăng ký lớp này |
| `SCHEDULE_CONFLICT` | 409 | Trùng lịch với lớp đã đăng ký trong cùng học kỳ |
| `PREREQUISITE_NOT_MET` | 409 | Chưa đạt học phần tiên quyết |
| `CREDIT_LIMIT_EXCEEDED` | 409 | Vượt số tín chỉ tối đa của học kỳ |
| `REGISTRATION_NOT_ACTIVE` | 409 | Hủy đăng ký không ở trạng thái đã đăng ký |
| `INTERNAL_ERROR` | 500 | Lỗi không lường trước, không trả chi tiết nội bộ |

## Ghi chú

- Frontend xử lý lỗi theo `data.code`. `data.message` chỉ là câu mô tả để hiển thị.
- Mọi endpoint nghiệp vụ trừ login cần header `Authorization: Bearer <access_token>` và có thể trả `UNAUTHORIZED`, `SESSION_REVOKED`, `FORBIDDEN`, `INTERNAL_ERROR` tùy trường hợp. Các route kỹ thuật không yêu cầu token. Hệ thống không phát hành refresh token.
- `POST /api/registrations`: body chỉ nhận `class_ids`, gồm 1 đến 20 ID lớp dương và không trùng nhau. Sai định dạng, danh sách rỗng, quá 20 lớp hoặc có ID trùng thì cả yêu cầu bị từ chối với `400 VALIDATION_ERROR` và không lớp nào được xử lý. Người dùng không phải sinh viên nhận `403 FORBIDDEN`.
- `POST /api/registrations` xử lý các lớp lần lượt theo thứ tự trong `class_ids`, mỗi lớp trong một transaction riêng. Lớp đáp ứng điều kiện được ghi nhận (`status: "registered"`, kèm `id` và `registered_at`); lớp bị từ chối có `status: "failed"` kèm `code` và `message` mà không ảnh hưởng các lớp khác. Trùng lịch và giới hạn tín chỉ tính cả các lớp vừa được ghi nhận trước đó trong cùng yêu cầu, nên thứ tự gửi quyết định lớp nào được ưu tiên.
- Yêu cầu hợp lệ luôn trả `200`, kể cả khi mọi lớp bị từ chối (`registered_count = 0`). Kết quả từng lớp nằm trong `results[].status`; `registered_count` và `failed_count` là số lượng tổng hợp, không dựa vào HTTP status để biết kết quả từng lớp. Đăng ký thành công một phần vẫn được tính là hoàn tất cho các lớp đã ghi nhận.
- `results[].code` có thể là: `NOT_FOUND`, `CLASS_CANCELLED`, `CLASS_FULL`, `REGISTRATION_CLOSED`, `ALREADY_REGISTERED`, `SCHEDULE_CONFLICT`, `PREREQUISITE_NOT_MET`, `CREDIT_LIMIT_EXCEEDED`, `INTERNAL_ERROR`. Các mã này dùng cùng ý nghĩa với bảng trên nhưng nằm trong `results`, không đi kèm HTTP 4xx.
- `DELETE /api/registrations/{id}` có thể trả: `NOT_FOUND`, `REGISTRATION_NOT_ACTIVE`, `REGISTRATION_CLOSED`.
- `PUT /api/classes/{id}` có thể trả: `CLASS_CANCELLED`, `CAPACITY_BELOW_ENROLLED`, `SCHEDULE_LOCKED`, `CONFLICT`, `VALIDATION_ERROR`.
- Login sai username hoặc password đều trả cùng một mã và message.
- `GET /api/auth/me` trả thêm `faculty`, `major` (có thể `null`) để frontend hiển thị khoa/ngành và lọc lớp học phần. Không cung cấp hai endpoint hồ sơ `GET`, `PUT /api/students/{id}` trong phạm vi hiện tại.
- `GET /api/classes`: không nhận `semester_id`, luôn trả lớp `active` của học kỳ hiện tại (học kỳ có `registration_opens_at` mới nhất không sau thời điểm hiện tại). Query `faculty`, `major` là tùy chọn.
- Mỗi phần tử `classes[]` có `lecturer_name` để hiển thị cột Giảng viên trên trang Đăng ký học phần, không cần tải chi tiết từng lớp.
- `GET /api/classes` vẫn trả danh sách để tra cứu sau khi đóng đăng ký; `data.semester.registration_open = false` không đồng nghĩa lớp bị loại khỏi danh sách.
- `registration_open` chỉ xuất hiện tại `data.semester.registration_open` của `GET /api/classes`, không lặp trong `classes[]` hoặc response chi tiết lớp. Giá trị là `true` khi thời điểm backend xử lý request nằm trong khoảng từ `registration_opens_at` đến `registration_closes_at` (bao gồm hai đầu). Frontend dùng để hiển thị và khóa/mở thao tác theo thời gian; đây không phải kết quả đăng ký thành công. Backend vẫn kiểm tra lại thời gian và các điều kiện nghiệp vụ khi xử lý đăng ký/hủy.
- `GET /api/classes/{id}` trả thêm `faculty` (khoa của học phần), `major` (ngành của học phần; `null` với học phần chung của nhiều ngành), `semester_name` và `prerequisites` (các học phần tiên quyết, sắp theo `course_code`; mảng rỗng nếu không có). `passed` trong mỗi phần tử chỉ có khi người gọi là sinh viên: `true` nếu sinh viên đó đã đạt học phần (`course_results.passed`), `false` nếu chưa; quản trị viên không nhận `passed`. Đây chỉ là thông tin tham khảo; việc kiểm tra tiên quyết khi đăng ký vẫn do `POST /api/registrations` thực hiện.
- `GET /api/classes` trả thêm `data.semester`: học kỳ hiện tại mà các lớp thuộc về (`id`, `name`, `max_credits`, `registration_opens_at`, `registration_closes_at`, `registration_open`). Client dùng để hiển thị khung đợt đăng ký và mức tín chỉ tối đa. `semester` là `null` và `classes` rỗng khi chưa có học kỳ nào mở đăng ký. `semester` không phụ thuộc bộ lọc `faculty`, `major`, nên vẫn có khi bộ lọc không khớp lớp nào.
- `MAX_CREDITS` là cấu hình runtime tùy chọn, số nguyên dương tối đa 2147483647. Khi được đặt, API dùng giá trị này thay giới hạn lưu trong từng học kỳ cho cả `data.semester.max_credits` và kiểm tra `CREDIT_LIMIT_EXCEEDED`; bỏ trống thì dùng database. Không cập nhật cột `semesters.max_credits` hoặc yêu cầu seed lại khi đổi cấu hình.
- Frontend tự lấy `data.semester.id` làm `semester_id` khi tạo lớp hoặc cấu hình thời gian đăng ký của học kỳ hiện tại; chỉ hiển thị tên học kỳ ở trường chỉ đọc, không yêu cầu admin nhập ID. Khi đang tải, tải lỗi hoặc `semester` là `null`, chưa cho gửi các form này. Form sửa lớp hiển thị học kỳ từ chi tiết lớp, không thay bằng học kỳ hiện tại. Không dùng tham số URL để ghi đè học kỳ.
- `POST /api/classes`: `class_code` duy nhất trong học kỳ. `course_id`, `semester_id` phải tồn tại.
- `PUT /api/classes/{id}`: không đổi `course_id`, `semester_id`. `max_capacity` không nhỏ hơn `enrolled`. Khi `enrolled > 0` không sửa được `schedules`.
- `DELETE /api/classes/{id}`: hủy mềm. Các đăng ký `registered` của lớp chuyển sang `cancelled`, `enrolled = 0`.
- `DELETE /api/registrations/{id}`: chỉ hủy đăng ký của chính mình.
- Hai endpoint DELETE trên trả `200` với `{ "status": "success", "data": {} }` khi hủy thành công, không trả lại `data.id` hoặc `data.status`. ID đối tượng đã có trong request; trạng thái hủy được lưu ở cơ sở dữ liệu, các response đọc vẫn giữ trường trạng thái nghiệp vụ khi có.
- `GET /api/registrations` và `GET /api/schedules` trả đăng ký đang hiệu lực và lịch học tương ứng của chính sinh viên, trên tất cả học kỳ; không nhận ID sinh viên đích. Client tự lọc theo học kỳ nếu cần.
- Không có API danh mục học kỳ, học phần hoặc kết quả học tập; các dữ liệu này lấy từ seed. `PUT /api/registration-period` chỉ cấu hình thời gian đăng ký của học kỳ đã tồn tại.
