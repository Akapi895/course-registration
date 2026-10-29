# TÀI LIỆU ĐẶC TẢ YÊU CẦU PHẦN MỀM (SRS)
## Hệ thống quản lý và đăng ký học phần

- **Dự án:** Hệ thống quản lý và đăng ký học phần
- **Frontend:** React, TypeScript (Vite)
- **Backend:** Go (Gin Framework)
- **Kiến trúc API:** RESTful API

## 1. Giới thiệu

### 1.1. Mục đích tài liệu

Tài liệu xác định các yêu cầu chức năng, quy tắc nghiệp vụ, yêu cầu phi chức năng, đặc tả API và yêu cầu kỹ thuật của hệ thống, làm cơ sở cho quá trình thiết kế, phát triển, kiểm thử và nghiệm thu.

### 1.2. Phạm vi hệ thống

Hệ thống cung cấp RESTful API phục vụ xác thực người dùng, tra cứu lớp học phần, đăng ký/hủy học phần, xem thời khóa biểu và quản trị lớp học phần.

Thông tin tài khoản hiện tại, gồm khoa và ngành, được đọc qua `GET /api/auth/me`. Thời gian đăng ký của học kỳ nằm trong dữ liệu seed.

### 1.3. Đối tượng sử dụng

- Sinh viên.
- Quản trị viên.

## 2. Mô tả tổng quan

### 2.1. Các nhóm người dùng

| Tác nhân | Mô tả | Chức năng chính |
|---|---|---|
| Sinh viên | Người dùng đăng ký học phần | Đăng nhập, tra cứu lớp, đăng ký/hủy học phần, xem thời khóa biểu |
| Quản trị viên | Người dùng quản trị hệ thống | Quản lý lớp học phần |

### 2.2. Ranh giới hệ thống

- Backend cung cấp RESTful API, xử lý nghiệp vụ và truy cập cơ sở dữ liệu.
- Cơ sở dữ liệu lưu trữ thông tin người dùng, sinh viên, lớp học phần, đăng ký, lịch học và các dữ liệu liên quan.
- Client giao tiếp với Backend thông qua RESTful API sử dụng HTTP/HTTPS; HTTPS được yêu cầu trong môi trường triển khai thực tế.
- Dữ liệu trao đổi giữa Client và Backend được định dạng JSON.
- Các API được định nghĩa và tài liệu hóa theo chuẩn OpenAPI (Swagger).
- Các endpoint được bảo vệ phải áp dụng xác thực và phân quyền phù hợp.

### 2.3. Giả định và phụ thuộc

- Dữ liệu người dùng và vai trò phải được quản lý hợp lệ.
- Dữ liệu học phần, lịch học, học phần tiên quyết và số tín chỉ phải có nguồn dữ liệu đáng tin cậy.
- Các thông số chưa xác định cần được thống nhất trước khi triển khai và nghiệm thu.

## 3. Yêu cầu chức năng

### 3.1. Xác thực và quản lý truy cập

| STT | Mô tả |
|---|---|
| 1 | Hệ thống cho phép đăng nhập bằng username và password. |
| 2 | Hệ thống kiểm tra thông tin đăng nhập và chỉ cấp JWT khi hợp lệ. |
| 3 | JWT chứa `sub` (ID người dùng), `role` (vai trò), `sid` (ID phiên), `iat` (thời điểm phát hành) và `exp` (thời điểm hết hạn). |
| 4 | Client gửi JWT trong header Authorization: `Bearer <token>` đối với các API yêu cầu xác thực. |
| 5 | Hệ thống cung cấp API đăng xuất cho phiên hiện tại; backend ghi `auth_sessions.logged_out_at` nếu phiên còn hoạt động và client xóa JWT đang lưu. |
| 6 | Hệ thống cung cấp API lấy thông tin người dùng hiện tại, gồm `id`, `username`, `role`, `full_name`, `student_code`, `faculty`, `major`. Các trường thông tin sinh viên có thể là `null` khi không có dữ liệu. |
| 7 | Hệ thống chỉ chấp nhận JWT khi phiên `sid` tương ứng chưa đăng xuất, chưa hết hạn, `sub` khớp người sở hữu phiên và `role` khớp vai trò hiện tại của người dùng. |

