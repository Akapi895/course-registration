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

Hệ thống cung cấp RESTful API phục vụ xác thực người dùng, tra cứu lớp học phần, quản lý thông tin sinh viên, đăng ký/hủy học phần, xem thời khóa biểu và quản trị lớp học phần.

### 1.3. Đối tượng sử dụng

- Sinh viên.
- Quản trị viên (Quản trị viên).

## 2. Mô tả tổng quan

### 2.1. Các nhóm người dùng

| Tác nhân | Mô tả | Chức năng chính |
|---|---|---|
| Sinh viên | Người dùng đăng ký học phần | Đăng nhập, tra cứu lớp, đăng ký/hủy học phần, xem thời khóa biểu |
| Quản trị viên | Người dùng quản trị hệ thống | Tra cứu, cập nhật thông tin sinh viên; quản lý lớp học phần; cấu hình thời gian đăng ký |

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
| 3 | JWT chứa định danh, vai trò người dùng, mã phiên (`sid`) và thời gian hết hạn. |
| 4 | Client gửi JWT trong header Authorization: `Bearer <token>` đối với các API yêu cầu xác thực. |
| 5 | Hệ thống cung cấp API đăng xuất để thu hồi phiên đăng nhập hiện tại; client xóa JWT đang lưu sau khi gọi API đăng xuất. |
| 6 | Hệ thống cung cấp API lấy thông tin người dùng hiện tại. |
| 7 | Hệ thống chỉ chấp nhận JWT khi phiên đăng nhập tương ứng còn hiệu lực và chưa bị thu hồi. |

> Lưu ý: Phiên đăng nhập được lưu trong cơ sở dữ liệu. Trong Phase 1, Backend thu hồi phiên khi đăng xuất và từ chối JWT thuộc phiên đã thu hồi hoặc đã hết hạn.

### 3.2. Tra cứu lớp học phần

| STT | Mô tả |
|---|---|
| 1 | Trả về danh sách lớp học phần đang mở đăng ký. |
| 2 | Hỗ trợ lọc danh sách theo khoa, ngành hoặc tiêu chí phù hợp. |
| 3 | Cung cấp thông tin chi tiết lớp học phần, giảng viên, phòng học, lịch học và tình trạng sĩ số. |
| 4 | Danh sách lớp kèm thông tin học kỳ hiện tại (tên, thời gian mở/đóng đăng ký, giới hạn tín chỉ tối đa) để client hiển thị đợt đăng ký. |
| 5 | Chi tiết lớp học phần kèm khoa, ngành, tên học kỳ và các học phần tiên quyết; với sinh viên, mỗi học phần tiên quyết cho biết sinh viên đó đã đạt hay chưa. |

### 3.3. Đăng ký và hủy học phần

| STT | Mô tả |
|---|---|
| 1 | Sinh viên đã xác thực có thể gửi yêu cầu đăng ký một hoặc nhiều lớp học phần trong cùng một yêu cầu. |
| 2 | Hệ thống kiểm tra các quy tắc nghiệp vụ cho từng lớp trước khi ghi nhận đăng ký. |
| 3 | Ghi nhận đăng ký của từng lớp và cập nhật sĩ số nhất quán trong giao dịch dữ liệu. |
| 4 | Sinh viên xem được danh sách học phần đã đăng ký thành công của mình. |
| 5 | Sinh viên có thể hủy đăng ký khi đáp ứng các điều kiện nghiệp vụ. |
| 6 | Hệ thống cập nhật trạng thái đăng ký và sĩ số lớp học phần khi hủy đăng ký thành công. |
| 7 | Cung cấp thời khóa biểu tổng hợp từ các lớp học phần đã đăng ký. |
| 8 | Trả về kết quả đăng ký/hủy và lý do từ chối nếu có; với đăng ký nhiều lớp, trả kết quả và lý do từ chối (nếu có) cho từng lớp. |
| 9 | Khi đăng ký nhiều lớp, hệ thống xử lý lần lượt từng lớp theo thứ tự gửi: lớp đáp ứng điều kiện được ghi nhận, lớp không đáp ứng bị từ chối kèm lý do mà không ảnh hưởng các lớp khác. Yêu cầu vẫn hoàn tất khi chỉ một phần số lớp được ghi nhận. |

### 3.4. Quản lý thông tin sinh viên

| STT| Mô tả |
|---|---|
| 1 | Cho phép người dùng đủ quyền xem thông tin sinh viên theo mã định danh. |
| 2 | Cho phép quản trị viên hoặc chính sinh viên cập nhật thông tin phù hợp với quyền được cấp. |
| 3 | Kiểm tra quyền truy cập dữ liệu để ngăn việc xem hoặc sửa trái phép. |

### 3.5. Quản trị lớp học phần

