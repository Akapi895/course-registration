# Thiết kế cơ sở dữ liệu cho MVP

Thiết kế này dựa trên [SRS](srs.md) và quyết định dùng [PostgreSQL](adr/02-postgresql.md). SRS là nguồn yêu cầu chính; các lựa chọn dưới đây là cách triển khai, không thay thế hay sửa yêu cầu trong SRS.

Hệ thống có hai role: `student` và `admin`. Sinh viên thực hiện các thao tác của mình; admin quản lý toàn bộ dữ liệu nghiệp vụ. Giảng viên là thông tin hiển thị của lớp, do admin nhập, không có tài khoản hay role riêng.

## 1. Giữ lại những bảng nào?

Thiết kế dùng **8 bảng**. Mỗi bảng có một việc cụ thể:

| Bảng | Dùng để làm gì? | Căn cứ |
|---|---|---|
| `users` | Đăng nhập, lưu vai trò và thông tin cơ bản của sinh viên, admin | SRS 3.1, 3.4 |
| `semesters` | Phân biệt học kỳ, lưu thời gian đăng ký và giới hạn tín chỉ | SRS mục 4, quy tắc 2, 3, 5, 6 |
| `courses` | Lưu mã, tên, tín chỉ của học phần và dữ liệu lọc khoa/ngành | SRS 3.2; mục 4, quy tắc 4, 5, 6 |
| `course_prerequisites` | Lưu học phần nào yêu cầu phải đạt học phần nào trước | SRS mục 4, quy tắc 4; nghiệm thu số 5 |
| `course_results` | Lưu sinh viên đã đạt học phần nào để kiểm tra tiên quyết | SRS 2.3; mục 4, quy tắc 4 |
| `course_classes` | Lưu lớp mở trong từng kỳ, giảng viên và sĩ số | SRS 3.2, 3.5 |
| `class_schedules` | Lưu các buổi học của lớp để kiểm tra trùng lịch và trả thời khóa biểu | SRS 3.2, 3.3; mục 4, quy tắc 3 |
| `registrations` | Lưu sinh viên đang đăng ký lớp nào | SRS 3.3; mục 4, quy tắc 7 |

Thông tin sinh viên được lưu cùng tài khoản trong `users`; các cột riêng của sinh viên được phép để trống với admin. Lớp lưu tên giảng viên trong `lecturer_name`, không cần bảng danh mục giảng viên. Với phạm vi MVP, hai lựa chọn này giữ schema gọn và đủ dữ liệu để trả thông tin theo SRS.

`course_prerequisites` và `course_results` vẫn cần giữ. Ví dụ, học phần B yêu cầu đạt A: bảng thứ nhất lưu quan hệ B → A, bảng thứ hai cho biết sinh viên đã đạt A hay chưa. Hai bảng trả lời hai câu hỏi khác nhau; bỏ một bảng thì không đủ dữ liệu để kiểm tra yêu cầu tiên quyết.

## 2. Tài khoản và quyền truy cập

Mỗi tài khoản có một role: `student` hoặc `admin`. Admin có toàn quyền quản lý trong phạm vi hệ thống, gồm:

| Chức năng | Student | Admin |
|---|---|---|
| Đăng nhập, đăng xuất, xem `/api/auth/me` | Có | Có |
| Tra cứu danh sách và chi tiết lớp | Công khai | Công khai |
| Xem/cập nhật hồ sơ sinh viên | Các trường được phép của mình | Mọi hồ sơ sinh viên |
| Quản lý tài khoản | Không | Tạo, cập nhật, đặt lại mật khẩu; xóa khi không còn dữ liệu tham chiếu |
| Xem đăng ký và thời khóa biểu | Của mình | Của mọi sinh viên |
| Đăng ký/hủy học phần | Của mình | Thực hiện cho sinh viên được chọn |
| Quản lý lớp, lịch và tên giảng viên | Không | Có |
| Quản lý học phần và điều kiện tiên quyết | Không | Có |
| Quản lý dữ liệu đạt/chưa đạt dùng cho tiên quyết | Không | Có |
| Cấu hình học kỳ, thời gian, tín chỉ và ngoại lệ | Không | Có |