`JWT_TTL` và `SESSION_TTL` của sinh viên mặc định là 20 phút và phải có cùng giá trị. Quản trị viên sử dụng `ADMIN_JWT_TTL`, mặc định là 8 giờ. Khi tạo phiên mới, `expires_at` được tính bằng `created_at + JWT_TTL` đối với sinh viên hoặc `created_at + ADMIN_JWT_TTL` đối với quản trị viên. Thời điểm hết hạn `exp` trong JWT phải khớp với `expires_at` đến độ chính xác giây. Các API được bảo vệ phải kiểm tra tính hợp lệ của JWT, đối chiếu với bản ghi tương ứng trong `auth_sessions` và đảm bảo `role` trong JWT khớp với vai trò hiện tại của tài khoản.

## Quy tắc một phiên và đăng nhập lại (áp dụng cho sinh viên)

- Mỗi sinh viên chỉ được có một phiên đăng nhập đang hoạt động tại một thời điểm, không phân biệt thiết bị, trình duyệt hay tab. Nếu phiên trước vẫn còn hiệu lực (`logged_out_at IS NULL` và `NOW() < expires_at`), hệ thống từ chối đăng nhập mới, không cấp JWT mới và không gia hạn phiên hiện tại.
- Khi sinh viên chủ động đăng xuất trước thời hạn, backend ghi nhận `logged_out_at` một lần và vô hiệu hóa JWT của phiên đó ngay lập tức. Nếu phiên hết hạn tại `expires_at`, phiên tự hết hiệu lực mà không cần cập nhật database; `logged_out_at` vẫn là `NULL`.
- Thời điểm kết thúc phiên được xác định bằng `COALESCE(logged_out_at, expires_at)`. Sinh viên chỉ được đăng nhập lại sau khi thời điểm kết thúc phiên cộng thêm `LOGIN_COOLDOWN` (mặc định 20 phút). Ví dụ: nếu đăng nhập lúc 10:00 và đăng xuất lúc 10:05, sinh viên có thể đăng nhập lại từ 10:25. Nếu không đăng xuất và để phiên hết hạn lúc 10:20, sinh viên có thể đăng nhập lại từ 10:40.
- Sau khi xác thực username/password, backend khóa bản ghi người dùng trong bảng `users`, sau đó kiểm tra phiên gần nhất và tạo phiên mới trong cùng một transaction. Điều này đảm bảo hai yêu cầu đăng nhập đồng thời không tạo ra hai phiên hoạt động. Nếu đăng nhập bị từ chối, phiên đang hoạt động không bị thay đổi.
- Quản trị viên không bị giới hạn số phiên và không cần chờ cooldown. Mỗi lần đăng nhập thành công sẽ tạo một phiên mới với `sid` riêng, hết hạn theo `ADMIN_JWT_TTL`. Khi đăng xuất, hệ thống chỉ kết thúc phiên tương ứng với JWT đang sử dụng.

**Quy tắc phiên đăng nhập của quản trị viên**

- Quản trị viên có thể đăng nhập trên nhiều thiết bị hoặc trình duyệt mà không bị giới hạn số phiên và không cần chờ cooldown. Mỗi lần đăng nhập thành công sẽ tạo một phiên mới với `sid` riêng và thời hạn theo `JWT_TTL`.
- Khi đăng xuất, hệ thống chỉ kết thúc phiên tương ứng với JWT đang sử dụng, không ảnh hưởng đến các phiên khác của quản trị viên.

**Xử lý phiên đăng nhập ở frontend**

