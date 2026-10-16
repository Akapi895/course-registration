# TÀI LIỆU ĐẶC TẢ YÊU CẦU PHẦN MỀM (SRS)
## Hệ thống quản lý và đăng ký học phần

- **Dự án:** Hệ thống quản lý và đăng ký học phần
- **Kiến trúc API:** RESTful API
- **Ngôn ngữ triển khai:** Go

## 1. Giới thiệu

### 1.1. Mục đích tài liệu

Tài liệu xác định các yêu cầu chức năng, quy tắc nghiệp vụ, yêu cầu phi chức năng, đặc tả API và yêu cầu kỹ thuật của hệ thống, làm cơ sở cho quá trình thiết kế, phát triển, kiểm thử và nghiệm thu.

### 1.2. Phạm vi hệ thống

Hệ thống cung cấp RESTful API phục vụ xác thực người dùng, tra cứu lớp học phần, quản lý thông tin sinh viên, đăng ký/hủy học phần, xem thời khóa biểu và quản trị lớp học phần.

### 1.3. Đối tượng sử dụng

- Sinh viên.
- Chuyên viên (Admin).

## 2. Mô tả tổng quan

### 2.1. Các nhóm người dùng

| Tác nhân | Mô tả | Chức năng chính |
|---|---|---|
| Sinh viên | Người dùng đăng ký học phần | Đăng nhập, tra cứu lớp, đăng ký/hủy học phần, xem thời khóa biểu |
| Chuyên viên (Admin) | Người dùng quản trị hệ thống | Tra cứu, cập nhật thông tin sinh viên; quản lý lớp học phần; cấu hình thời gian đăng ký |

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
| 3 | JWT chứa định danh, vai trò người dùng và thời gian hết hạn. |
| 4 | Client gửi JWT trong header Authorization: `Bearer <token>` đối với các API yêu cầu xác thực. |
| 5 | Hệ thống cung cấp API đăng xuất; client xóa JWT đang lưu sau khi gọi API đăng xuất. |
| 6 | Hệ thống cung cấp API lấy thông tin người dùng hiện tại. |

### 3.2. Tra cứu lớp học phần

| STT | Mô tả |
|---|---|
| 1 | Trả về danh sách lớp học phần đang mở đăng ký. |
| 2 | Hỗ trợ lọc danh sách theo khoa, ngành hoặc tiêu chí phù hợp. |
| 3 | Cung cấp thông tin chi tiết lớp học phần, giảng viên, phòng học, lịch học và tình trạng sĩ số. |

### 3.3. Đăng ký và hủy học phần

| STT | Mô tả |
|---|---|
| 1 | Sinh viên đã xác thực có thể gửi yêu cầu đăng ký lớp học phần. |
| 2 | Hệ thống kiểm tra các quy tắc nghiệp vụ trước khi ghi nhận đăng ký. |
| 3 | Ghi nhận đăng ký và cập nhật sĩ số nhất quán trong giao dịch dữ liệu. |
| 4 | Sinh viên xem được danh sách học phần đã đăng ký thành công của mình. |
| 5 | Sinh viên có thể hủy đăng ký khi đáp ứng các điều kiện nghiệp vụ. |
| 6 | Hệ thống cập nhật trạng thái đăng ký và sĩ số lớp học phần khi hủy đăng ký thành công. |
| 7 | Cung cấp thời khóa biểu tổng hợp từ các lớp học phần đã đăng ký. |
| 8 | Trả về kết quả đăng ký/hủy và lý do từ chối nếu có. |

### 3.4. Quản lý thông tin sinh viên

| STT| Mô tả |
|---|---|
| 1 | Cho phép người dùng đủ quyền xem thông tin sinh viên theo mã định danh. |
| 2 | Cho phép admin hoặc chính sinh viên cập nhật thông tin phù hợp với quyền được cấp. |
| 3 | Kiểm tra quyền truy cập dữ liệu để ngăn việc xem hoặc sửa trái phép. |

### 3.5. Quản trị lớp học phần

| STT | Mô tả |
|---|---|
| 1 | Admin có thể tạo lớp học phần mới với dữ liệu hợp lệ. |
| 2 | Admin có thể cập nhật thông tin lớp học phần. |
| 3 | Admin có thể xóa hoặc hủy lớp học phần theo chính sách đã thống nhất. |
| 4 | Hệ thống kiểm tra dữ liệu đầu vào trước khi lưu. |
| 5 | Các API quản trị từ chối request không đủ quyền. |
| 6 | Admin có thể cấu hình thời gian mở và đóng đăng ký học phần. |

### 3.6. Luồng nghiệp vụ chính