Toàn quyền quản lý là quyền thao tác trên mọi dữ liệu, vẫn phải bảo đảm ràng buộc hợp lệ: không vượt sĩ số, không xóa dữ liệu đang được tham chiếu, không sửa trực tiếp bộ đếm. Ngoại lệ tín chỉ tối thiểu phải được cấp rõ bằng cờ tương ứng; không mặc định miễn mọi điều kiện khi admin đăng ký thay sinh viên.

SRS mục 5.2 đã xác định các endpoint cơ bản. Các thao tác quản trị bổ sung theo quyết định toàn quyền của nhóm cần được mô tả trong contract API riêng, dùng route quản trị được bảo vệ bằng role `admin`. Endpoint sinh viên vẫn lấy chủ thể từ JWT; admin thao tác cho người khác qua luồng quản trị có ID sinh viên đích rõ ràng. Không sửa danh sách endpoint trong SRS.

JWT chứa `sub = users.id` và `role`. `{id}` trong `/api/students/{id}` cũng là `users.id`, nhưng chỉ trả hồ sơ nếu tài khoản có role `student`. Các cột `student_id` dưới đây đều tham chiếu tới `users.id` của sinh viên.

API hồ sơ dùng danh sách trường được phép cập nhật. Không cho sinh viên sửa `role`, `student_code`, `min_credits_exempt`, mật khẩu hay các trường nội bộ thông qua API này. Việc được xem/sửa một hồ sơ không đồng nghĩa được trả về toàn bộ dòng `users`; `password_hash` luôn bị loại khỏi response.

## 3. Cột và ràng buộc

Các cột được ghi `NULL` là không bắt buộc. Các cột còn lại là `NOT NULL`; khóa chính tự tăng dùng `bigserial`.

### `users`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | bigserial PK | Định danh chung của tài khoản |
| `username` | text UNIQUE | Tên đăng nhập |
| `password_hash` | text | Mật khẩu đã băm |
| `role` | text | `student`, `admin` |
| `full_name` | text | Họ tên của chủ tài khoản |
| `student_code` | text UNIQUE, NULL | Mã sinh viên; admin không có giá trị này |
| `faculty` | text, NULL | Khoa |
| `major` | text, NULL | Ngành của sinh viên |
| `min_credits_exempt` | boolean DEFAULT false | Ngoại lệ được admin cho phép đối với tín chỉ tối thiểu |
| `created_at` | timestamptz DEFAULT now() | Thời điểm tạo tài khoản |

Ràng buộc:

- `role IN ('student', 'admin')`.
- Với student, `student_code`, `faculty`, `major` phải có giá trị. Service kiểm tra thêm chuỗi không rỗng.
- Với admin, `student_code` phải là `NULL` và `min_credits_exempt` phải là `false`.

Cờ ngoại lệ là lựa chọn đơn giản cho MVP: có hiệu lực cho sinh viên đó cho đến khi admin thu hồi. Nó chỉ miễn mức tối thiểu, không miễn mức tối đa. Cách cấp ngoại lệ và thời điểm áp dụng mức tối thiểu cần được thống nhất ở mục 7.

### `semesters`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | bigserial PK | Học kỳ |
| `name` | text UNIQUE | Ví dụ: HK1 2026–2027 |
| `registration_opens_at` | timestamptz | Bắt đầu nhận đăng ký/hủy |
| `registration_closes_at` | timestamptz | Kết thúc nhận đăng ký/hủy |
| `min_credits` | int | Số tín chỉ tối thiểu |
| `max_credits` | int | Số tín chỉ tối đa |

CHECK: `registration_closes_at > registration_opens_at`, `min_credits >= 0`, `max_credits > 0`, `min_credits <= max_credits`.

