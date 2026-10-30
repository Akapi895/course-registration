# Thiết kế API

Tài liệu này cụ thể hóa SRS §5.2. Schema lấy từ `diagrams/erd/database.dbml` và được mô tả trong `database-design.md`.

## Phạm vi và phân quyền

Có 12 endpoint nghiệp vụ (tính theo cặp phương thức và đường dẫn), khớp với router và Swagger. `/health` và `/swagger/*any` là route kỹ thuật, không nằm trong số này.

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

Mọi API trừ đăng nhập cần header `Authorization: Bearer <access_token>`, với token hợp lệ và phiên còn hiệu lực. Quản trị viên không đăng ký hay hủy học phần thay sinh viên, và không gọi được các API đăng ký và thời khóa biểu.

## Đặc tả Request và Response

Quyền theo vai trò nằm ở bảng trên. Mọi endpoint trừ login cần token; thiếu token hoặc phiên không hợp lệ thì trả `401`:

```json
{
  "status": "fail",
  "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" }
}
```

Các response lỗi trong bảng chỉ là ví dụ; các mã lỗi khác ở phần Mã lỗi.

| Endpoint | Request | Response thành công | Response lỗi |
|---|---|---|---|
| POST `/api/auth/login`<br>Đăng nhập, không cần token | <pre>{"username": "student001", "password": "&lt;password&gt;"}</pre> | `200`<pre>{"status": "success", "data": {"access_token": "&lt;jwt&gt;"}}</pre> | `401 INVALID_CREDENTIALS`, `409 ALREADY_LOGGED_IN`, `429 LOGIN_COOLDOWN` (payload ở mục Vòng đời xác thực bên dưới) |
| POST `/api/auth/logout`<br>Đăng xuất và kết thúc phiên hiện tại | — | `200`<pre>{"status": "success", "data": {}}</pre> | `401` như trên |
| GET `/api/auth/me`<br>Lấy thông tin người dùng hiện tại. `student_code`, `faculty`, `major` là `null` với quản trị viên | — | `200`<pre>{<br>  "status": "success",<br>  "data": {<br>    "id": 7,<br>    "username": "sv001",<br>    "role": "student",<br>    "full_name": "Nguyễn Văn A",<br>    "student_code": "SV001",<br>    "faculty": "CNTT",<br>    "major": "Khoa học máy tính"<br>  }<br>}</pre> | `401` như trên |
| GET `/api/classes`<br>Lấy danh sách lớp học phần đang hoạt động của học kỳ hiện tại | — | `200`<pre>{<br>  "status": "success",<br>  "data": {<br>    "semester": {<br>      "id": 2,<br>      "name": "Học kỳ 1 năm học 2026-2027",<br>      "max_credits": 24,<br>      "registration_opens_at": "2026-10-13T00:00:00+07:00",<br>      "registration_closes_at": "2026-11-19T00:00:00+07:00",<br>      "registration_open": true<br>    },<br>    "classes": [<br>      {<br>        "id": 10,<br>        "class_code": "INT3401-01",<br>        "course_code": "INT3401",<br>        "course_name": "Hệ điều hành",<br>        "lecturer_name": "Giảng viên A",<br>        "credits": 3,<br>        "enrolled": 42,<br>        "max_capacity": 50<br>      }<br>    ]<br>  }<br>}</pre> | `401` như trên |
| GET `/api/classes/{id}`<br>Chi tiết lớp học phần | — | `200`<pre>{<br>  "status": "success",<br>  "data": {<br>    "id": 10,<br>    "course_id": 5,<br>    "course_code": "INT3401",<br>    "course_name": "Hệ điều hành",<br>    "credits": 3,<br>    "faculty": "Công nghệ thông tin",<br>    "major": "Khoa học máy tính",<br>    "semester_id": 2,<br>    "semester_name": "Học kỳ 1 năm học 2026-2027",<br>    "class_code": "INT3401-01",<br>    "lecturer_name": "Giảng viên A",<br>    "max_capacity": 50,<br>    "enrolled": 42,<br>    "status": "active",<br>    "schedules": [<br>      {<br>        "day_of_week": 2,<br>        "start_period": 1,<br>        "end_period": 3,<br>        "room": "A2-301"<br>      }<br>    ],<br>    "prerequisites": [<br>      {<br>        "course_id": 4,<br>        "course_code": "INT2211",<br>        "course_name": "Cơ sở dữ liệu",<br>        "passed": true<br>      }<br>    ]<br>  }<br>}</pre> | `404`<pre>{<br>  "status": "fail",<br>  "data": {<br>    "code": "NOT_FOUND",<br>    "message": "Không tìm thấy dữ liệu"<br>  }<br>}</pre> |
| POST `/api/registrations`<br>Đăng ký một hoặc nhiều lớp. Lớp hợp lệ được ghi nhận, lớp bị từ chối được báo lại trong `results` | <pre>{"class_ids": [10, 11, 12, 13, 14]}</pre> | `200`<pre>{<br>  "status": "success",<br>  "data": {<br>    "registered_count": 3,<br>    "failed_count": 2,<br>    "results": [<br>      {<br>        "class_id": 10,<br>        "status": "registered",<br>        "id": 301,<br>        "registered_at": "2026-10-21T09:00:00+07:00"<br>      },<br>      {<br>        "class_id": 11,<br>        "status": "registered",<br>        "id": 302,<br>        "registered_at": "2026-10-21T09:00:00+07:00"<br>      },<br>      {<br>        "class_id": 12,<br>        "status": "registered",<br>        "id": 303,<br>        "registered_at": "2026-10-21T09:00:00+07:00"<br>      },<br>      {<br>        "class_id": 13,<br>        "status": "failed",<br>        "code": "CLASS_FULL",<br>        "message": "Lớp học phần đã đủ sĩ số"<br>      },<br>      {<br>        "class_id": 14,<br>        "status": "failed",<br>        "code": "SCHEDULE_CONFLICT",<br>        "message": "Lớp bị trùng lịch với học phần đã đăng ký"<br>      }<br>    ]<br>  }<br>}</pre> | `400`<pre>{<br>  "status": "fail",<br>  "data": {<br>    "code": "VALIDATION_ERROR",<br>    "message": "Danh sách lớp bị trùng"<br>  }<br>}</pre> |
| GET `/api/registrations`<br>Xem toàn bộ học phần đã đăng ký của mình | — | `200`<pre>{<br>  "status": "success",<br>  "data": {<br>    "registrations": [<br>      {<br>        "id": 301,<br>        "class_id": 10,<br>        "class_code": "INT3401-01",<br>        "course_code": "INT3401",<br>        "course_name": "Hệ điều hành",<br>        "credits": 3,<br>        "registered_at": "2026-10-21T09:00:00+07:00"<br>      }<br>    ]<br>  }<br>}</pre> | `401` như trên |
| DELETE `/api/registrations/{id}`<br>Hủy đăng ký của mình (xóa vật lý bản ghi); `{id}` là `registrations.id` | — | `200`<pre>{"status": "success", "data": {}}</pre> | `404`<pre>{<br>  "status": "fail",<br>  "data": {<br>    "code": "NOT_FOUND",<br>    "message": "Không tìm thấy đăng ký của bạn"<br>  }<br>}</pre> |
| GET `/api/schedules`<br>Thời khóa biểu của mình | — | `200`<pre>{<br>  "status": "success",<br>  "data": {<br>    "schedules": [<br>      {<br>        "class_id": 10,<br>        "class_code": "INT3401-01",<br>        "course_code": "INT3401",<br>        "course_name": "Hệ điều hành",<br>        "day_of_week": 2,<br>        "start_period": 1,<br>        "end_period": 3,<br>        "room": "A2-301"<br>      }<br>    ]<br>  }<br>}</pre> | `401` như trên |
| POST `/api/classes`<br>Tạo lớp học phần kèm lịch học | <pre>{<br>  "course_id": 5,<br>  "semester_id": 2,<br>  "class_code": "INT3401-01",<br>  "lecturer_name": "Giảng viên A",<br>  "max_capacity": 50,<br>  "schedules": [<br>    {<br>      "day_of_week": 2,<br>      "start_period": 1,<br>      "end_period": 3,<br>      "room": "A2-301"<br>    }<br>  ]<br>}</pre> | `201`<pre>{<br>  "status": "success",<br>  "data": {<br>    "id": 10,<br>    "class_code": "INT3401-01",<br>    "status": "active",<br>    "enrolled": 0<br>  }<br>}</pre> | `409`<pre>{<br>  "status": "fail",<br>  "data": {<br>    "code": "CONFLICT",<br>    "message": "class_code đã tồn tại trong học kỳ"<br>  }<br>}</pre> |
| PUT `/api/classes/{id}`<br>Cập nhật các trường được phép sửa của lớp | <pre>{<br>  "class_code": "INT3401-01",<br>  "lecturer_name": "Giảng viên B",<br>  "max_capacity": 60,<br>  "schedules": [<br>    {<br>      "day_of_week": 3,<br>      "start_period": 4,<br>      "end_period": 6,<br>      "room": "A2-302"<br>    }<br>  ]<br>}</pre> | `200`<pre>{<br>  "status": "success",<br>  "data": {<br>    "id": 10,<br>    "class_code": "INT3401-01",<br>    "lecturer_name": "Giảng viên B",<br>    "max_capacity": 60<br>  }<br>}</pre> | `409`<pre>{<br>  "status": "fail",<br>  "data": {<br>    "code": "SCHEDULE_LOCKED",<br>    "message": "Không thể sửa lịch học khi lớp đã có sinh viên đăng ký"<br>  }<br>}</pre> |
| DELETE `/api/classes/{id}`<br>Hủy lớp học phần (không xóa vật lý bản ghi lớp) | — | `200`<pre>{"status": "success", "data": {}}</pre> | `409`<pre>{<br>  "status": "fail",<br>  "data": {<br>    "code": "CLASS_CANCELLED",<br>    "message": "Lớp học phần đã bị hủy"<br>  }<br>}</pre> |