| STT | Mô tả |
|---|---|
| 1 | Quản trị viên có thể tạo lớp học phần mới với dữ liệu hợp lệ. |
| 2 | Quản trị viên có thể cập nhật thông tin lớp học phần. |
| 3 | Quản trị viên có thể xóa hoặc hủy lớp học phần theo chính sách đã thống nhất. |
| 4 | Hệ thống kiểm tra dữ liệu đầu vào trước khi lưu. |
| 5 | Các API quản trị từ chối request không đủ quyền. |
| 6 | Quản trị viên có thể cấu hình thời gian mở và đóng đăng ký học phần. |

### 3.6. Luồng nghiệp vụ chính

#### 3.6.1. Đăng nhập

1. Người dùng gửi username và password tới API đăng nhập.
2. Hệ thống kiểm tra thông tin xác thực.
3. Nếu hợp lệ, hệ thống tạo JWT gắn với định danh và vai trò người dùng.
4. Hệ thống trả token và thông tin cần thiết cho client.
5. Client gửi token trong header của các request cần xác thực.

#### 3.6.2. Đăng ký học phần

1. Sinh viên đã đăng nhập gửi yêu cầu đăng ký một hoặc nhiều lớp học phần (tối đa 20 lớp, không trùng nhau).
2. Hệ thống xác thực người dùng và kiểm tra dữ liệu yêu cầu; yêu cầu sai định dạng bị từ chối toàn bộ.
3. Với từng lớp, theo thứ tự gửi, hệ thống kiểm tra thời gian đăng ký, sĩ số, đăng ký trùng, trùng lịch, điều kiện tiên quyết và giới hạn tín chỉ. Trùng lịch và giới hạn tín chỉ được tính cả với các lớp vừa được ghi nhận trong cùng yêu cầu.
4. Nếu lớp đáp ứng các điều kiện, hệ thống ghi nhận đăng ký và cập nhật sĩ số của lớp đó trong cùng giao dịch dữ liệu; nếu không, lớp bị từ chối với mã lỗi tương ứng và các lớp khác không bị ảnh hưởng.
5. Hệ thống trả kết quả cho từng lớp (đã đăng ký hoặc bị từ chối kèm lý do) cùng số lớp thành công và số lớp bị từ chối. Ví dụ: gửi 5 lớp, 3 lớp thành công và 2 lớp hết chỗ thì 3 đăng ký vẫn được ghi nhận và 2 lớp còn lại được báo lỗi.

#### 3.6.3. Tra cứu lớp học phần

1. Client yêu cầu danh sách lớp học phần đang mở, có thể kèm bộ lọc.
2. Hệ thống trả về danh sách phù hợp.
3. Client gửi yêu cầu xem chi tiết lớp theo mã lớp.
4. Hệ thống trả thông tin lớp, giảng viên, phòng học, lịch học và sĩ số.

#### 3.6.4. Quản trị lớp học phần

1. Quản trị viên đăng nhập và được xác thực quyền.
2. Quản trị viên gửi request tạo mới, cập nhật hoặc xóa/hủy lớp học phần.
3. Hệ thống kiểm tra dữ liệu đầu vào và các ràng buộc liên quan.
4. Hệ thống lưu thay đổi nếu hợp lệ và trả kết quả cho client.

## 4. Quy tắc nghiệp vụ

| STT | Quy tắc | Mô tả |
|---|---|---|
| 1 | Giới hạn sĩ số | Không chấp nhận đăng ký nếu số lượng đã đăng ký đạt `max_capacity`. |
| 2 | Thời gian đăng ký | Chỉ cho phép đăng ký/hủy trong khoảng thời gian do quản trị viên cấu hình. |
| 3 | Không trùng lịch | Từ chối đăng ký lớp học phần có lịch học trùng với các lớp đã đăng ký trong cùng học kỳ. |
| 4 | Không đăng ký trùng | Sinh viên chỉ được đăng ký một lần đối với cùng một lớp học phần trong mỗi học kỳ. |
| 5 | Điều kiện tiên quyết | Sinh viên phải đáp ứng các yêu cầu về học phần tiên quyết trước khi đăng ký. |
| 6 | Giới hạn tín chỉ tối đa | Tổng số tín chỉ sau đăng ký không được vượt mức tối đa theo quy định. |
| 7 | Thời gian đăng ký hợp lệ | Thời điểm mở đăng ký phải trước thời điểm đóng đăng ký. |
| 8 | Quyền sở hữu đăng ký | Sinh viên chỉ được phép xem và hủy các đăng ký học phần của chính mình. |
| 9 | Kiểm tra dữ liệu lớp | Thông tin lớp học phần khi tạo mới hoặc cập nhật phải đáp ứng các ràng buộc dữ liệu đã quy định. |
| 10 | Đăng ký nhiều lớp | Mỗi yêu cầu đăng ký gồm 1 đến 20 lớp khác nhau. Các quy tắc 1–6 áp dụng riêng cho từng lớp; lớp bị từ chối không làm mất các lớp đã được ghi nhận trong cùng yêu cầu. |