Thời gian và số tín chỉ là dữ liệu cấu hình, không hardcode trong Go. Admin cấu hình các giá trị này; SRS chưa chỉ định endpoint cấu hình, nên contract cho thao tác đó cần được xác định khi thiết kế API. Công cụ cấu hình nội bộ có thể dùng trong MVP mà không tạo thêm bảng.

### `courses`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | bigserial PK | Học phần |
| `code` | text UNIQUE | Mã học phần |
| `name` | text | Tên học phần |
| `credits` | int | Số tín chỉ, CHECK `credits > 0` |
| `faculty` | text | Khoa phụ trách, dùng để lọc lớp |
| `major` | text, NULL | Nhãn ngành; `NULL` nếu là học phần dùng chung |

Đề xuất bộ lọc ngành trả về học phần thuộc ngành đó và học phần dùng chung. Đây là nhãn phục vụ tra cứu, không phải điều kiện hạn chế quyền đăng ký. Khoa/ngành dùng chuỗi thống nhất trong dữ liệu mẫu, chưa cần bảng danh mục riêng.

### `course_prerequisites`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `course_id` | bigint FK → courses.id | Học phần muốn đăng ký |
| `prerequisite_course_id` | bigint FK → courses.id | Học phần cần đạt trước |

PK ghép `(course_id, prerequisite_course_id)`; CHECK hai ID khác nhau. Một học phần có nhiều dòng thì phải đạt tất cả học phần tiên quyết đó. Khi nạp seed hoặc admin cập nhật, service kiểm tra không tạo vòng tiên quyết; chưa cần trigger riêng.

### `course_results`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `student_id` | bigint FK → users.id | Tài khoản sinh viên |
| `course_id` | bigint FK → courses.id | Học phần đã có kết quả |
| `passed` | boolean | Đạt/chưa đạt |

PK ghép `(student_id, course_id)`. Không có bản ghi hoặc `passed = false` đều chưa đủ điều kiện tiên quyết. Admin có thể quản lý dữ liệu đạt/chưa đạt từ nguồn tin cậy; seed dùng cho nghiệm thu. Không mở rộng thành hệ thống điểm thành phần và lịch sử thi lại.

### `course_classes`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | bigserial PK | Lớp học phần |
| `course_id` | bigint FK → courses.id | Học phần được mở |
| `semester_id` | bigint FK → semesters.id | Học kỳ |
| `lecturer_name` | text | Tên giảng viên phụ trách, do admin nhập |
| `class_code` | text | Mã lớp trong kỳ |
| `max_capacity` | int | Số chỗ tối đa, CHECK `> 0` |
| `enrolled` | int DEFAULT 0 | Số đăng ký hiện tại |

UNIQUE `(semester_id, class_code)` để có thể dùng lại mã lớp ở kỳ sau. CHECK `0 <= enrolled AND enrolled <= max_capacity`.

Service kiểm tra `lecturer_name` không rỗng. Đây là tên để hiển thị, không tham chiếu tài khoản. Tên của cùng một giảng viên có thể lặp ở nhiều lớp; admin thống nhất cách nhập tên trong dữ liệu.

`student_id` trong đăng ký/kết quả phải có role `student`. FK chỉ kiểm tra tài khoản tồn tại, không kiểm tra role. Cả service và đường nạp seed đều phải tuân theo điều kiện này. Admin chỉ đổi role khi dữ liệu liên quan vẫn hợp lệ; không chuyển sinh viên đang có đăng ký hoặc kết quả học phần thành admin.

`enrolled` là bộ đếm theo ADR-02. Nó chỉ khớp số bản ghi đăng ký nếu mọi thao tác thêm/hủy dùng cùng một transaction; CHECK không tự bảo đảm hai con số bằng nhau. Client không được gửi giá trị bộ đếm để cập nhật.