- Frontend lưu token và trạng thái đăng nhập trong `sessionStorage`. Khi tải lại trang, frontend gọi `GET /api/auth/me` để kiểm tra và khôi phục trạng thái đăng nhập.
- Frontend sử dụng bộ hẹn giờ dựa trên thời điểm hết hạn `exp` để xóa thông tin phiên cục bộ và chuyển người dùng về trang đăng nhập khi hết hạn. Ngoài ra, hệ thống kiểm tra lại thời hạn phiên khi tab được mở lại hoặc khi API trả về `401`.
- Bộ hẹn giờ chỉ giúp frontend cập nhật giao diện kịp thời; backend vẫn là nơi quyết định phiên có còn hiệu lực hay không.
- Đóng tab không đồng nghĩa với đăng xuất. Nếu người dùng không chủ động đăng xuất, phiên vẫn tồn tại cho đến khi hết hạn tại `expires_at`.

### 3.2. Tra cứu lớp học phần

| STT | Mô tả |
|---|---|
| 1 | Trả về danh sách lớp học phần đang hoạt động (`active`) của học kỳ hiện tại; ngoài thời gian đăng ký vẫn cho phép tra cứu, nhưng không cho đăng ký/hủy. |
| 2 | Hỗ trợ lọc danh sách theo ngành/toàn trường |
| 3 | Cung cấp thông tin chi tiết lớp học phần, giảng viên, phòng học, lịch học và tình trạng sĩ số. |
| 4 | Danh sách lớp kèm thông tin học kỳ hiện tại (tên, thời gian mở/đóng đăng ký, giới hạn tín chỉ tối đa) để client hiển thị đợt đăng ký. |
| 5 | Chi tiết lớp học phần kèm khoa, ngành, tên học kỳ và các học phần tiên quyết; với sinh viên, mỗi học phần tiên quyết cho biết sinh viên đó đã học hay chưa. |

### 3.3. Đăng ký và hủy học phần

| STT | Mô tả |
|---|---|
| 1 | Sinh viên đã xác thực có thể gửi yêu cầu đăng ký một hoặc nhiều lớp học phần trong cùng một yêu cầu. |
| 2 | Hệ thống kiểm tra các quy tắc nghiệp vụ cho từng lớp trước khi ghi nhận đăng ký. |
| 3 | Ghi nhận thông tin đăng ký của sinh viên theo từng lớp học phần và cập nhật sĩ số lớp tương ứng, đảm bảo dữ liệu đăng ký và sĩ số luôn nhất quán. |
| 4 | Sinh viên xem được danh sách học phần đã đăng ký thành công của mình. |
| 5 | Sinh viên có thể hủy đăng ký lớp học phần đã đăng ký. |
| 6 | Hệ thống xóa vật lý bản ghi đăng ký và giảm sĩ số lớp học phần trong cùng transaction khi hủy đăng ký thành công. |
| 7 | Cung cấp thời khóa biểu tổng hợp từ các lớp học phần đã đăng ký. |
| 8 | Trả về kết quả đăng ký/hủy. |
| 9 | Khi đăng ký nhiều lớp, hệ thống xử lý lần lượt từng lớp theo thứ tự gửi: lớp đáp ứng điều kiện được ghi nhận, lớp không đáp ứng bị từ chối kèm lý do mà không ảnh hưởng các lớp khác. Yêu cầu vẫn hoàn tất khi chỉ một phần số lớp được ghi nhận. |

### 3.4. Quản trị lớp học phần

| STT | Mô tả |
|---|---|
| 1 | Quản trị viên có thể tạo lớp học phần mới với dữ liệu hợp lệ. |
| 2 | Quản trị viên có thể cập nhật thông tin lớp học phần. |
| 3 | Quản trị viên có thể hủy lớp học phần: giữ bản ghi lớp với `status = cancelled`, xóa vật lý toàn bộ đăng ký của lớp và đặt sĩ số về 0 trong cùng transaction. |
| 4 | Hệ thống kiểm tra dữ liệu đầu vào trước khi lưu. |
| 5 | Các API quản trị từ chối request không đủ quyền. |