#### 3.6.1. Đăng nhập

1. Người dùng gửi username và password tới API đăng nhập.
2. Hệ thống kiểm tra thông tin xác thực.
3. Nếu hợp lệ, hệ thống tạo JWT gắn với định danh và vai trò người dùng.
4. Hệ thống trả token và thông tin cần thiết cho client.
5. Client gửi token trong header của các request cần xác thực.

#### 3.6.2. Đăng ký học phần

1. Sinh viên đã đăng nhập gửi yêu cầu đăng ký lớp học phần.
2. Hệ thống xác thực người dùng và kiểm tra thời gian đăng ký.
3. Hệ thống kiểm tra sĩ số, đăng ký trùng, trùng lịch, điều kiện tiên quyết và giới hạn tín chỉ.
4. Nếu đáp ứng các điều kiện, hệ thống ghi nhận đăng ký và cập nhật sĩ số trong cùng giao dịch dữ liệu.
5. Hệ thống trả xác nhận đăng ký nếu hợp lệ; nếu không, trả lỗi tương ứng.

#### 3.6.3. Tra cứu lớp học phần

1. Client yêu cầu danh sách lớp học phần đang mở, có thể kèm bộ lọc.
2. Hệ thống trả về danh sách phù hợp.
3. Client gửi yêu cầu xem chi tiết lớp theo mã lớp.
4. Hệ thống trả thông tin lớp, giảng viên, phòng học, lịch học và sĩ số.

#### 3.6.4. Quản trị lớp học phần

1. Admin đăng nhập và được xác thực quyền.
2. Admin gửi request tạo mới, cập nhật hoặc xóa/hủy lớp học phần.
3. Hệ thống kiểm tra dữ liệu đầu vào và các ràng buộc liên quan.
4. Hệ thống lưu thay đổi nếu hợp lệ và trả kết quả cho client.

## 4. Quy tắc nghiệp vụ

| STT | Quy tắc | Mô tả |
|---|---|---|
| 1 | Giới hạn sĩ số | Không chấp nhận đăng ký nếu số lượng đã đăng ký đạt `max_capacity`. |
| 2 | Thời gian đăng ký | Chỉ cho phép đăng ký/hủy trong khoảng thời gian do admin cấu hình. |
| 3 | Không trùng lịch | Từ chối đăng ký nếu lịch học giao nhau với lớp đã đăng ký trong cùng học kỳ. |
| 4 | Không đăng ký trùng | Sinh viên không được đăng ký nhiều lần cùng một lớp học phần trong cùng học kỳ. |
| 5 | Điều kiện tiên quyết | Sinh viên phải đạt các môn tiên quyết theo quy định. |
| 6 | Giới hạn tín chỉ tối đa | Tổng số tín chỉ sau đăng ký không được vượt mức tối đa của học kỳ. |
| 7 | Thời gian đăng ký hợp lệ | Thời gian mở đăng ký phải sớm hơn thời gian đóng đăng ký. |
| 8 | Quyền sở hữu đăng ký | Sinh viên chỉ được xem/hủy đăng ký của chính mình, trừ quyền quản trị được cấp. |
| 9 | Kiểm tra dữ liệu lớp | Dữ liệu tạo/cập nhật lớp phải hợp lệ và đáp ứng các ràng buộc dữ liệu. |

## 5. Yêu cầu giao diện và API

### 5.1. Quy ước chung

- API sử dụng phương thức HTTP theo nguyên tắc REST.
- Dữ liệu trao đổi sử dụng định dạng JSON.
- Tài liệu API sử dụng OpenAPI/Swagger, dự kiến truy cập tại `/swagger` hoặc `/docs`.
- Endpoint được bảo vệ yêu cầu token trong header `Authorization: Bearer <token>`.
- API phải trả mã trạng thái HTTP và thông báo lỗi nhất quán.

### 5.2. Danh sách endpoint