### `class_schedules`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | bigserial PK | Buổi học |
| `class_id` | bigint FK → course_classes.id | Lớp |
| `day_of_week` | smallint | 1 = thứ Hai, …, 7 = Chủ nhật |
| `start_period` | smallint | Tiết bắt đầu |
| `end_period` | smallint | Tiết kết thúc, có tính tiết này |
| `room` | text | Phòng học của buổi đó |

CHECK: `day_of_week BETWEEN 1 AND 7`, `start_period > 0`, `end_period >= start_period`. Một buổi học một tiết là hợp lệ. Ví dụ 1–3 gồm tiết 1, 2, 3; nó không trùng với buổi 4–6.

Hai buổi trùng khi cùng thứ và `start_a <= end_b AND start_b <= end_a`. Đề xuất lịch lặp theo tuần trong học kỳ; SRS chưa yêu cầu lịch bù/nghỉ theo từng ngày. Mỗi lớp có thể có nhiều buổi, mỗi buổi một phòng, nên không đặt một cột `room` chung trên lớp. Service tạo/cập nhật lớp và lịch trong cùng transaction, yêu cầu ít nhất một buổi học hợp lệ.

### `registrations`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | bigserial PK | `{id}` của API hủy đăng ký |
| `student_id` | bigint FK → users.id | Sinh viên giữ chỗ |
| `class_id` | bigint FK → course_classes.id | Lớp đã đăng ký |
| `created_at` | timestamptz DEFAULT now() | Thời điểm đăng ký |

UNIQUE `(student_id, class_id)` chặn đăng ký trùng lớp. Hủy là xóa bản ghi và giảm bộ đếm trong cùng transaction, nên sinh viên có thể đăng ký lại nếu còn chỗ và còn trong đợt.

Xóa lớp dùng `RESTRICT` nếu còn đăng ký, lịch của lớp dùng `ON DELETE CASCADE`. Đây là chính sách xóa đề xuất theo SRS 3.5: admin xóa được lớp chưa có sinh viên; lớp đã có sinh viên bị từ chối. Các FK khác giữ mặc định không cho xóa dữ liệu đang được tham chiếu.

## 4. Kiểm tra nghiệp vụ trong giao dịch

Đưa kiểm tra vào service không có nghĩa chạy kiểm tra trước rồi mới mở transaction. Nếu cùng một sinh viên gửi hai request vào hai lớp khác nhau, cả hai có thể cùng thấy tín chỉ còn đủ hoặc lịch chưa trùng.

Luồng đăng ký đề xuất:

1. Middleware xác thực JWT. Luồng sinh viên lấy ID từ token; luồng quản trị kiểm tra role `admin` và xác định ID sinh viên đích. Cả hai gọi cùng nghiệp vụ đăng ký, không có bản riêng bỏ qua kiểm tra.
2. Mở transaction ở mức `READ COMMITTED`, khóa dòng sinh viên trong `users` bằng `SELECT ... FOR UPDATE`. Các thao tác đăng ký/hủy của cùng sinh viên dùng chung khóa này.
3. Khóa chia sẻ dòng học kỳ và khóa cập nhật dòng lớp. Kiểm tra thời gian, dữ liệu lớp và lịch. Admin cập nhật lịch cũng phải khóa dòng lớp; cập nhật cấu hình phải khóa dòng học kỳ tương ứng.
4. Đọc lại đăng ký của sinh viên trong kỳ để kiểm tra trùng lịch, tiên quyết và tổng tín chỉ. Kiểm tra ngoại lệ tín chỉ tối thiểu theo chính sách được chốt ở mục 7.
5. Tăng sĩ số bằng `UPDATE ... WHERE enrolled < max_capacity RETURNING id`. Nếu không cập nhật được thì từ chối; nếu cập nhật được, tạo đăng ký.
6. Commit. Bất kỳ lỗi nào đều rollback cả bộ đếm và bản ghi đăng ký.

