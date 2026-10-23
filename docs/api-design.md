# Thiết kế API (Phase 1)

Tài liệu này cụ thể hóa SRS §5.2 cho Phase 1. Nếu có mâu thuẫn, SRS là căn cứ. Schema lấy từ `database.dbml`, không thay đổi trong tài liệu này.

## Bảng endpoint

| Feature | Mô tả | Endpoint | Method | Request Body | Response Body | Response Fail | Auth |
|---|---|---|---|---|---|---|---|
| Xác thực và người dùng | Đăng nhập | /api/auth/login | POST | `{ "username": "sv001", "password": "<password>" }` | `200` `{ "status": "success", "data": { "access_token": "<jwt>" } }` | `401` `{ "status": "fail", "data": { "code": "INVALID_CREDENTIALS", "message": "Sai tên đăng nhập hoặc mật khẩu" } }` | none |
| Xác thực và người dùng | Đăng xuất và thu hồi phiên | /api/auth/logout | POST | — | `200` `{ "status": "success", "data": {} }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Xác thực và người dùng | Lấy thông tin người dùng hiện tại | /api/auth/me | GET | — | `200` `{ "status": "success", "data": { "id": 7, "username": "sv001", "role": "student", "full_name": "Nguyễn Văn A", "student_code": "SV001" } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Quản lý sinh viên | Xem thông tin sinh viên (chính mình hoặc admin) | /api/students/{id} | GET | — | `200` `{ "status": "success", "data": { "id": 7, "username": "sv001", "full_name": "Nguyễn Văn A", "student_code": "SV001", "faculty": "CNTT", "major": "Khoa học máy tính" } }` | `403` `{ "status": "fail", "data": { "code": "FORBIDDEN", "message": "Bạn không có quyền truy cập dữ liệu này" } }` | required |
| Quản lý sinh viên | Cập nhật sinh viên (chính mình hoặc admin) | /api/students/{id} | PUT | `{ "full_name": "Nguyễn Văn A", "faculty": "CNTT", "major": "Khoa học máy tính" }` | `200` `{ "status": "success", "data": { "id": 7, "full_name": "Nguyễn Văn A", "student_code": "SV001", "faculty": "CNTT", "major": "Khoa học máy tính" } }` | `400` `{ "status": "fail", "data": { "code": "VALIDATION_ERROR", "message": "Trường không được phép cập nhật: student_code" } }` | required |
| Tra cứu lớp học phần | Lấy danh sách lớp học phần đang mở | /api/classes | GET | — | `200` `{ "status": "success", "data": { "classes": [ { "id": 10, "class_code": "INT3401-01", "course_code": "INT3401", "course_name": "Hệ điều hành", "credits": 3, "enrolled": 42, "max_capacity": 50, "registration_open": true } ] } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Tra cứu lớp học phần | Chi tiết lớp học phần | /api/classes/{id} | GET | — | `200` `{ "status": "success", "data": { "id": 10, "course_id": 5, "course_code": "INT3401", "course_name": "Hệ điều hành", "credits": 3, "semester_id": 2, "class_code": "INT3401-01", "lecturer_name": "Giảng viên A", "max_capacity": 50, "enrolled": 42, "status": "active", "registration_open": true, "schedules": [ { "day_of_week": 2, "start_period": 1, "end_period": 3, "room": "A2-301" } ] } }` | `404` `{ "status": "fail", "data": { "code": "NOT_FOUND", "message": "Không tìm thấy dữ liệu" } }` | required |
| Đăng ký học phần và thời khóa biểu | Đăng ký lớp học phần cho tài khoản hiện tại | /api/registrations | POST | `{ "class_id": 10 }` | `201` `{ "status": "success", "data": { "id": 301, "class_id": 10, "status": "registered", "registered_at": "2026-10-21T09:00:00+07:00" } }` | `409` `{ "status": "fail", "data": { "code": "CLASS_FULL", "message": "Lớp học phần đã đủ sĩ số" } }` | required |
| Đăng ký học phần và thời khóa biểu | Xem toàn bộ học phần đã đăng ký của mình | /api/registrations | GET | — | `200` `{ "status": "success", "data": { "registrations": [ { "id": 301, "class_id": 10, "class_code": "INT3401-01", "course_code": "INT3401", "course_name": "Hệ điều hành", "credits": 3, "status": "registered", "registered_at": "2026-10-21T09:00:00+07:00" } ] } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Đăng ký học phần và thời khóa biểu | Hủy đăng ký của mình; `{id}` là `registrations.id` | /api/registrations/{id} | DELETE | — | `200` `{ "status": "success", "data": { "id": 301, "status": "cancelled" } }` | `404` `{ "status": "fail", "data": { "code": "NOT_FOUND", "message": "Không tìm thấy đăng ký của bạn" } }` | required |
| Đăng ký học phần và thời khóa biểu | Thời khóa biểu của mình | /api/schedules | GET | — | `200` `{ "status": "success", "data": { "schedules": [ { "class_id": 10, "class_code": "INT3401-01", "course_code": "INT3401", "course_name": "Hệ điều hành", "day_of_week": 2, "start_period": 1, "end_period": 3, "room": "A2-301" } ] } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Quản trị hệ thống | Tạo lớp học phần kèm lịch học | /api/classes | POST | `{ "course_id": 5, "semester_id": 2, "class_code": "INT3401-01", "lecturer_name": "Giảng viên A", "max_capacity": 50, "schedules": [ { "day_of_week": 2, "start_period": 1, "end_period": 3, "room": "A2-301" } ] }` | `201` `{ "status": "success", "data": { "id": 10, "class_code": "INT3401-01", "status": "active", "enrolled": 0 } }` | `409` `{ "status": "fail", "data": { "code": "CONFLICT", "message": "class_code đã tồn tại trong học kỳ" } }` | required |
| Quản trị hệ thống | Cập nhật các trường được phép sửa của lớp | /api/classes/{id} | PUT | `{ "class_code": "INT3401-01", "lecturer_name": "Giảng viên B", "max_capacity": 60, "schedules": [ { "day_of_week": 3, "start_period": 4, "end_period": 6, "room": "A2-302" } ] }` | `200` `{ "status": "success", "data": { "id": 10, "class_code": "INT3401-01", "lecturer_name": "Giảng viên B", "max_capacity": 60 } }` | `409` `{ "status": "fail", "data": { "code": "SCHEDULE_LOCKED", "message": "Không thể sửa lịch học khi lớp đã có sinh viên đăng ký" } }` | required |
| Quản trị hệ thống | Hủy lớp học phần (không xóa vật lý) | /api/classes/{id} | DELETE | — | `200` `{ "status": "success", "data": { "id": 10, "status": "cancelled" } }` | `409` `{ "status": "fail", "data": { "code": "CLASS_CANCELLED", "message": "Lớp học phần đã bị hủy" } }` | required |
| Quản trị hệ thống | Cập nhật thời gian đăng ký cho học kỳ | /api/registration-period | PUT | `{ "semester_id": 2, "registration_opens_at": "2026-11-01T00:00:00+07:00", "registration_closes_at": "2026-11-14T23:59:59+07:00" }` | `200` `{ "status": "success", "data": { "semester_id": 2, "registration_opens_at": "2026-11-01T00:00:00+07:00", "registration_closes_at": "2026-11-14T23:59:59+07:00" } }` | `400` `{ "status": "fail", "data": { "code": "VALIDATION_ERROR", "message": "Thời gian đóng đăng ký phải sau thời gian mở đăng ký" } }` | required |

## Mã lỗi

| Mã lỗi | HTTP | Khi nào xảy ra |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Dữ liệu sai định dạng, thiếu tham số, gửi trường không được phép, hoặc thời gian không hợp lệ |
| `UNAUTHORIZED` | 401 | Chưa đăng nhập, thiếu token, hoặc token sai chữ ký |
| `INVALID_CREDENTIALS` | 401 | Sai username hoặc password |
| `SESSION_REVOKED` | 401 | Token đúng nhưng phiên đã bị thu hồi (đã đăng xuất) hoặc đã hết hạn |
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
- Mọi endpoint trừ login cần header `Authorization: Bearer <access_token>` và có thể trả `UNAUTHORIZED`, `SESSION_REVOKED`, `FORBIDDEN`, `INTERNAL_ERROR`. Phase 1 không có refresh token.
- `POST /api/registrations` có thể trả: `CLASS_CANCELLED`, `CLASS_FULL`, `REGISTRATION_CLOSED`, `ALREADY_REGISTERED`, `SCHEDULE_CONFLICT`, `PREREQUISITE_NOT_MET`, `CREDIT_LIMIT_EXCEEDED`.
- `DELETE /api/registrations/{id}` có thể trả: `NOT_FOUND`, `REGISTRATION_NOT_ACTIVE`, `REGISTRATION_CLOSED`.
- `PUT /api/classes/{id}` có thể trả: `CLASS_CANCELLED`, `CAPACITY_BELOW_ENROLLED`, `SCHEDULE_LOCKED`, `CONFLICT`, `VALIDATION_ERROR`.
- Login sai username hoặc password đều trả cùng một mã và message.
- `GET` và `PUT /api/students/{id}`: chỉ truy cập được tài khoản của chính mình. `PUT` chỉ nhận `full_name`, `faculty`, `major`.
- `GET /api/classes`: không nhận `semester_id`, luôn trả lớp `active` của học kỳ hiện tại (học kỳ có `registration_opens_at` mới nhất không sau thời điểm hiện tại). Query `faculty`, `major` là tùy chọn.
- `registration_open`: `true` khi thời điểm hiện tại nằm trong khoảng đăng ký của học kỳ, tức từ `registration_opens_at` đến `registration_closes_at`.
- `POST /api/classes`: `class_code` duy nhất trong học kỳ. `course_id`, `semester_id` phải tồn tại.
- `PUT /api/classes/{id}`: không đổi `course_id`, `semester_id`. `max_capacity` không nhỏ hơn `enrolled`. Khi `enrolled > 0` không sửa được `schedules`.
- `DELETE /api/classes/{id}`: hủy mềm. Các đăng ký `registered` của lớp chuyển sang `cancelled`, `enrolled = 0`.
- `DELETE /api/registrations/{id}`: chỉ hủy đăng ký của chính mình.
- Học kỳ, học phần và kết quả học tập không có API, lấy từ dữ liệu seed.
- `auth_sessions.refresh_token_hash` là NOT NULL nhưng Phase 1 không dùng.