## Vòng đời xác thực

### JWT

JWT ký HS256. Mọi API nghiệp vụ trừ login kiểm tra chữ ký, thuật toán, claim và phiên trong database trước khi phân quyền:

| Claim | Kiểu JSON | Kiểm tra |
|---|---|---|
| `sub` | string | ID người dùng nguyên dương ở dạng chuẩn, ví dụ `"1"`; khớp `auth_sessions.user_id` |
| `role` | string | `student` hoặc `admin`; khớp vai trò hiện tại trong `users`, không chỉ tin vai trò đã lưu trong JWT |
| `sid` | string | UUID của phiên còn tồn tại, chưa logout và chưa hết hạn |
| `iat` | number | Bắt buộc, không nằm trong tương lai; khớp `auth_sessions.created_at` ở độ chính xác giây |
| `exp` | number | Bắt buộc, sau `iat` và thời gian hiện tại chưa đến `exp`; khớp `auth_sessions.expires_at` ở độ chính xác giây |

TTL, cooldown, đăng xuất và xử lý phiên ở frontend: xem SRS §3.1.

### Đăng nhập

Thứ tự kiểm tra là mật khẩu, phiên hoạt động, cooldown. Hai bước sau chỉ áp dụng cho sinh viên.

1. Sai username hay sai password đều trả cùng một response, trước khi xét phiên:

   ```json
   { "status": "fail", "data": { "code": "INVALID_CREDENTIALS", "message": "Sai tên đăng nhập hoặc mật khẩu" } }
   ```