## 5. Yêu cầu giao diện và API

### 5.1. Quy ước chung

- API sử dụng phương thức HTTP theo nguyên tắc REST.
- Dữ liệu trao đổi sử dụng định dạng JSON.
- Tài liệu API sử dụng OpenAPI/Swagger, dự kiến truy cập tại `/swagger` hoặc `/docs`.
- Endpoint được bảo vệ yêu cầu token trong header `Authorization: Bearer <token>`.
- API phải trả mã trạng thái HTTP và thông báo lỗi nhất quán. Cấu trúc request và response của từng endpoint được mô tả trong `docs/api-design.md`.

### 5.2. Danh sách endpoint

#### 5.2.1. Xác thực và người dùng

| Phương thức | Endpoint | Mô tả | Quyền truy cập |
|---|---|---|---|
| POST | `/api/auth/login` | Đăng nhập hệ thống, trả về JWT | Công khai |
| POST | `/api/auth/logout` | Đăng xuất hệ thống và thu hồi phiên đăng nhập | Đã xác thực |
| GET | `/api/auth/me` | Lấy thông tin người dùng hiện tại | Đã xác thực |

#### 5.2.2. Quản lý sinh viên

| Phương thức | Endpoint | Mô tả | Quyền truy cập |
|---|---|---|---|
| GET | `/api/students/{id}` | Xem thông tin chi tiết sinh viên | Quản trị viên hoặc sinh viên |
| PUT | `/api/students/{id}` | Cập nhật thông tin sinh viên | Quản trị viên hoặc sinh viên |

#### 5.2.3. Tra cứu lớp học phần

| Phương thức | Endpoint | Mô tả | Quyền truy cập |
|---|---|---|---|
| GET | `/api/classes` | Lấy danh sách lớp học phần đang mở đăng ký | Quản trị viên hoặc sinh viên |
| GET | `/api/classes/{id}` | Xem thông tin chi tiết lớp học phần | Quản trị viên hoặc sinh viên |

#### 5.2.4. Đăng ký học phần và thời khóa biểu

| Phương thức | Endpoint | Mô tả | Quyền truy cập |
|---|---|---|---|
| POST | `/api/registrations` | Đăng ký một hoặc nhiều lớp học phần | Sinh viên |
| GET | `/api/registrations` | Lấy danh sách lớp học phần đã đăng ký của sinh viên hiện tại | Sinh viên |
| DELETE | `/api/registrations/{id}` | Hủy đăng ký lớp học phần | Sinh viên đã đăng ký |
| GET | `/api/schedules` | Lấy thời khóa biểu từ các lớp học phần đã đăng ký | Sinh viên |

#### 5.2.5. Quản trị hệ thống

| Phương thức | Endpoint | Mô tả | Quyền truy cập |
|---|---|---|---|
| POST | `/api/classes` | Tạo lớp học phần mới | Quản trị viên |
| PUT | `/api/classes/{id}` | Cập nhật thông tin lớp học phần | Quản trị viên |
| DELETE | `/api/classes/{id}` | Xóa hoặc hủy lớp học phần | Quản trị viên |
| PUT | `/api/registration-period` | Cấu hình thời gian mở và đóng đăng ký học phần | Quản trị viên |

### 5.3. Yêu cầu dữ liệu request/response

- Request body và response body sử dụng JSON.
- Mỗi API cần xác định trường dữ liệu, kiểu dữ liệu, trường bắt buộc và quy tắc validation.
- Cấu trúc response, mã lỗi và ví dụ request/response phải được mô tả trong OpenAPI/Swagger.

## 6. Yêu cầu phi chức năng

