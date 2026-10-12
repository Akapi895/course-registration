
# TÀI LIỆU ĐẶC TẢ YÊU CẦU PHẦN MỀM (SRS)
## Hệ thống quản lý và đăng ký học phần

- **Dự án:** Hệ thống quản lý và đăng ký học phần
- **Mô hình:** RESTful API Backend
- **Ngôn ngữ triển khai:** Go

## 1. Giới thiệu

### 1.1. Mục đích tài liệu

Tài liệu xác định các yêu cầu chức năng, quy tắc nghiệp vụ, yêu cầu phi chức năng, đặc tả API và yêu cầu kỹ thuật của hệ thống, làm cơ sở cho quá trình thiết kế, phát triển, kiểm thử và nghiệm thu.

### 1.2. Phạm vi hệ thống

Hệ thống cung cấp RESTful API phục vụ xác thực người dùng, tra cứu lớp học phần, quản lý thông tin sinh viên, đăng ký/hủy học phần, xem thời khóa biểu và quản trị lớp học phần.

### 1.3. Đối tượng sử dụng

- Sinh viên.
- Chuyên viên/Admin.
- Business Analyst, Developer và Tester.
- Người phụ trách triển khai, vận hành và nghiệm thu.

## 2. Mô tả tổng quan

### 2.1. Các nhóm người dùng

| Tác nhân | Mô tả | Chức năng chính |
|---|---|---|
| Sinh viên | Người dùng đăng ký học phần | Đăng nhập, tra cứu lớp, đăng ký/hủy học phần, xem thời khóa biểu |
| Chuyên viên/Admin | Người dùng quản trị hệ thống | Quản lý lớp học phần, cấu hình thời gian đăng ký và các tham số nghiệp vụ |
| Client | Ứng dụng gọi API | Gửi HTTP request, nhận JSON response và cung cấp token khi cần |

### 2.2. Ranh giới hệ thống

- Backend cung cấp RESTful API, xử lý nghiệp vụ và truy cập cơ sở dữ liệu.
- Cơ sở dữ liệu lưu trữ thông tin người dùng, sinh viên, lớp học phần, đăng ký, lịch học và các dữ liệu liên quan.
- Client giao tiếp với backend thông qua HTTP/HTTPS và JSON.
- Các endpoint được bảo vệ phải áp dụng xác thực và phân quyền phù hợp.

### 2.3. Giả định và phụ thuộc

- Dữ liệu người dùng và vai trò phải được quản lý hợp lệ.
- Dữ liệu học phần, lịch học, điểm tiên quyết và số tín chỉ phải có nguồn dữ liệu đáng tin cậy.
- Các thông số chưa xác định cần được thống nhất trước khi triển khai và nghiệm thu.

## 3. Yêu cầu chức năng

### 3.1. Xác thực và quản lý phiên

| STT | Mô tả |
|---|---|
| 1 | Hệ thống cho phép đăng nhập bằng username và password. |
| 2 | Hệ thống kiểm tra thông tin đăng nhập và chỉ cấp token khi hợp lệ. | 
| 3 | Token chứa hoặc tham chiếu đến định danh và vai trò người dùng. | 
| 4 | Client gửi token trong header của các request cần xác thực. | 
| 5 | Hệ thống cung cấp chức năng đăng xuất. |
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
| 4 | Ngăn việc vượt sĩ số tối đa khi có nhiều yêu cầu đồng thời. | 
| 5 | Sinh viên xem được danh sách học phần đã đăng ký thành công của mình. | 
| 6 | Sinh viên có thể hủy đăng ký khi đáp ứng các điều kiện nghiệp vụ. | 
| 7 | Cung cấp thời khóa biểu tổng hợp từ các lớp học phần đã đăng ký. |
| 8 | Trả về kết quả đăng ký/hủy và lý do từ chối nếu có. | 

### 3.4. Quản lý thông tin sinh viên

| STT| Mô tả |
|---|---|
| 1 | Cho phép người dùng đủ quyền xem thông tin sinh viên theo mã định danh. | 
| 2 | Cho phép Admin hoặc chính sinh viên cập nhật thông tin phù hợp với quyền được cấp. | 
| 3 | Kiểm tra quyền truy cập dữ liệu để ngăn việc xem hoặc sửa trái phép. | 

