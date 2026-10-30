# Thiết kế API

Tài liệu này cụ thể hóa SRS §5.2. Schema lấy từ `diagrams/erd/database.dbml` và được mô tả trong `database-design.md`.

## Phạm vi và phân quyền

Có 12 endpoint nghiệp vụ, tính theo cặp phương thức và đường dẫn, khớp với router và Swagger. `/health` và `/swagger/*any` là route kỹ thuật, không tính vào số này.

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

Tất cả API, ngoại trừ API đăng nhập, đều yêu cầu gửi access token trong header `Authorization: Bearer <access_token>`. Token phải hợp lệ và phiên đăng nhập tương ứng vẫn còn hiệu lực. Quản trị viên không được đăng ký hoặc hủy học phần thay sinh viên, đồng thời không được sử dụng các API dành riêng cho sinh viên để xem đăng ký và thời khóa biểu.

## Đặc tả Request và Response

Cột `Auth` cho biết yêu cầu gửi token; quyền theo vai trò được xác định tại bảng trên. Response lỗi trong bảng là ví dụ, các mã lỗi và ghi chú bên dưới mô tả thêm các trường hợp từ chối.

| Feature | Mô tả | Endpoint | Method | Request Body | Response Success | Response Fail | Auth |
|---|---|---|---|---|---|---|---|
| Xác thực và người dùng | Đăng nhập | /api/auth/login | POST | `{ "username": "student001", "password": "<password>" }` | `200` `{ "status": "success", "data": { "access_token": "<jwt>" } }` | `401 INVALID_CREDENTIALS`; `409 ALREADY_LOGGED_IN`; `429 LOGIN_COOLDOWN`; payload chi tiết tại mục Vòng đời xác thực bên dưới | none |
| Xác thực và người dùng | Đăng xuất và kết thúc phiên hiện tại | /api/auth/logout | POST | — | `200` `{ "status": "success", "data": {} }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Xác thực và người dùng | Lấy thông tin người dùng hiện tại | /api/auth/me | GET | — | `200` `{ "status": "success", "data": { "id": 7, "username": "sv001", "role": "student", "full_name": "Nguyễn Văn A", "student_code": "SV001", "faculty": "CNTT", "major": "Khoa học máy tính" } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Tra cứu lớp học phần | Lấy danh sách lớp học phần đang hoạt động của học kỳ hiện tại | /api/classes | GET | — | `200` `{ "status": "success", "data": { "semester": { "id": 2, "name": "Học kỳ 1 năm học 2026-2027", "max_credits": 24, "registration_opens_at": "2026-10-13T00:00:00+07:00", "registration_closes_at": "2026-11-19T00:00:00+07:00", "registration_open": true }, "classes": [ { "id": 10, "class_code": "INT3401-01", "course_code": "INT3401", "course_name": "Hệ điều hành", "lecturer_name": "Giảng viên A", "credits": 3, "enrolled": 42, "max_capacity": 50 } ] } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Tra cứu lớp học phần | Chi tiết lớp học phần | /api/classes/{id} | GET | — | `200` `{ "status": "success", "data": { "id": 10, "course_id": 5, "course_code": "INT3401", "course_name": "Hệ điều hành", "credits": 3, "faculty": "Công nghệ thông tin", "major": "Khoa học máy tính", "semester_id": 2, "semester_name": "Học kỳ 1 năm học 2026-2027", "class_code": "INT3401-01", "lecturer_name": "Giảng viên A", "max_capacity": 50, "enrolled": 42, "status": "active", "schedules": [ { "day_of_week": 2, "start_period": 1, "end_period": 3, "room": "A2-301" } ], "prerequisites": [ { "course_id": 4, "course_code": "INT2211", "course_name": "Cơ sở dữ liệu", "passed": true } ] } }` | `404` `{ "status": "fail", "data": { "code": "NOT_FOUND", "message": "Không tìm thấy dữ liệu" } }` | required |
| Đăng ký học phần và thời khóa biểu | Đăng ký một hoặc nhiều lớp học phần cho tài khoản hiện tại; xử lý từng lớp, lớp hợp lệ được ghi nhận, lớp bị từ chối được báo lại | /api/registrations | POST | `{ "class_ids": [10, 11, 12, 13, 14] }` | `200` `{ "status": "success", "data": { "registered_count": 3, "failed_count": 2, "results": [ { "class_id": 10, "status": "registered", "id": 301, "registered_at": "2026-10-21T09:00:00+07:00" }, { "class_id": 11, "status": "registered", "id": 302, "registered_at": "2026-10-21T09:00:00+07:00" }, { "class_id": 12, "status": "registered", "id": 303, "registered_at": "2026-10-21T09:00:00+07:00" }, { "class_id": 13, "status": "failed", "code": "CLASS_FULL", "message": "Lớp học phần đã đủ sĩ số" }, { "class_id": 14, "status": "failed", "code": "SCHEDULE_CONFLICT", "message": "Lớp bị trùng lịch với học phần đã đăng ký" } ] } }` | `400` `{ "status": "fail", "data": { "code": "VALIDATION_ERROR", "message": "Danh sách lớp bị trùng" } }` | required |
| Đăng ký học phần và thời khóa biểu | Xem toàn bộ học phần đã đăng ký của mình | /api/registrations | GET | — | `200` `{ "status": "success", "data": { "registrations": [ { "id": 301, "class_id": 10, "class_code": "INT3401-01", "course_code": "INT3401", "course_name": "Hệ điều hành", "credits": 3, "registered_at": "2026-10-21T09:00:00+07:00" } ] } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Đăng ký học phần và thời khóa biểu | Xóa vật lý đăng ký của mình; `{id}` là `registrations.id` | /api/registrations/{id} | DELETE | — | `200` `{ "status": "success", "data": {} }` | `404` `{ "status": "fail", "data": { "code": "NOT_FOUND", "message": "Không tìm thấy đăng ký của bạn" } }` | required |
| Đăng ký học phần và thời khóa biểu | Thời khóa biểu của mình | /api/schedules | GET | — | `200` `{ "status": "success", "data": { "schedules": [ { "class_id": 10, "class_code": "INT3401-01", "course_code": "INT3401", "course_name": "Hệ điều hành", "day_of_week": 2, "start_period": 1, "end_period": 3, "room": "A2-301" } ] } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Quản trị hệ thống | Tạo lớp học phần kèm lịch học | /api/classes | POST | `{ "course_id": 5, "semester_id": 2, "class_code": "INT3401-01", "lecturer_name": "Giảng viên A", "max_capacity": 50, "schedules": [ { "day_of_week": 2, "start_period": 1, "end_period": 3, "room": "A2-301" } ] }` | `201` `{ "status": "success", "data": { "id": 10, "class_code": "INT3401-01", "status": "active", "enrolled": 0 } }` | `409` `{ "status": "fail", "data": { "code": "CONFLICT", "message": "class_code đã tồn tại trong học kỳ" } }` | required |
| Quản trị hệ thống | Cập nhật các trường được phép sửa của lớp | /api/classes/{id} | PUT | `{ "class_code": "INT3401-01", "lecturer_name": "Giảng viên B", "max_capacity": 60, "schedules": [ { "day_of_week": 3, "start_period": 4, "end_period": 6, "room": "A2-302" } ] }` | `200` `{ "status": "success", "data": { "id": 10, "class_code": "INT3401-01", "lecturer_name": "Giảng viên B", "max_capacity": 60 } }` | `409` `{ "status": "fail", "data": { "code": "SCHEDULE_LOCKED", "message": "Không thể sửa lịch học khi lớp đã có sinh viên đăng ký" } }` | required |
| Quản trị hệ thống | Hủy lớp học phần (không xóa vật lý) | /api/classes/{id} | DELETE | — | `200` `{ "status": "success", "data": {} }` | `409` `{ "status": "fail", "data": { "code": "CLASS_CANCELLED", "message": "Lớp học phần đã bị hủy" } }` | required |

## Thông tin tài khoản hiện tại

`POST /api/auth/login` chỉ trả `access_token`. Sau đăng nhập, frontend gọi `GET /api/auth/me` với token đó để lấy dữ liệu sau:

| Trường trong `data` | Kiểu dữ liệu | Ý nghĩa |
|---|---|---|
| `id` | integer | ID tài khoản hiện tại |
| `username` | string | Tên đăng nhập |
| `role` | string | `student` hoặc `admin` |
| `full_name` | string | Họ và tên |
| `student_code` | string hoặc null | Mã sinh viên; `null` với quản trị viên |
| `faculty` | string hoặc null | Khoa của người dùng |
| `major` | string hoặc null | Ngành học của người dùng |

Endpoint trả tài khoản gắn với JWT. Frontend dùng `faculty`, `major` để hiển thị tổng quan và lọc lớp theo ngành.

## Vòng đời xác thực

### JWT và phiên phía backend

JWT sử dụng HS256, gửi qua `Authorization: Bearer <access_token>`. Mọi API nghiệp vụ trừ login kiểm tra chữ ký, thuật toán, claim và phiên trong database trước khi phân quyền:

| Claim | Kiểu JSON | Kiểm tra |
|---|---|---|
| `sub` | string | ID người dùng nguyên dương ở dạng chuẩn, ví dụ `"1"`; khớp `auth_sessions.user_id` |
| `role` | string | `student` hoặc `admin`; khớp vai trò hiện tại trong `users`, không chỉ tin vai trò đã lưu trong JWT |
| `sid` | string | UUID của phiên còn tồn tại, chưa logout và chưa hết hạn |
| `iat` | number | Bắt buộc, không nằm trong tương lai; khớp `auth_sessions.created_at` ở độ chính xác giây |
| `exp` | number | Bắt buộc, sau `iat` và thời gian hiện tại chưa đến `exp`; khớp `auth_sessions.expires_at` ở độ chính xác giây |

Backend sử dụng cùng một mốc thời gian khi kiểm tra JWT và trạng thái phiên trong cơ sở dữ liệu, kể cả khi PostgreSQL chạy trên một máy khác. Một phiên được xem là còn hoạt động khi `logged_out_at IS NULL AND now < expires_at`; khi đã đến hoặc vượt quá thời điểm hết hạn, phiên không còn hoạt động. Hệ thống không cần tác vụ chạy nền để cập nhật trạng thái hết hạn của phiên.

Đối với sinh viên, `JWT_TTL` và `SESSION_TTL` mặc định là 20m và phải có cùng giá trị. Nếu không cấu hình `SESSION_TTL`, hệ thống sẽ sử dụng giá trị của `JWT_TTL`. Đối với quản trị viên, thời hạn JWT được cấu hình bằng `ADMIN_JWT_TTL`, mặc định là 8h.

Khi tạo phiên mới, hệ thống xác định thời điểm hết hạn (`expires_at`) dựa trên thời điểm tạo phiên (`created_at`) và thời hạn tương ứng với vai trò của người dùng. Nếu cấu hình thời hạn được thay đổi, các phiên đã tạo trước đó vẫn giữ nguyên thời điểm hết hạn ban đầu.

Thời gian chờ trước khi đăng nhập lại được cấu hình bằng `LOGIN_COOLDOWN`, mặc định là 20m. Hệ thống sử dụng giá trị cấu hình hiện tại để kiểm tra thời gian chờ khi người dùng đăng nhập.

### Login: kiểm tra mật khẩu → phiên hoạt động → cooldown

1. Kiểm tra username/password trước khi xét trạng thái phiên. Sai username hay sai password đều trả cùng một response:

   ```json
   { "status": "fail", "data": { "code": "INVALID_CREDENTIALS", "message": "Sai tên đăng nhập hoặc mật khẩu" } }
   ```

2. Khi thông tin hợp lệ, backend khóa dòng `users`, đọc phiên gần nhất theo `created_at`, kiểm tra và tạo phiên trong cùng transaction. Mỗi sinh viên chỉ có một phiên hoạt động trên mọi thiết bị/trình duyệt/tab. Nếu còn phiên hoạt động, trả `409`, giữ nguyên phiên và `expires_at`, không cấp token mới:

   ```json
   { "status": "fail", "data": { "code": "ALREADY_LOGGED_IN", "message": "Tài khoản đang đăng nhập trên một phiên khác" } }
   ```

3. Nếu phiên đã kết thúc, mốc được login lại là `COALESCE(logged_out_at, expires_at) + LOGIN_COOLDOWN` của phiên gần nhất. Chưa đến mốc này thì trả `429`, header `Retry-After` và dữ liệu:

   ```json
   { "status": "fail", "data": { "code": "LOGIN_COOLDOWN", "message": "Tài khoản đang trong thời gian chờ đăng nhập lại", "retry_after": 720, "login_allowed_at": "2026-10-26T03:25:00Z" } }
   ```

   `Retry-After: 720` và `data.retry_after` đều cho biết số giây còn chờ trước khi được đăng nhập lại, giá trị này được làm tròn lên. `data.login_allowed_at` là thời điểm RFC 3339 theo backend. Ví dụ, nếu sinh viên đăng xuất lúc 10:05 và thử đăng nhập lúc 10:13, với thời gian chờ mặc định 20 phút, sinh viên còn phải chờ 12 phút và có thể đăng nhập lại từ 10:25. Nếu phiên tự hết hạn lúc 10:20, sinh viên có thể đăng nhập lại từ 10:40.

4. Không có phiên trước hoặc đã hết cooldown: tạo phiên với `sid` mới và trả `200`, `data` chỉ chứa `access_token`. Frontend gọi `GET /api/auth/me` để lấy tài khoản và điều hướng theo vai trò. Đối với quản trị viên, hệ thống không giới hạn số phiên đăng nhập và không áp dụng thời gian chờ đăng nhập lại. Mỗi lần đăng nhập sẽ tạo một phiên mới. Khi đăng xuất, hệ thống chỉ kết thúc phiên tương ứng với JWT đang sử dụng.

### Logout và hết hạn

- `POST /api/auth/logout` lấy `sid` từ JWT đã xác thực. Nếu phiên vẫn còn hoạt động, hệ thống ghi nhận thời điểm đăng xuất vào `logged_out_at`. Giá trị này chỉ được ghi một lần. Bản ghi phiên không bị xóa và `expires_at` không thay đổi. Sau khi đăng xuất thành công, JWT cũ không còn được chấp nhận. API trả về `200` với `data: {}`.
- JWT hết hạn trả `401 UNAUTHORIZED`; JWT còn hạn nhưng phiên đã logout hoặc hết hạn trong database trả `401 SESSION_REVOKED`. Gọi lại logout không ghi lại thời điểm kết thúc và không kéo dài cooldown.
- Phiên tự hết hạn giữ `logged_out_at = NULL`. Đóng tab không phải logout: phiên tiếp tục tới `expires_at`.
- Bảng `auth_sessions` có đúng năm cột: `id`, `user_id`, `created_at`, `expires_at`, `logged_out_at`, kèm chỉ mục (`user_id`, `created_at`).

### Phiên và lỗi phía frontend

- Token và trạng thái chỉ xem lưu trong `sessionStorage` của tab; nếu storage không khả dụng thì chỉ giữ trong bộ nhớ. Reload kiểm tra `exp` trước: token đã hết hạn hoặc không đọc được hạn bị xóa cục bộ, không gửi `/api/auth/me`; token còn hạn phải được xác thực lại bằng `/api/auth/me`.
- Bộ hẹn giờ được đặt ngay khi nhận token, kể cả khi `/api/auth/me` còn đang chờ, cho cả sinh viên và admin. Frontend kiểm tra lại khi cửa sổ nhận `focus`, trang được khôi phục (`pageshow`) hoặc tab chuyển sang hiển thị (`visibilitychange`). Hết hạn xóa token, tài khoản và trạng thái chỉ xem; yêu cầu login còn chờ được hủy, giao diện trở về login. Các quyết định cho phép truy cập vẫn do backend kiểm tra.
- Trước request có token, frontend kiểm tra hạn; token hết hạn không được gửi tiếp. `401` của request dùng token hiện tại cũng xóa phiên. Phản hồi cũ, timer cũ hoặc yêu cầu bị thay thế không được ghi đè/xóa một phiên đăng nhập mới.
- `409 ALREADY_LOGGED_IN` hiển thị thông báo tài khoản còn phiên hoạt động, không tạo countdown cooldown và không tác động phiên đang dùng ở thiết bị khác. `429 LOGIN_COOLDOWN` hiển thị countdown theo `retry_after`, lưu riêng theo username trong `sessionStorage`, giữ qua reload và cập nhật khi quay lại tab. Đổi username không bị khóa theo cooldown của tài khoản khác; countdown chỉ phục vụ hiển thị, backend luôn kiểm tra lại.
- Nếu xảy ra lỗi mạng khi frontend xác thực lại token còn hạn, giao diện hiển thị tùy chọn thử lại. Frontend không tự coi đây là đăng xuất thành công hoặc xóa phiên chỉ vì lỗi mạng. Bộ hẹn giờ hết hạn vẫn hoạt động trong thời gian chờ thử lại hoặc khi trang hiển thị thông báo lỗi mạng.

## Route kỹ thuật

| Phương thức | Đường dẫn | Xác thực | Kết quả |
|---|---|---|---|
| GET | `/health` | Không yêu cầu | `200` `{ "status": "success", "data": {} }`; phục vụ healthcheck backend, không truy vấn kiểm tra cơ sở dữ liệu |
| GET | `/swagger/*any` | Không yêu cầu | Swagger UI tại `/swagger/index.html`, tài liệu JSON tại `/swagger/doc.json` và các tài nguyên liên quan; không dùng envelope nghiệp vụ |

Các route này được cung cấp bởi backend. Khi chạy bằng Docker Compose với nginx frontend, nginx chỉ chuyển tiếp các yêu cầu có đường dẫn `/api/` đến backend. Vì vậy, để truy cập Swagger trong môi trường này, cần sử dụng cổng backend. Với cấu hình Render trong thư mục `deployment/`, frontend và backend được phục vụ qua cùng một Web Service nên Swagger có thể được truy cập trên cùng domain với giao diện.

## Mã lỗi

| Mã lỗi | HTTP | Khi nào xảy ra |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Dữ liệu sai định dạng, thiếu tham số, gửi trường không được phép, hoặc thời gian không hợp lệ |
| `UNAUTHORIZED` | 401 | Chưa đăng nhập, thiếu token, token sai chữ ký, hết hạn JWT, claim không hợp lệ hoặc `role` trong JWT không khớp vai trò hiện tại |
| `INVALID_CREDENTIALS` | 401 | Sai username hoặc password |
| `ALREADY_LOGGED_IN` | 409 | Đúng thông tin đăng nhập nhưng tài khoản sinh viên đang có một phiên hoạt động trên thiết bị hoặc tab bất kỳ; không tạo phiên khác |
| `LOGIN_COOLDOWN` | 429 | Đúng thông tin đăng nhập nhưng chưa qua `LOGIN_COOLDOWN` (mặc định 20 phút) kể từ lúc phiên gần nhất kết thúc; có `Retry-After`, `data.retry_after` và `data.login_allowed_at` |
| `SESSION_REVOKED` | 401 | Token còn đúng chữ ký nhưng phiên tương ứng đã chủ động đăng xuất hoặc không còn hoạt động (hết hạn trong database) |
| `FORBIDDEN` | 403 | Đã đăng nhập nhưng không đủ quyền |
| `NOT_FOUND` | 404 | Tài nguyên không tồn tại, không thuộc người dùng hiện tại hoặc `{id}` trong đường dẫn không phải số |
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
| `INTERNAL_ERROR` | 500 | Lỗi không lường trước, không trả chi tiết nội bộ |

## Ghi chú

- Frontend dựa vào `data.code` để xác định cách xử lý lỗi. `data.message` dùng để hiển thị thông báo cho người dùng.
- Mọi endpoint nghiệp vụ trừ login cần `Authorization: Bearer <access_token>` và có thể trả `UNAUTHORIZED`, `SESSION_REVOKED`, `FORBIDDEN`, `INTERNAL_ERROR`.
- `POST /api/registrations`: body chỉ nhận `class_ids`, gồm 1 đến 20 ID lớp dương và không trùng nhau. Sai định dạng, danh sách rỗng, quá 20 lớp hoặc có ID trùng thì cả yêu cầu bị từ chối với `400 VALIDATION_ERROR` và không lớp nào được xử lý. Người dùng không phải sinh viên nhận `403 FORBIDDEN`, nhưng chỉ khi body hợp lệ.
- `POST /api/registrations` xử lý các lớp lần lượt theo thứ tự trong `class_ids`, mỗi lớp trong một transaction riêng. Lớp hợp lệ có `status: "registered"` kèm `id`, `registered_at`; lớp bị từ chối có `status: "failed"` kèm `code`, `message` và không ảnh hưởng lớp khác. Trùng lịch và giới hạn tín chỉ tính cả các lớp vừa ghi nhận trong cùng yêu cầu, nên thứ tự gửi quyết định lớp nào được ưu tiên.
- Nếu yêu cầu có định dạng hợp lệ, API vẫn trả về `200` ngay cả khi không có lớp nào đăng ký thành công (`registered_count = 0`). Trạng thái đăng ký của từng lớp được thể hiện trong `results[].status`, không chỉ dựa vào mã HTTP.
- `results[].code` có thể là: `NOT_FOUND`, `CLASS_CANCELLED`, `CLASS_FULL`, `REGISTRATION_CLOSED`, `ALREADY_REGISTERED`, `SCHEDULE_CONFLICT`, `PREREQUISITE_NOT_MET`, `CREDIT_LIMIT_EXCEEDED`, `INTERNAL_ERROR`. Ý nghĩa như bảng trên, nhưng nằm trong `results` và không kèm HTTP 4xx.
- `DELETE /api/registrations/{id}` có thể trả: `NOT_FOUND`, `REGISTRATION_NOT_ACTIVE`, `REGISTRATION_CLOSED`.
- `PUT /api/classes/{id}` có thể trả: `CLASS_CANCELLED`, `CAPACITY_BELOW_ENROLLED`, `SCHEDULE_LOCKED`, `CONFLICT`, `VALIDATION_ERROR`.
- `GET /api/classes` trả về các lớp có trạng thái `active` thuộc học kỳ hiện tại. Học kỳ hiện tại được xác định là học kỳ có `registration_opens_at` gần nhất nhưng không muộn hơn thời điểm xử lý request. Query `faculty` và `major` là tùy chọn.
- Mỗi phần tử `classes[]` có `lecturer_name` để hiển thị cột Giảng viên trên trang Đăng ký học phần, không cần tải chi tiết từng lớp.
- `data.semester.registration_open` của `GET /api/classes` là `true` khi thời điểm xử lý request nằm trong `[registration_opens_at, registration_closes_at]` (tính cả hai thời điểm đầu và cuối); không có ở `classes[]` hay chi tiết lớp. Frontend dùng để khóa/mở thao tác, backend vẫn kiểm tra lại khi đăng ký/hủy. Khi `false`, danh sách lớp vẫn được trả để tra cứu.
- `GET /api/classes/{id}` trả thêm `faculty` (khoa của học phần), `major` (ngành của học phần; `null` với học phần chung của nhiều ngành), `semester_name` và `prerequisites` (các học phần tiên quyết, sắp theo `course_code`; mảng rỗng nếu không có). `passed` trong mỗi phần tử chỉ có khi người gọi là sinh viên: `true` nếu sinh viên đó đã đạt học phần (`course_results.passed`), `false` nếu chưa; quản trị viên không nhận `passed`. Đây chỉ là thông tin tham khảo; việc kiểm tra tiên quyết khi đăng ký vẫn do `POST /api/registrations` thực hiện.
- `GET /api/classes` trả thêm `data.semester`: học kỳ hiện tại mà các lớp thuộc về (`id`, `name`, `max_credits`, `registration_opens_at`, `registration_closes_at`, `registration_open`). Client dùng để hiển thị đợt đăng ký và mức tín chỉ tối đa. `semester` là `null` và `classes` rỗng khi chưa có học kỳ nào mở đăng ký. `semester` không phụ thuộc bộ lọc `faculty`, `major`, nên vẫn có khi bộ lọc không khớp lớp nào.
- `MAX_CREDITS` là cấu hình runtime tùy chọn, số nguyên dương tối đa 2147483647. Khi được đặt, API dùng giá trị này thay giới hạn lưu trong từng học kỳ cho cả `data.semester.max_credits` và kiểm tra `CREDIT_LIMIT_EXCEEDED`; bỏ trống thì dùng database. Không cập nhật cột `semesters.max_credits` hoặc yêu cầu seed lại khi đổi cấu hình.
- Form tạo lớp lấy `data.semester.id` làm `semester_id` và chỉ hiển thị tên học kỳ ở trường chỉ đọc; chưa cho gửi khi đang tải, tải lỗi hoặc `semester` là `null`. Form sửa lớp hiển thị học kỳ của chính lớp.
- `POST /api/classes`: `class_code` duy nhất trong học kỳ. `course_id`, `semester_id` phải tồn tại.
- `PUT /api/classes/{id}`: không đổi `course_id`, `semester_id`. `max_capacity` không nhỏ hơn `enrolled`. Khi `enrolled > 0` không sửa được `schedules`.
- `DELETE /api/classes/{id}`: giữ bản ghi lớp với `status = cancelled`, xóa vật lý toàn bộ đăng ký của lớp và đặt `enrolled = 0` trong cùng transaction.
- `DELETE /api/registrations/{id}`: chỉ hủy đăng ký của chính mình trong thời gian đăng ký; xóa vật lý bản ghi và giảm `enrolled` của lớp trong cùng transaction. Đăng ký lại tạo bản ghi với `id` và `registered_at` mới.
- Hai endpoint DELETE trên trả `200` với `data: {}` khi hủy thành công.
- `GET /api/registrations` và `GET /api/schedules` trả đăng ký còn tồn tại và lịch học tương ứng của chính sinh viên, trên tất cả học kỳ. Mỗi phần tử `registrations[]` gồm `id`, `class_id`, thông tin lớp/học phần và `registered_at`. `results[].status` trong response POST là `registered` hoặc `failed`, chỉ biểu thị kết quả xử lý từng lớp. Client tự lọc theo học kỳ nếu cần.