Form tạo lớp tự lấy `semester.id` từ API danh sách lớp, hiển thị tên học kỳ ở trường chỉ đọc; chưa cho gửi khi đang tải, tải lỗi hoặc chưa có học kỳ. Form sửa lớp giữ học kỳ của chính lớp đó.

### 3.5. Luồng nghiệp vụ chính

#### 3.5.1. Đăng nhập

1. Người dùng gửi username và password tới API đăng nhập.
2. Hệ thống kiểm tra thông tin xác thực. Nếu sai, trả `401 INVALID_CREDENTIALS`.
3. Với sinh viên, backend khóa bản ghi người dùng và kiểm tra phiên gần nhất trong cùng một transaction. Nếu phiên vẫn còn hoạt động (logged_out_at IS NULL và NOW() < expires_at), hệ thống trả về 409 ALREADY_LOGGED_IN. Nếu phiên đã kết thúc nhưng chưa hết thời gian chờ LOGIN_COOLDOWN (mặc định 20 phút), hệ thống trả về 429 LOGIN_COOLDOWN. Thời điểm kết thúc phiên được xác định bằng COALESCE(logged_out_at, expires_at). Quản trị viên không áp dụng các giới hạn này.
4. Nếu được phép đăng nhập, backend tạo bản ghi phiên mới trong `auth_sessions` và cấp JWT chứa `sub`, `role`, `sid`, `iat`, `exp`. Thời hạn phiên là `JWT_TTL` đối với sinh viên (mặc định 20 phút) hoặc `ADMIN_JWT_TTL` đối với quản trị viên (mặc định 8 giờ). Giá trị `exp` phải khớp với `expires_at` đến độ chính xác giây. Hệ thống trả về `access_token`.
5. Client gửi token trong header `Authorization` để gọi `GET /api/auth/me`, lấy thông tin tài khoản và điều hướng theo vai trò.
6. Client tiếp tục gửi token trong header của các request cần xác thực. Khoa và ngành đã lấy từ `/api/auth/me` được dùng để hiển thị thông tin sinh viên và lọc lớp theo ngành.

#### 3.5.2. Đăng ký học phần

1. Sinh viên đã đăng nhập gửi yêu cầu đăng ký một hoặc nhiều lớp học phần (tối đa 20 lớp, không trùng nhau).
2. Hệ thống xác thực người dùng và kiểm tra dữ liệu yêu cầu; yêu cầu sai định dạng bị từ chối toàn bộ.
3. Với từng lớp, theo thứ tự gửi, hệ thống kiểm tra thời gian đăng ký, sĩ số, đăng ký trùng, trùng lịch, điều kiện tiên quyết và giới hạn tín chỉ. Trùng lịch và giới hạn tín chỉ được tính cả với các lớp vừa được ghi nhận trong cùng yêu cầu.
4. Nếu lớp đáp ứng các điều kiện, hệ thống ghi nhận đăng ký và cập nhật sĩ số của lớp đó trong cùng transaction; nếu không, lớp bị từ chối với mã lỗi tương ứng và các lớp khác không bị ảnh hưởng.
5. Hệ thống trả kết quả cho từng lớp, gồm trạng thái đăng ký và lý do từ chối nếu có, cùng tổng số lớp đăng ký thành công và tổng số lớp bị từ chối. Ví dụ: nếu gửi 5 lớp, trong đó 3 lớp đăng ký thành công và 2 lớp hết chỗ, hệ thống vẫn ghi nhận 3 đăng ký thành công và trả lỗi cho 2 lớp còn lại.

#### 3.5.3. Tra cứu lớp học phần

1. Client yêu cầu danh sách lớp học phần đang hoạt động của học kỳ hiện tại, có thể kèm bộ lọc khoa/ngành.
2. Hệ thống trả về danh sách phù hợp.
3. Client gửi yêu cầu xem chi tiết lớp theo ID lớp học phần.
4. Hệ thống trả thông tin lớp, giảng viên, phòng học, lịch học và sĩ số.