### 3.5. Quản trị lớp học phần

| STT | Mô tả |
|---|---|
| 1 | Admin có thể tạo lớp học phần mới với dữ liệu hợp lệ. | 
| 2 | Admin có thể cập nhật thông tin lớp học phần. | 
| 3 | Admin có thể xóa hoặc hủy lớp học phần theo chính sách đã thống nhất. |
| 4 | Hệ thống kiểm tra dữ liệu đầu vào trước khi lưu. | 
| 5 | API quản trị từ chối request không đủ quyền. |

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
3. Hệ thống kiểm tra sĩ số, trùng lịch, điều kiện tiên quyết và giới hạn tín chỉ.
4. Hệ thống cập nhật sĩ số và tạo bản ghi đăng ký trong giao dịch có kiểm soát đồng thời.
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
| 2 | Thời gian đăng ký | Chỉ cho phép đăng ký/hủy trong khoảng thời gian do Admin cấu hình. |
| 3 | Không trùng lịch | Từ chối đăng ký nếu lịch học giao nhau với lớp đã đăng ký trong cùng học kỳ. |
| 4 | Điều kiện tiên quyết | Sinh viên phải đạt các môn tiên quyết theo quy định. |
| 5 | Giới hạn tín chỉ tối đa | Tổng số tín chỉ sau đăng ký không được vượt mức tối đa của học kỳ. |
| 6 | Giới hạn tín chỉ tối thiểu | Tổng số tín chỉ phải đạt mức tối thiểu, trừ trường hợp ngoại lệ được cho phép. |
| 7 | Quyền sở hữu đăng ký | Sinh viên chỉ được xem/hủy đăng ký của chính mình, trừ quyền quản trị được cấp. |
| 8 | Kiểm tra dữ liệu lớp | Dữ liệu tạo/cập nhật lớp phải hợp lệ và đáp ứng các ràng buộc dữ liệu. |

## 5. Yêu cầu giao diện/API

### 5.1. Quy ước chung

- API sử dụng phương thức HTTP theo nguyên tắc REST.
- Dữ liệu trao đổi sử dụng định dạng JSON.
- Tài liệu API sử dụng OpenAPI/Swagger, dự kiến truy cập tại `/swagger` hoặc `/docs`.
- Endpoint được bảo vệ yêu cầu token trong header `Authorization`, ví dụ `Bearer <token>`.
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

### 5.3. Yêu cầu dữ liệu request/response

- Request body và response body sử dụng JSON.
- Mỗi API cần xác định trường dữ liệu, kiểu dữ liệu, trường bắt buộc và quy tắc validation.
- Cấu trúc response, mã lỗi và ví dụ request/response phải được mô tả trong OpenAPI/Swagger.


## 6. Yêu cầu phi chức năng

| STT | Nhóm | Yêu cầu | Tiêu chí/ghi chú |
|---|---|---|---|
| 1 | Khả năng mở rộng | Backend nên sử dụng kiến trúc stateless để hỗ trợ mở rộng ngang. | Có thể tăng số lượng instance/container. |
| 2 | Hiệu năng | API GET thông thường phản hồi dưới 200 ms. | Cần xác định điều kiện tải kiểm thử. |
| 3| Hiệu năng | API đăng ký học phần phản hồi dưới 500 ms. | Đo cả trường hợp thành công và bị từ chối. |
| 4| Kiểm thử tải | Thực hiện load testing trên môi trường CPU của Kaggle. | Báo cáo latency, throughput, concurrency và tỷ lệ lỗi. |
| 5 | Bảo mật | Mật khẩu phải được băm bằng thuật toán phù hợp; không lưu plaintext. | Không ghi dữ liệu nhạy cảm vào log. |
| 6| Bảo mật | Môi trường triển khai thực tế phải sử dụng HTTPS. | Cấu hình TLS phù hợp. |
| 7| Bảo mật | Authentication và authorization phải được xử lý bằng middleware/filter/interceptor. | Không lặp logic kiểm tra token trong từng controller. |
| 8 | Tính sẵn sàng | Hệ thống phải xử lý tải cao có kiểm soát và hỗ trợ graceful degradation. | Cần đánh giá các điểm lỗi đơn trong kiến trúc triển khai. |
| 9 | Đồng thời | Quá trình đăng ký phải ngăn race condition và không cho phép vượt sĩ số. | Sử dụng transaction, locking hoặc optimistic locking phù hợp. |

