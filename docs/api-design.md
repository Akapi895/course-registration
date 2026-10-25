# Thiết kế API (Phase 1)

Tài liệu này cụ thể hóa SRS §5.2 cho Phase 1. Nếu có mâu thuẫn, SRS là căn cứ. Schema lấy từ `database.dbml`, không thay đổi trong tài liệu này.

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
| Xác thực và người dùng | Đăng nhập | /api/auth/login | POST | `{ "username": "sv001", "password": "<password>" }` | `200` `{ "status": "success", "data": { "access_token": "<jwt>" } }` | `401` `{ "status": "fail", "data": { "code": "INVALID_CREDENTIALS", "message": "Sai tên đăng nhập hoặc mật khẩu" } }` | none |
| Xác thực và người dùng | Đăng xuất và thu hồi phiên | /api/auth/logout | POST | — | `200` `{ "status": "success", "data": {} }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Xác thực và người dùng | Lấy thông tin người dùng hiện tại | /api/auth/me | GET | — | `200` `{ "status": "success", "data": { "id": 7, "username": "sv001", "role": "student", "full_name": "Nguyễn Văn A", "student_code": "SV001", "faculty": "CNTT", "major": "Khoa học máy tính" } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
| Tra cứu lớp học phần | Lấy danh sách lớp học phần đang hoạt động của học kỳ hiện tại | /api/classes | GET | — | `200` `{ "status": "success", "data": { "semester": { "id": 2, "name": "Học kỳ 1 năm học 2026-2027", "max_credits": 24, "registration_opens_at": "2026-10-13T00:00:00+07:00", "registration_closes_at": "2026-11-19T00:00:00+07:00", "registration_open": true }, "classes": [ { "id": 10, "class_code": "INT3401-01", "course_code": "INT3401", "course_name": "Hệ điều hành", "credits": 3, "enrolled": 42, "max_capacity": 50 } ] } }` | `401` `{ "status": "fail", "data": { "code": "UNAUTHORIZED", "message": "Chưa đăng nhập hoặc phiên không hợp lệ" } }` | required |
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

## Route kỹ thuật

| Phương thức | Đường dẫn | Xác thực | Kết quả |
|---|---|---|---|
| GET | `/health` | Không yêu cầu | `200` `{ "status": "success", "data": {} }`; phục vụ healthcheck backend, không truy vấn kiểm tra cơ sở dữ liệu |
| GET | `/swagger/*any` | Không yêu cầu | Swagger UI tại `/swagger/index.html`, tài liệu JSON tại `/swagger/doc.json` và các tài nguyên liên quan; không dùng envelope nghiệp vụ |

Các đường dẫn này truy cập trên backend. Proxy frontend hiện chỉ chuyển tiếp `/api/`, nên truy cập Swagger trực tiếp qua cổng backend.

## Mã lỗi

| Mã lỗi | HTTP | Khi nào xảy ra |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Dữ liệu sai định dạng, thiếu tham số, gửi trường không được phép, hoặc thời gian không hợp lệ |
| `UNAUTHORIZED` | 401 | Chưa đăng nhập, thiếu token, token sai chữ ký, hết hạn JWT hoặc claim không hợp lệ |
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
- Mọi endpoint nghiệp vụ trừ login cần header `Authorization: Bearer <access_token>` và có thể trả `UNAUTHORIZED`, `SESSION_REVOKED`, `FORBIDDEN`, `INTERNAL_ERROR` tùy trường hợp. Các route kỹ thuật không yêu cầu token. Phase 1 không có refresh token.
- `POST /api/registrations`: body chỉ nhận `class_ids`, gồm 1 đến 20 ID lớp dương và không trùng nhau. Sai định dạng, danh sách rỗng, quá 20 lớp hoặc có ID trùng thì cả yêu cầu bị từ chối với `400 VALIDATION_ERROR` và không lớp nào được xử lý. Người dùng không phải sinh viên nhận `403 FORBIDDEN`.
- `POST /api/registrations` xử lý các lớp lần lượt theo thứ tự trong `class_ids`, mỗi lớp trong một transaction riêng. Lớp đáp ứng điều kiện được ghi nhận (`status: "registered"`, kèm `id` và `registered_at`); lớp bị từ chối có `status: "failed"` kèm `code` và `message` mà không ảnh hưởng các lớp khác. Trùng lịch và giới hạn tín chỉ tính cả các lớp vừa được ghi nhận trước đó trong cùng yêu cầu, nên thứ tự gửi quyết định lớp nào được ưu tiên.
- Yêu cầu hợp lệ luôn trả `200`, kể cả khi mọi lớp bị từ chối (`registered_count = 0`). Kết quả từng lớp nằm trong `results[].status`; `registered_count` và `failed_count` là số lượng tổng hợp, không dựa vào HTTP status để biết kết quả từng lớp. Đăng ký thành công một phần vẫn được tính là hoàn tất cho các lớp đã ghi nhận.
- `results[].code` có thể là: `NOT_FOUND`, `CLASS_CANCELLED`, `CLASS_FULL`, `REGISTRATION_CLOSED`, `ALREADY_REGISTERED`, `SCHEDULE_CONFLICT`, `PREREQUISITE_NOT_MET`, `CREDIT_LIMIT_EXCEEDED`, `INTERNAL_ERROR`. Các mã này dùng cùng ý nghĩa với bảng trên nhưng nằm trong `results`, không đi kèm HTTP 4xx.
- `DELETE /api/registrations/{id}` có thể trả: `NOT_FOUND`, `REGISTRATION_NOT_ACTIVE`, `REGISTRATION_CLOSED`.
- `PUT /api/classes/{id}` có thể trả: `CLASS_CANCELLED`, `CAPACITY_BELOW_ENROLLED`, `SCHEDULE_LOCKED`, `CONFLICT`, `VALIDATION_ERROR`.
- Login sai username hoặc password đều trả cùng một mã và message.
- `GET /api/auth/me` trả thêm `faculty`, `major` (có thể `null`) để frontend hiển thị khoa/ngành và lọc lớp học phần. Không cung cấp hai endpoint hồ sơ `GET`, `PUT /api/students/{id}` trong phạm vi hiện tại.
- `GET /api/classes`: không nhận `semester_id`, luôn trả lớp `active` của học kỳ hiện tại (học kỳ có `registration_opens_at` mới nhất không sau thời điểm hiện tại). Query `faculty`, `major` là tùy chọn.
- `GET /api/classes` vẫn trả danh sách để tra cứu sau khi đóng đăng ký; `data.semester.registration_open = false` không đồng nghĩa lớp bị loại khỏi danh sách.
- `registration_open` chỉ xuất hiện tại `data.semester.registration_open` của `GET /api/classes`, không lặp trong `classes[]` hoặc response chi tiết lớp. Giá trị là `true` khi thời điểm backend xử lý request nằm trong khoảng từ `registration_opens_at` đến `registration_closes_at` (bao gồm hai đầu). Frontend dùng để hiển thị và khóa/mở thao tác theo thời gian; đây không phải kết quả đăng ký thành công. Backend vẫn kiểm tra lại thời gian và các điều kiện nghiệp vụ khi xử lý đăng ký/hủy.
- `GET /api/classes/{id}` trả thêm `faculty` (khoa của học phần), `major` (ngành của học phần; `null` với học phần chung của nhiều ngành), `semester_name` và `prerequisites` (các học phần tiên quyết, sắp theo `course_code`; mảng rỗng nếu không có). `passed` trong mỗi phần tử chỉ có khi người gọi là sinh viên: `true` nếu sinh viên đó đã đạt học phần (`course_results.passed`), `false` nếu chưa; quản trị viên không nhận `passed`. Đây chỉ là thông tin tham khảo; việc kiểm tra tiên quyết khi đăng ký vẫn do `POST /api/registrations` thực hiện.
- `GET /api/classes` trả thêm `data.semester`: học kỳ hiện tại mà các lớp thuộc về (`id`, `name`, `max_credits`, `registration_opens_at`, `registration_closes_at`, `registration_open`). Client dùng để hiển thị khung đợt đăng ký và mức tín chỉ tối đa. `semester` là `null` và `classes` rỗng khi chưa có học kỳ nào mở đăng ký. `semester` không phụ thuộc bộ lọc `faculty`, `major`, nên vẫn có khi bộ lọc không khớp lớp nào.
- Frontend tự lấy `data.semester.id` làm `semester_id` khi tạo lớp hoặc cấu hình thời gian đăng ký của học kỳ hiện tại; chỉ hiển thị tên học kỳ ở trường chỉ đọc, không yêu cầu admin nhập ID. Khi đang tải, tải lỗi hoặc `semester` là `null`, chưa cho gửi các form này. Form sửa lớp hiển thị học kỳ từ chi tiết lớp, không thay bằng học kỳ hiện tại. Không dùng tham số URL để ghi đè học kỳ.
- `POST /api/classes`: `class_code` duy nhất trong học kỳ. `course_id`, `semester_id` phải tồn tại.
- `PUT /api/classes/{id}`: không đổi `course_id`, `semester_id`. `max_capacity` không nhỏ hơn `enrolled`. Khi `enrolled > 0` không sửa được `schedules`.
- `DELETE /api/classes/{id}`: hủy mềm. Các đăng ký `registered` của lớp chuyển sang `cancelled`, `enrolled = 0`.
- `DELETE /api/registrations/{id}`: chỉ hủy đăng ký của chính mình.
- Hai endpoint DELETE trên trả `200` với `{ "status": "success", "data": {} }` khi hủy thành công, không trả lại `data.id` hoặc `data.status`. ID đối tượng đã có trong request; trạng thái hủy được lưu ở cơ sở dữ liệu, các response đọc vẫn giữ trường trạng thái nghiệp vụ khi có.
- `GET /api/registrations` và `GET /api/schedules` trả đăng ký đang hiệu lực và lịch học tương ứng của chính sinh viên, trên tất cả học kỳ; không nhận ID sinh viên đích. Client tự lọc theo học kỳ nếu cần.
- Không có API danh mục học kỳ, học phần hoặc kết quả học tập; các dữ liệu này lấy từ seed. `PUT /api/registration-period` chỉ cấu hình thời gian đăng ký của học kỳ đã tồn tại.
- `auth_sessions.refresh_token_hash` là NOT NULL; khi đăng nhập backend lưu SHA-256 của chuỗi ngẫu nhiên không trả cho client để đáp ứng schema. Phase 1 không dùng giá trị này trong một luồng refresh token.