#### 3.5.4. Quản trị lớp học phần

1. Quản trị viên đăng nhập và được xác thực quyền.
2. Quản trị viên gửi request tạo mới, cập nhật hoặc xóa/hủy lớp học phần.
3. Hệ thống kiểm tra dữ liệu đầu vào và các ràng buộc liên quan.
4. Hệ thống lưu thay đổi nếu hợp lệ và trả kết quả cho client.

## 4. Quy tắc nghiệp vụ

| STT | Quy tắc | Mô tả |
|---|---|---|
| 1 | Giới hạn sĩ số | Từ chối đăng ký nếu sĩ số hiện tại của lớp đã đạt `max_capacity`. |
| 2 | Thời gian đăng ký | Chỉ cho phép đăng ký hoặc hủy đăng ký trong khoảng thời gian đăng ký của học kỳ. |
| 3 | Không trùng lịch | Từ chối đăng ký nếu lịch học của lớp bị trùng với lịch học của các lớp sinh viên đã đăng ký trong cùng học kỳ. |
| 4 | Không đăng ký trùng | Sinh viên chỉ có tối đa một đăng ký còn hiệu lực cho cùng một lớp học phần. Sau khi hủy, có thể đăng ký lại nếu đáp ứng các điều kiện nghiệp vụ. |
| 5 | Điều kiện tiên quyết | Sinh viên phải đáp ứng các điều kiện về học phần tiên quyết trước khi đăng ký lớp học phần. |
| 6 | Giới hạn tín chỉ tối đa | Tổng số tín chỉ sau khi đăng ký không được vượt quá giới hạn cho phép. Backend sử dụng `MAX_CREDITS` nếu được cấu hình; nếu không, sử dụng giới hạn tín chỉ được lưu trong database của học kỳ. Frontend hiển thị giới hạn do API cung cấp. |
| 7 | Thời gian đăng ký hợp lệ | Thời điểm mở đăng ký phải sớm hơn thời điểm đóng đăng ký. Điều kiện này được đảm bảo bằng ràng buộc `CHECK` trong cơ sở dữ liệu. |
| 8 | Quyền sở hữu đăng ký | Sinh viên chỉ được xem và hủy các đăng ký học phần của chính mình. |
| 9 | Kiểm tra dữ liệu lớp | Thông tin lớp học phần khi tạo mới hoặc cập nhật phải đáp ứng các ràng buộc dữ liệu đã quy định. |
| 10 | Đăng ký nhiều lớp | Mỗi yêu cầu đăng ký phải gồm từ 1 đến 20 lớp học phần khác nhau. Các quy tắc từ 1 đến 6 được kiểm tra riêng cho từng lớp. Lớp bị từ chối không ảnh hưởng đến các đăng ký đã thành công trong cùng yêu cầu. |

## 5. Yêu cầu giao diện và API

### 5.1. Quy ước chung

- API sử dụng phương thức HTTP theo nguyên tắc REST.
- Dữ liệu trao đổi sử dụng định dạng JSON.
- Swagger UI truy cập tại `/swagger/index.html`; tài liệu JSON tại `/swagger/doc.json` trên backend.
- Các endpoint yêu cầu xác thực phải nhận JWT trong header `Authorization: Bearer <token>`.
- API trả về mã trạng thái HTTP và thông tin lỗi theo cấu trúc thống nhất. Chi tiết request, response và mã lỗi của từng endpoint được mô tả trong `docs/api-design.md`.

### 5.2. Danh sách endpoint

Hệ thống có **12 endpoint nghiệp vụ**, tính theo cặp phương thức HTTP và đường dẫn: 3 endpoint xác thực/người dùng, 2 endpoint tra cứu lớp, 4 endpoint đăng ký/thời khóa biểu và 3 endpoint quản trị. Tất cả nằm dưới `/api`; các route kỹ thuật tại §5.4 không tính vào số này.