## 7. Yêu cầu kiến trúc và triển khai

### 7.1. Kiến trúc phân tầng

| Tầng | Trách nhiệm | Ràng buộc |
|---|---|---|
| API / Controller | Tiếp nhận HTTP request, routing, parse JSON và trả HTTP response. | Không chứa quy tắc nghiệp vụ cốt lõi hoặc truy vấn SQL trực tiếp. |
| Business / Service | Thực thi quy tắc nghiệp vụ, kiểm tra điều kiện và điều phối xử lý. | Không phụ thuộc trực tiếp vào HTTP Request/Response hoặc câu lệnh SQL cụ thể. |
| Data Access / Repository | Đọc/ghi dữ liệu và truy vấn cơ sở dữ liệu. | Có thể sử dụng ORM hoặc Data Mapper; đảm bảo giao dịch và toàn vẹn dữ liệu. |

### 7.2. Bảo mật và middleware

- Hệ thống sử dụng JWT cho xác thực; token chứa định danh và vai trò người dùng.
- Authentication và authorization được áp dụng bằng middleware/filter/interceptor ở mức global hoặc route group.
- Controller không lặp lại mã kiểm tra token/quyền trong từng endpoint.
- Phải kiểm tra quyền ở cả cấp chức năng và phạm vi dữ liệu.

### 7.3. Công nghệ và đóng gói

| Hạng mục | Yêu cầu |
|---|---|
| Ngôn ngữ | Go |
| Giao tiếp | RESTful API, JSON |
| Tài liệu API | OpenAPI/Swagger |
| Container | Cung cấp `Dockerfile` và `docker-compose.yml` để chạy ứng dụng cùng cơ sở dữ liệu bằng một lệnh. |
| Cơ sở dữ liệu | PostgreSQL; chi tiết lựa chọn tại ADR-02. |
| Mã nguồn | Quản lý trên GitHub; commit rõ ràng, chia theo feature hoặc bug fix. |
| Tài liệu dự án | `README.md` chứa kiến trúc, hướng dẫn setup/chạy Docker và thông tin cấu hình cần thiết. |

### 7.4. Nguyên tắc phát triển

Ưu tiên hoàn thiện và kiểm thử các chức năng cốt lõi, bảo đảm tính đúng đắn của quy tắc nghiệp vụ, tính nhất quán dữ liệu và kiểm soát truy cập trước khi tối ưu hóa vi mô.

## 8. Tiêu chí nghiệm thu

| STT | Tiêu chí nghiệm thu |
|---|---|
| 1 | Đăng nhập hợp lệ trả token/session; thông tin đăng nhập không hợp lệ bị từ chối. |
| 2 | Endpoint được bảo vệ từ chối request thiếu/sai token hoặc không đủ quyền. |
| 3 | Sinh viên tra cứu được danh sách và chi tiết lớp học phần đang mở. |
| 4 | Đăng ký thành công tạo đúng bản ghi và cập nhật sĩ số nhất quán. |
| 5 | Hệ thống từ chối đăng ký khi lớp đầy, ngoài thời gian đăng ký, trùng lịch, không đạt tiên quyết hoặc vi phạm giới hạn tín chỉ. |
| 6| Khi chỉ còn một chỗ và có nhiều request đồng thời, số đăng ký thành công không vượt quá số chỗ còn lại. |
| 7 | Sinh viên chỉ xem/hủy được bản ghi đăng ký thuộc về mình. |
| 8 | Admin có thể tạo, cập nhật và xóa/hủy lớp với dữ liệu hợp lệ; dữ liệu không hợp lệ bị từ chối. |
| 9 | OpenAPI/Swagger hoạt động và mô tả các endpoint được triển khai. |
| 10 | Ứng dụng và cơ sở dữ liệu khởi chạy được theo hướng dẫn Docker; README.md đầy đủ. |
| 11 | Có báo cáo load test trên Kaggle CPU và đối chiếu kết quả với ngưỡng hiệu năng đã thống nhất. |