| Nhóm | Phương thức | Endpoint | Mô tả | Quyền truy cập |
|---|---|---|---|---|
| Xác thực | POST | `/api/auth/login` | Đăng nhập, trả token | Công khai |
| Xác thực | POST | `/api/auth/logout` | Đăng xuất | Đã xác thực |
| Xác thực | GET | `/api/auth/me` | Lấy thông tin người dùng hiện tại | Đã xác thực |
| Sinh viên | GET | `/api/students/{id}` | Xem chi tiết sinh viên | Theo quyền |
| Sinh viên | PUT | `/api/students/{id}` | Cập nhật thông tin sinh viên | Admin hoặc chính sinh viên |
| Lớp học phần | GET | `/api/classes` | Danh sách lớp đang mở | Công khai |
| Lớp học phần | GET | `/api/classes/{id}` | Chi tiết lớp học phần | Công khai |
| Đăng ký | POST | `/api/registrations` | Đăng ký học phần | Sinh viên |
| Đăng ký | GET | `/api/registrations` | Danh sách đăng ký của sinh viên hiện tại | Sinh viên |
| Đăng ký | DELETE | `/api/registrations/{id}` | Hủy đăng ký | Sinh viên sở hữu đăng ký |
| Thời khóa biểu | GET | `/api/schedules` | Lấy thời khóa biểu | Sinh viên |
| Quản trị lớp | POST | `/api/classes` | Tạo lớp học phần | Admin |
| Quản trị lớp | PUT | `/api/classes/{id}` | Cập nhật lớp học phần | Admin |
| Quản trị lớp | DELETE | `/api/classes/{id}` | Xóa/hủy lớp học phần | Admin |
| Cấu hình đăng ký | PUT | `/api/registration-period` | Cấu hình thời gian mở và đóng đăng ký học phần | Admin |

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
| API / Controller | Tiếp nhận HTTP request, xử lý dữ liệu đầu vào và trả HTTP response. |
| Business / Service | Xử lý logic nghiệp vụ và kiểm tra các điều kiện liên quan. |
| Data Access / Repository | Thực hiện truy vấn và thao tác với cơ sở dữ liệu. |

### 7.2. Xác thực và phân quyền

- Hệ thống sử dụng JWT để xác thực người dùng.
- Các API yêu cầu xác thực phải kiểm tra tính hợp lệ của token.
- Hệ thống phân quyền truy cập dựa trên vai trò người dùng.
- Người dùng chỉ được truy cập và thao tác trên dữ liệu thuộc phạm vi quyền hạn của mình.

### 7.3. Công nghệ và đóng gói

| Hạng mục | Yêu cầu |
|---|---|
| Ngôn ngữ | Go |
| Giao tiếp | RESTful API, JSON |
| Tài liệu API | OpenAPI/Swagger |
| Cơ sở dữ liệu | PostgreSQL |
| Container | Docker, Docker Compose |
| Mã nguồn | Git, GitHub |
| Tài liệu dự án | `README.md` hướng dẫn cài đặt, cấu hình và khởi chạy hệ thống |

### 7.4. Nguyên tắc phát triển

Phase 1 ưu tiên hoàn thiện các chức năng cốt lõi, bảo đảm tính đúng đắn của nghiệp vụ, tính nhất quán dữ liệu và kiểm soát truy cập. Việc tối ưu hiệu năng, khả năng mở rộng và xử lý tải đồng thời chuyên sâu được thực hiện trong phase 2.

## 8. Tiêu chí nghiệm thu

| STT | Tiêu chí nghiệm thu |
|---|---|
| 1 | Đăng nhập hợp lệ trả JWT; thông tin đăng nhập không hợp lệ bị từ chối. |
| 2 | Các API được bảo vệ từ chối yêu cầu thiếu token, token không hợp lệ hoặc không đủ quyền truy cập. |
| 3 | Sinh viên có thể xem và cập nhật thông tin cá nhân trong phạm vi được cấp quyền; admin có thể tra cứu và cập nhật thông tin sinh viên. |
| 4 | Sinh viên tra cứu được danh sách và thông tin chi tiết các lớp học phần đang mở. |
| 5 | Đăng ký học phần thành công tạo đúng bản ghi và cập nhật sĩ số tương ứng. |
| 6 | Hệ thống từ chối đăng ký khi lớp đầy, ngoài thời gian đăng ký, trùng lịch, không đạt điều kiện tiên quyết, đăng ký trùng hoặc vượt giới hạn tín chỉ. |
| 7 | Sinh viên xem được danh sách lớp học phần đã đăng ký và thời khóa biểu của mình. |
| 8 | Sinh viên chỉ có thể hủy đăng ký thuộc về mình khi đáp ứng điều kiện nghiệp vụ; hủy thành công cập nhật trạng thái đăng ký và sĩ số tương ứng. |
| 9 | Admin có thể tạo, cập nhật và xóa/hủy lớp học phần; dữ liệu không hợp lệ bị từ chối. |
| 10 | Admin có thể cấu hình thời gian mở và đóng đăng ký học phần. |
| 11 | OpenAPI/Swagger hoạt động và mô tả đầy đủ các endpoint được triển khai. |
| 12 | Ứng dụng và cơ sở dữ liệu khởi chạy thành công theo hướng dẫn Docker Compose; README.md cung cấp hướng dẫn cài đặt, cấu hình và sử dụng. |