Mọi endpoint trừ đăng nhập đều yêu cầu JWT hợp lệ và phiên đăng nhập còn hiệu lực. Với endpoint chỉ dành cho sinh viên hoặc quản trị viên, tài khoản khác vai trò bị từ chối với `403 FORBIDDEN`.

#### 5.2.1. Xác thực và người dùng

| Phương thức | Endpoint | Mô tả | Quyền truy cập |
|---|---|---|---|
| POST | `/api/auth/login` | Đăng nhập hệ thống, trả về JWT | Công khai |
| POST | `/api/auth/logout` | Đăng xuất và kết thúc phiên đăng nhập hiện tại | Đã xác thực |
| GET | `/api/auth/me` | Lấy thông tin tài khoản hiện tại, gồm khoa và ngành | Đã xác thực |

#### 5.2.2. Tra cứu lớp học phần

| Phương thức | Endpoint | Mô tả | Quyền truy cập |
|---|---|---|---|
| GET | `/api/classes` | Lấy lớp `active` của học kỳ hiện tại và thông tin học kỳ; hỗ trợ lọc `faculty`, `major` | Quản trị viên hoặc sinh viên |
| GET | `/api/classes/{id}` | Xem thông tin chi tiết lớp học phần | Quản trị viên hoặc sinh viên |

#### 5.2.3. Đăng ký học phần và thời khóa biểu

| Phương thức | Endpoint | Mô tả | Quyền truy cập |
|---|---|---|---|
| POST | `/api/registrations` | Đăng ký một hoặc nhiều lớp học phần | Sinh viên |
| GET | `/api/registrations` | Lấy danh sách lớp học phần đã đăng ký của sinh viên hiện tại | Sinh viên |
| DELETE | `/api/registrations/{id}` | Xóa vật lý đăng ký của chính mình; `{id}` là ID đăng ký | Sinh viên sở hữu đăng ký |
| GET | `/api/schedules` | Lấy thời khóa biểu từ các lớp học phần đã đăng ký | Sinh viên |

#### 5.2.4. Quản trị hệ thống

| Phương thức | Endpoint | Mô tả | Quyền truy cập |
|---|---|---|---|
| POST | `/api/classes` | Tạo lớp học phần mới | Quản trị viên |
| PUT | `/api/classes/{id}` | Cập nhật thông tin lớp học phần | Quản trị viên |
| DELETE | `/api/classes/{id}` | Hủy lớp học phần (giữ bản ghi lớp với `status = cancelled`, xóa vật lý các đăng ký của lớp) | Quản trị viên |

### 5.3. Yêu cầu dữ liệu request/response

- Request body và response body sử dụng JSON.
- Mỗi endpoint phải xác định rõ các trường dữ liệu, kiểu dữ liệu, trường bắt buộc và quy tắc kiểm tra dữ liệu đầu vào.
- Cấu trúc response, mã lỗi và ví dụ request/response phải được mô tả trong OpenAPI/Swagger.
- `registration_open` chỉ trả ở thông tin học kỳ (`data.semester`) của danh sách lớp, không lặp trên từng lớp hoặc chi tiết lớp. Client dùng trạng thái này để hiển thị và khóa/mở thao tác theo thời gian; backend vẫn kiểm tra nghiệp vụ khi nhận yêu cầu đăng ký/hủy.
- Hai endpoint `DELETE /api/classes/{id}` và `DELETE /api/registrations/{id} `trả về HTTP `200` với `response { "status": "success", "data": {} }` khi thao tác hủy thành công.
### 5.4. Route kỹ thuật

| Phương thức | Đường dẫn | Mục đích | Quyền truy cập |
|---|---|---|---|
| GET | `/health` | Kiểm tra backend đang phản hồi, phục vụ healthcheck của Docker Compose | Công khai |
| GET | `/swagger/*any` | Phục vụ Swagger UI, tài liệu OpenAPI và tài nguyên liên quan | Công khai |