| STT | Nhóm | Yêu cầu | Tiêu chí/ghi chú |
|---|---|---|---|
| 1 | Bảo mật | Mật khẩu người dùng phải được băm bằng thuật toán phù hợp trước khi lưu trữ. | Không lưu mật khẩu dạng plaintext. |
| 2 | Bảo mật | Các API được bảo vệ phải kiểm tra xác thực và phân quyền người dùng. | Từ chối yêu cầu không hợp lệ hoặc không đủ quyền. |
| 3 | Bảo mật | Môi trường triển khai thực tế phải sử dụng HTTPS. | HTTP có thể sử dụng trong môi trường phát triển và kiểm thử nội bộ. |
| 4 | Tính toàn vẹn dữ liệu | Hệ thống phải kiểm tra các ràng buộc nghiệp vụ trước khi ghi dữ liệu. | Không ghi nhận dữ liệu không hợp lệ, đăng ký trùng hoặc vi phạm quy tắc nghiệp vụ. |
| 5 | Tính nhất quán dữ liệu | Các thao tác đăng ký và hủy học phần phải đảm bảo dữ liệu được cập nhật nhất quán. | Sử dụng transaction khi thao tác liên quan đến nhiều thay đổi dữ liệu. |
| 6 | Xử lý lỗi | API phải trả về mã trạng thái HTTP và thông báo lỗi phù hợp. | Không để lộ thông tin nhạy cảm hoặc chi tiết lỗi nội bộ. |
| 7 | Khả năng triển khai | Backend phải có khả năng chạy và kiểm thử trong môi trường phát triển. | Cung cấp cấu hình và hướng dẫn khởi chạy hệ thống. |

**Giới hạn phạm vi Phase 1:**

Phase 1 tập trung hoàn thiện các chức năng nghiệp vụ và bảo đảm hệ thống hoạt động đúng trong điều kiện sử dụng cơ bản. Các yêu cầu tối ưu hiệu năng, kiểm thử tải, mở rộng hệ thống và tối ưu xử lý đồng thời sẽ được xem xét trong các giai đoạn tiếp theo.

## 7. Yêu cầu kiến trúc và triển khai

### 7.1. Kiến trúc phân tầng

| Tầng | Trách nhiệm |
|---|---|
| Controller | Tiếp nhận HTTP request, xử lý dữ liệu đầu vào và trả HTTP response. |
| Service | Xử lý logic nghiệp vụ và kiểm tra các điều kiện liên quan. |
| Repository | Thực hiện truy vấn và thao tác với cơ sở dữ liệu. |

### 7.2. Xác thực và phân quyền

- Hệ thống sử dụng JWT để xác thực người dùng.
- Các API yêu cầu xác thực phải kiểm tra tính hợp lệ của token.
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

Phase 1 ưu tiên hoàn thiện các chức năng cốt lõi, bảo đảm tính đúng đắn của nghiệp vụ, tính nhất quán dữ liệu và kiểm soát truy cập. Việc tối ưu hiệu năng, khả năng mở rộng và xử lý tải đồng thời chuyên sâu được thực hiện trong phase 2.

## 8. Tiêu chí nghiệm thu

| STT | Tiêu chí nghiệm thu |
|---|---|
| 1 | Đăng nhập hợp lệ trả JWT; thông tin đăng nhập không hợp lệ bị từ chối. |
| 2 | Các API được bảo vệ từ chối yêu cầu thiếu token, token không hợp lệ, token thuộc phiên đã đăng xuất hoặc không đủ quyền truy cập. |
| 3 | Sinh viên có thể xem và cập nhật thông tin cá nhân trong phạm vi được cấp quyền; quản trị viên có thể tra cứu và cập nhật thông tin sinh viên. |
| 4 | Sinh viên tra cứu được danh sách và thông tin chi tiết các lớp học phần đang mở. |
| 5 | Đăng ký học phần thành công tạo đúng bản ghi và cập nhật sĩ số tương ứng cho từng lớp được ghi nhận. |
| 6 | Hệ thống từ chối đăng ký từng lớp khi lớp đầy, ngoài thời gian đăng ký, trùng lịch, không đạt điều kiện tiên quyết, đăng ký trùng hoặc vượt giới hạn tín chỉ, kèm mã lỗi tương ứng cho lớp đó. |
| 7 | Sinh viên xem được danh sách lớp học phần đã đăng ký và thời khóa biểu của mình. |
| 8 | Sinh viên chỉ có thể hủy đăng ký thuộc về mình khi đáp ứng điều kiện nghiệp vụ; hủy thành công cập nhật trạng thái đăng ký và sĩ số tương ứng. |
| 9 | Quản trị viên có thể tạo, cập nhật và xóa/hủy lớp học phần; dữ liệu không hợp lệ bị từ chối. |
| 10 | Quản trị viên có thể cấu hình thời gian mở và đóng đăng ký học phần. |
| 11 | OpenAPI/Swagger hoạt động và mô tả đầy đủ các endpoint được triển khai. |
| 12 | Ứng dụng và cơ sở dữ liệu khởi chạy thành công theo hướng dẫn Docker Compose; README.md cung cấp hướng dẫn cài đặt, cấu hình và sử dụng. |
| 13 | Yêu cầu đăng ký nhiều lớp ghi nhận các lớp hợp lệ và trả lý do từ chối cho các lớp còn lại; một số lớp bị từ chối không làm mất các lớp đã được ghi nhận. Yêu cầu có danh sách rỗng, trùng lớp hoặc quá 20 lớp bị từ chối toàn bộ. |