Hủy cũng khóa theo thứ tự sinh viên → học kỳ → lớp, kiểm tra chủ sở hữu hoặc quyền admin, thời gian và tín chỉ sau hủy rồi mới xóa bản ghi và giảm bộ đếm. Hai request hủy cùng một đăng ký chỉ được giảm sĩ số một lần. Admin thao tác cho sinh viên cũng khóa dòng của sinh viên đó, không khóa dòng tài khoản admin thay thế.

Với lớp đã có sinh viên, đề xuất từ chối thay đổi học phần, học kỳ và lịch để không làm sai các đăng ký trước đó. Sửa tên giảng viên được phép; tăng/giảm sức chứa chỉ hợp lệ nếu không thấp hơn sĩ số hiện tại. Tương tự, không thay đổi tín chỉ hoặc tiên quyết của học phần đang có đăng ký trong đợt nếu chưa có cách kiểm tra lại các đăng ký bị ảnh hưởng. Quyền quản trị đầy đủ không bỏ qua các điều kiện toàn vẹn này; chính sách cần thống nhất trong thiết kế API quản trị.

## 5. Đối chiếu với SRS

| Yêu cầu | Dữ liệu/cách thực hiện |
|---|---|
| 3.1: đăng nhập, đăng xuất, thông tin hiện tại | `users`, JWT và middleware. Logout MVP để client bỏ token; không cần bảng token thu hồi |
| 3.2: danh sách lớp mở, lọc, thông tin giảng viên/phòng/lịch/sĩ số | Join `course_classes`, `courses`, `semesters` và `class_schedules`; tên giảng viên lấy từ `lecturer_name`, lớp đang mở xác định theo thời gian đăng ký của kỳ |
| 3.3: đăng ký/hủy, danh sách đăng ký, thời khóa biểu | `registrations` và transaction ở mục 4; thời khóa biểu tính từ các lớp đã đăng ký trong kỳ |
| 3.4: xem/sửa thông tin sinh viên | Các dòng `users.role = 'student'`, kiểm tra role, chủ sở hữu và trường được phép sửa |
| 3.5: quản trị lớp và kiểm tra dữ liệu | `course_classes`, `class_schedules`, xác thực admin và chính sách xóa/cập nhật đã nêu |
| Quy tắc 1: không vượt sĩ số | UPDATE có điều kiện + CHECK; cùng transaction với đăng ký |
| Quy tắc 2: thời gian đăng ký/hủy | Cửa sổ thời gian trong `semesters`, kiểm tra bằng thời gian server |
| Quy tắc 3: không trùng lịch trong kỳ | Kiểm tra giao nhau của lịch, trong transaction đã khóa sinh viên |
| Quy tắc 4: đạt tiên quyết | `course_prerequisites` đối chiếu `course_results.passed` |
| Quy tắc 5: tín chỉ tối đa | Tổng tín chỉ các đăng ký trong kỳ, đọc dưới khóa sinh viên; so với `max_credits` |
| Quy tắc 6: tín chỉ tối thiểu và ngoại lệ | `min_credits`, `users.min_credits_exempt`; còn phải chốt thời điểm kiểm tra |
| Quy tắc 7: quyền sở hữu | Luồng sinh viên dùng `student_id` từ token; luồng admin kiểm tra quyền quản trị trước khi thao tác cho sinh viên đích |
| Quy tắc 8: dữ liệu lớp hợp lệ | Validation, FK, UNIQUE, CHECK và transaction cho lớp/lịch |

Các yêu cầu OpenAPI, Docker, HTTPS, phân tầng, graceful degradation và báo cáo tải thuộc API/triển khai, không cần thêm bảng. Các mốc 200 ms/500 ms phải được đo trong điều kiện tải thống nhất; schema không tự bảo đảm các mốc này.

Index khởi đầu: UNIQUE `(student_id, class_id)` đã phục vụ truy vấn theo sinh viên; thêm `registrations(class_id)`, `course_classes(semester_id)` và `class_schedules(class_id)`. PK ghép của tiên quyết/kết quả phục vụ truy vấn kiểm tra tương ứng. Chỉ thêm index khác khi có truy vấn thực tế cần nó.