Các route này không phải API nghiệp vụ. `/health` trả `200` với `{ "status": "success", "data": {} }`; không thực hiện truy vấn kiểm tra cơ sở dữ liệu. Route Swagger trả định dạng tương ứng với tài nguyên được yêu cầu, không dùng envelope JSON nghiệp vụ.

## 6. Yêu cầu phi chức năng

| STT | Nhóm | Yêu cầu | Tiêu chí/ghi chú |
|---|---|---|---|
| 1 | Bảo mật | Mật khẩu người dùng phải được băm bằng thuật toán phù hợp trước khi lưu trữ. | Không lưu mật khẩu dạng plaintext. |
| 2 | Bảo mật | Các API được bảo vệ phải kiểm tra xác thực và phân quyền người dùng. | Từ chối yêu cầu không hợp lệ hoặc không đủ quyền. |
| 3 | Bảo mật | Môi trường triển khai thực tế phải sử dụng HTTPS. | HTTP có thể sử dụng trong môi trường phát triển và kiểm thử nội bộ. |
| 4 | Tính toàn vẹn dữ liệu | Hệ thống phải kiểm tra các ràng buộc nghiệp vụ trước khi ghi dữ liệu. | Không ghi nhận dữ liệu không hợp lệ, đăng ký trùng hoặc vi phạm quy tắc nghiệp vụ. |
| 5 | Tính nhất quán dữ liệu | Các thao tác đăng ký và hủy học phần phải đảm bảo dữ liệu đăng ký và sĩ số lớp được cập nhật nhất quán. | Sử dụng transaction khi thao tác liên quan đến nhiều thay đổi dữ liệu. |
| 6 | Xử lý lỗi | API phải trả về mã trạng thái HTTP và thông báo lỗi phù hợp. | Không để lộ thông tin nhạy cảm hoặc chi tiết lỗi nội bộ. |
| 7 | Khả năng triển khai | Backend phải có khả năng chạy và kiểm thử trong môi trường phát triển. | Cung cấp cấu hình và hướng dẫn khởi chạy hệ thống. |

## 7. Yêu cầu kiến trúc và triển khai

### 7.1. Kiến trúc phân tầng

| Tầng | Trách nhiệm |
|---|---|
| Controller | Tiếp nhận HTTP request, xử lý dữ liệu đầu vào và trả HTTP response. |
| Service | Xử lý logic nghiệp vụ và kiểm tra các điều kiện liên quan. |
| Repository | Thực hiện truy vấn và thao tác với cơ sở dữ liệu. |

### 7.2. Xác thực và phân quyền

- Hệ thống sử dụng JWT để xác thực người dùng.
- Các API yêu cầu xác thực phải kiểm tra tính hợp lệ của JWT và trạng thái phiên đăng nhập tương ứng trong cơ sở dữ liệu.
- Hệ thống phân quyền truy cập dựa trên vai trò người dùng.
- Người dùng chỉ được truy cập và thao tác trên dữ liệu thuộc phạm vi quyền hạn của mình.
- Phiên đăng nhập được lưu trong cơ sở dữ liệu và được kiểm tra ở mỗi request được bảo vệ.

### 7.3. Công nghệ và đóng gói

| Hạng mục | Yêu cầu |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Go, Gin |
| Giao tiếp | RESTful API, JSON |
| Tài liệu API | OpenAPI/Swagger |
| Cơ sở dữ liệu | PostgreSQL |
| Đóng gói | Docker, Docker Compose |
| Lưu trữ và quản lý mã nguồn | Git, GitHub |
| Tài liệu dự án | `README.md` hướng dẫn cài đặt, cấu hình và khởi chạy hệ thống |

### 7.4. Nguyên tắc phát triển

Ưu tiên hoàn thiện các chức năng cốt lõi, bảo đảm tính đúng đắn của nghiệp vụ, tính nhất quán dữ liệu và kiểm soát truy cập. Các thao tác có thể xảy ra đồng thời phải sử dụng transaction hoặc cơ chế khóa phù hợp để đảm bảo dữ liệu nhất quán và không vi phạm các ràng buộc nghiệp vụ.