2. Còn phiên hoạt động thì trả `409`, giữ nguyên phiên cũ và `expires_at`, không cấp token mới:

   ```json
   { "status": "fail", "data": { "code": "ALREADY_LOGGED_IN", "message": "Tài khoản đang đăng nhập trên một phiên khác" } }
   ```

3. Đang trong cooldown thì trả `429`, header `Retry-After` và:

   ```json
   { "status": "fail", "data": { "code": "LOGIN_COOLDOWN", "message": "Tài khoản đang trong thời gian chờ đăng nhập lại", "retry_after": 720, "login_allowed_at": "2026-10-26T03:25:00Z" } }
   ```

   `Retry-After` và `data.retry_after` là số giây còn phải chờ, làm tròn lên. `data.login_allowed_at` là thời điểm được đăng nhập lại, theo RFC 3339.

4. Các trường hợp còn lại tạo phiên với `sid` mới và trả `200`, `data` chỉ có `access_token`.

## Route kỹ thuật

| Phương thức | Đường dẫn | Xác thực | Kết quả |
|---|---|---|---|
| GET | `/health` | Không yêu cầu | `200` `{ "status": "success", "data": {} }`; phục vụ healthcheck backend, không truy vấn kiểm tra cơ sở dữ liệu |
| GET | `/swagger/*any` | Không yêu cầu | Swagger UI tại `/swagger/index.html`, tài liệu JSON tại `/swagger/doc.json` và các tài nguyên liên quan; không dùng envelope nghiệp vụ |

Hai route này do backend cung cấp. Với Docker Compose, nginx chỉ chuyển tiếp `/api/` tới backend, nên Swagger phải mở qua cổng backend. Trên Render (cấu hình trong `deployment/`), frontend và backend chung một Web Service nên Swagger nằm cùng domain với giao diện.

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