## 6. Những bảng chưa cần tạo

| Bảng hoặc nhóm bảng | Lý do |
|---|---|
| `students`, `admins` riêng | Hồ sơ MVP có ít trường, dùng chung `users` và role là đủ |
| `teachers` | Chỉ cần tên giảng viên để hiển thị, không có tài khoản hay chức năng riêng |
| `roles`, `permissions`, `user_roles` | Hai role cố định, mỗi tài khoản một role; phân quyền bằng middleware/service |
| `faculties`, `majors` | Hiện chỉ phục vụ lọc và hiển thị; dùng nhãn text thống nhất |
| `rooms` | Chưa có yêu cầu quản lý phòng, chỉ cần tên phòng trên lịch |
| `timetables` | Là kết quả truy vấn đăng ký và lịch học |
| `settings` | Cấu hình cần thiết đã nằm trong `semesters` |
| `grades`, `exams`, lịch sử thi lại | Kiểm tra tiên quyết chỉ cần đạt/chưa đạt; dữ liệu gốc lấy từ nguồn tin cậy |
| Bảng lịch sử hủy, audit log, token blocklist | Chưa cần cho MVP đã thống nhất |

Gộp tiếp tiên quyết hoặc lịch học vào JSON/chuỗi sẽ giảm số bảng nhưng làm khó FK, kiểm tra và truy vấn. Giữ các bảng nhỏ này là cách tránh phức tạp trong code, chứ không phải thêm một hệ thống mới.

## 7. Những điểm còn phải thống nhất

Các điểm này là tham số/chính sách triển khai chưa được SRS xác định chi tiết. Việc chốt chúng không yêu cầu sửa SRS.

- **Tín chỉ tối thiểu kiểm tra lúc nào?** Nếu kiểm tra ngay sau từng lần đăng ký, sinh viên có thể không đăng ký được lớp đầu tiên. Cần thống nhất cách đăng ký tích lũy trong đợt, điều kiện sau hủy và cách xử lý khi đóng đợt. Không thể chỉ viết `SUM >= min_credits` cho mọi request rồi coi là đáp ứng quy tắc 6.
- **Ngoại lệ tín chỉ tối thiểu:** xác nhận admin cấp/thu hồi cờ `min_credits_exempt` qua công cụ cấu hình nào. Cờ này miễn tối thiểu cho đến khi thu hồi, không riêng một kỳ.
- **Dữ liệu mẫu:** chốt số tín chỉ min/max, thời gian mở/đóng, học phần tiên quyết và kết quả đạt/chưa đạt. Không mặc định 12/24 là quy định của SRS.
- **Lịch và chính sách quản trị:** xác nhận dùng tiết với hai đầu tính cả, lớp lưu một tên giảng viên phụ trách, chặn xóa lớp có đăng ký và chặn sửa lịch khi đã có sinh viên. Chốt contract cho các thao tác quản trị bổ sung, dùng chung service và transaction với luồng sinh viên.
- **Đăng ký hai lớp của cùng một học phần trong một kỳ:** SRS chưa nói rõ. UNIQUE hiện chỉ chặn trùng lớp; nếu muốn chặn trùng học phần thì xác nhận chính sách, rồi kiểm tra dưới cùng khóa sinh viên.

Thứ tự migration: `users`, `semesters`, `courses`, `course_prerequisites`, `course_results`, `course_classes`, `class_schedules`, `registrations`. Seed hai role `student`/`admin`, tên giảng viên trên lớp và các tình huống lớp đầy, còn một chỗ, trùng lịch, chưa đạt tiên quyết, vượt tín chỉ, có/không có ngoại lệ. Phần triển khai dùng `database/migrations/`; [DBML](database.dbml) dùng để xem quan hệ trên dbdiagram.