## 8. Tiêu chí nghiệm thu

| STT | Tiêu chí nghiệm thu |
|---|---|
| 1 | Đăng nhập hợp lệ trả JWT; thông tin đăng nhập không hợp lệ bị từ chối. |
| 2 | Các API được bảo vệ từ chối yêu cầu thiếu token, token không hợp lệ, token thuộc phiên đã đăng xuất/hết hạn, vai trò không còn khớp với tài khoản hoặc không đủ quyền truy cập. |
| 3 | Người dùng đọc được thông tin tài khoản của chính mình qua `GET /api/auth/me`; sinh viên nhận được khoa và ngành để hiển thị tổng quan và lọc lớp học phần. |
| 4 | Sinh viên tra cứu được danh sách lớp học phần đang hoạt động của học kỳ hiện tại và thông tin chi tiết lớp theo ID, kể cả khi đã đóng đợt đăng ký. |
| 5 | Đăng ký học phần thành công tạo đúng bản ghi và cập nhật sĩ số tương ứng cho từng lớp được ghi nhận. |
| 6 | Hệ thống từ chối đăng ký từng lớp khi lớp đầy, ngoài thời gian đăng ký, trùng lịch, không đạt điều kiện tiên quyết, đăng ký trùng hoặc vượt giới hạn tín chỉ, kèm mã lỗi tương ứng cho lớp đó. |
| 7 | Sinh viên xem được danh sách lớp học phần đã đăng ký và thời khóa biểu của mình. |
| 8 | Sinh viên chỉ có thể hủy đăng ký thuộc về mình khi đáp ứng điều kiện nghiệp vụ; hủy thành công xóa vật lý bản ghi và giảm sĩ số trong cùng transaction. ID đã xóa trả `404 NOT_FOUND`; đăng ký lại tạo ID mới. Danh sách đăng ký và thời khóa biểu không còn lớp đã hủy đăng ký. |
| 9 | Quản trị viên có thể tạo, cập nhật và hủy lớp học phần; dữ liệu không hợp lệ bị từ chối. Hủy lớp giữ bản ghi lớp ở trạng thái `cancelled`, xóa vật lý toàn bộ đăng ký của lớp và đặt sĩ số về 0 trong cùng transaction. |
| 10 | OpenAPI/Swagger hoạt động và mô tả đầy đủ các endpoint được triển khai. |
| 11 | Ứng dụng và cơ sở dữ liệu khởi chạy thành công theo hướng dẫn Docker Compose; README.md cung cấp hướng dẫn cài đặt, cấu hình và sử dụng. |
| 12 | Yêu cầu đăng ký nhiều lớp ghi nhận các lớp hợp lệ và trả lý do từ chối cho các lớp còn lại; một số lớp bị từ chối không làm mất các lớp đã được ghi nhận. Yêu cầu có danh sách rỗng, trùng lớp hoặc quá 20 lớp bị từ chối toàn bộ. |
| 13 | Một tài khoản sinh viên chỉ có một phiên hoạt động trên mọi thiết bị; đăng nhập lại khi phiên còn hoạt động nhận `409 ALREADY_LOGGED_IN` và không đổi thời hạn phiên. Quản trị viên đăng nhập được nhiều phiên cùng lúc. |
| 14 | Với sinh viên, thời gian chờ `LOGIN_COOLDOWN` (mặc định 20 phút) được tính từ thời điểm kết thúc phiên: `logged_out_at` nếu sinh viên chủ động đăng xuất, hoặc `expires_at` nếu phiên hết hạn tự nhiên. Đăng nhập chỉ được chấp nhận khi thời gian chờ đã kết thúc. Quản trị viên không áp dụng cooldown.|
| 15 | Frontend tự xóa trạng thái xác thực và chuyển tới màn hình đăng nhập khi JWT hết hạn, kể cả khi người dùng không thao tác; backend vẫn từ chối token hết hạn. |
