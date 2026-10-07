# ADR-0001: Lựa chọn ngôn ngữ backend

- Trạng thái: Đã chọn
- Ngày: 07/10/2026
- Ngôn ngữ: Go

## Bài toán cần giải quyết

Website đăng ký học phần cần hỗ trợ tra cứu môn học, xem lớp mở, đăng ký và hủy đăng ký. Ngoài việc trả về dữ liệu, backend còn phải kiểm tra các điều kiện như trùng lịch, giới hạn tín chỉ và sĩ số lớp.

Điểm cần chú ý là thời điểm mở đăng ký. Nhiều sinh viên có thể truy cập và chọn cùng một lớp trong khoảng thời gian ngắn. Backend cần phản hồi ổn định khi số lượng yêu cầu tăng, đồng thời bảo đảm không đăng ký vượt sĩ số hoặc ghi nhận một lượt đăng ký nhiều lần.

Vì vậy, việc chọn ngôn ngữ dựa trên các yêu cầu sau:

- Xử lý tốt nhiều yêu cầu cùng lúc.
- Dễ đóng gói và triển khai.
- Có thư viện đáp ứng các nhu cầu cơ bản: HTTP, xác thực, truy cập cơ sở dữ liệu và kiểm thử.
- Code dễ đọc, dễ bảo trì khi nhiều thành viên cùng làm.
- Thời gian học và xây dựng phù hợp với tiến độ dự án.

## So sánh các lựa chọn

Các lựa chọn được xem xét gồm Go, TypeScript chạy trên Node.js, Java, Python, C# và PHP. Node.js là môi trường chạy, không phải ngôn ngữ; trong tài liệu này, lựa chọn đó được hiểu là dùng TypeScript để viết backend.

Bảng dưới so sánh theo cách sử dụng phổ biến của từng lựa chọn. Đây chưa phải kết quả đo trên hệ thống thực tế, nên không dùng điểm số để xếp hạng hiệu năng.

| Lựa chọn | Điểm thuận lợi | Điều cần cân nhắc |
|---|---|---|
| **Go** | Có sẵn công cụ viết HTTP server, hỗ trợ xử lý đồng thời bằng goroutine, đóng gói ứng dụng gọn | Phải tự viết nhiều phần xử lý; cần làm quen với cách quản lý lỗi và goroutine |
| **TypeScript / Node.js** | Thuận tiện nếu frontend cũng dùng TypeScript; nhiều thư viện; phù hợp với các API chủ yếu chờ dữ liệu từ database hoặc dịch vụ khác | Tác vụ tính toán kéo dài có thể chặn event loop nếu không được tách riêng |
| **Java / Spring Boot** | Có sẵn nhiều chức năng cho xác thực, truy cập dữ liệu và transaction; công cụ và tài liệu đầy đủ | Cần thời gian nắm cách Spring hoạt động; phải cấu hình và vận hành JVM |
| **Python / Django hoặc FastAPI** | Cú pháp dễ đọc; Django có sẵn nhiều chức năng, FastAPI thuận tiện để xây API | Tác vụ tính toán thường chậm hơn ngôn ngữ biên dịch; cần chọn mô hình worker và async phù hợp |
| **C# / ASP.NET Core** | Hiệu năng tốt, kiểu dữ liệu tĩnh, framework đầy đủ; chạy được trên Linux | Cần học các quy ước của .NET và lựa chọn cách đóng gói ứng dụng phù hợp |
| **PHP / Laravel** | Xây các chức năng quản lý và CRUD nhanh; có sẵn xác thực, ORM, migration và công cụ hàng đợi | Cần cấu hình PHP-FPM hoặc môi trường chạy khác phù hợp với tải; khả năng kiểm tra kiểu phụ thuộc vào cách viết code |

Tất cả các lựa chọn trên đều có thể dùng để xây hệ thống đăng ký học phần. Khác biệt chính nằm ở cách phát triển và vận hành, chứ không phải chỉ một ngôn ngữ mới xử lý được bài toán này.

## Vì sao chọn Go?

### Phù hợp với backend phục vụ nhiều yêu cầu đồng thời

Go có goroutine và thư viện `net/http` để xử lý nhiều yêu cầu cùng lúc. Với API thường phải chờ truy vấn database, cách xử lý này khá thuận tiện: mỗi yêu cầu có thể được phục vụ riêng mà code vẫn dễ theo dõi.

Đây là điểm phù hợp với thời điểm mở đăng ký, nhưng không đồng nghĩa chọn Go là hệ thống tự chịu được tải lớn. Tốc độ truy vấn, số kết nối tới database và cách cập nhật sĩ số vẫn cần được thiết kế và kiểm thử.

Đặc biệt, goroutine hay channel không tự ngăn được việc đăng ký vượt sĩ số. Việc kiểm tra chỗ còn lại và ghi nhận đăng ký cần được xử lý nhất quán trong database, bằng transaction kết hợp khóa hoặc cập nhật có điều kiện. Cách này vẫn cần thiết khi backend chạy trên nhiều máy.

### Đóng gói và triển khai tương đối đơn giản

Ứng dụng Go được biên dịch thành file thực thi cho hệ điều hành và kiến trúc máy đích. Với các thư viện viết thuần Go, ứng dụng thường có thể chạy mà không cần cài thêm môi trường chạy riêng trên máy chủ.

Điều này giúp việc đưa backend vào Docker và triển khai dễ quản lý hơn. Kích thước bản build và tài nguyên sử dụng vẫn phụ thuộc vào thư viện, cấu hình và chức năng thực tế; cần đo sau khi có ứng dụng.

### Code ít cú pháp, thuận tiện khi làm việc nhóm

Go có kiểu dữ liệu tĩnh và bộ công cụ thống nhất như `gofmt`, `go test`, `go vet`. Nhóm có thể dùng chung cách định dạng và kiểm tra code ngay từ đầu, giảm thời gian tranh luận về những quy ước nhỏ.

Trình biên dịch giúp phát hiện lỗi về kiểu dữ liệu và lời gọi hàm trước khi chạy. Những lỗi nghiệp vụ như kiểm tra sai điều kiện đăng ký vẫn phải được phát hiện bằng kiểm thử.

### Đủ thư viện cho phạm vi dự án

Backend cần API, xác thực, truy cập database và kiểm thử. Go có thư viện phục vụ các nhu cầu này, từ thư viện chuẩn đến các lựa chọn như Gin, Echo, các driver database, GORM hoặc sqlc.

Go không cung cấp sẵn nhiều chức năng như Django hay Laravel, nhưng nhóm có thể chọn từng thư viện theo nhu cầu. Đổi lại, việc ghép các thành phần và tổ chức code sẽ cần nhiều công sức hơn.

## Những điểm phải chấp nhận khi dùng Go

Chọn Go cũng có nghĩa là nhóm cần dành thời gian làm quen với một số cách viết khác JavaScript, Java hoặc Python. Phần xử lý lỗi thường phải viết rõ ở từng bước, nên code có thể dài hơn. Framework cũng không quyết định sẵn toàn bộ cấu trúc dự án; nhóm cần thống nhất cách chia phần xử lý HTTP, nghiệp vụ và truy cập dữ liệu.

Để tránh mất thời gian ở giai đoạn đầu, nên bắt đầu bằng một luồng nhỏ hoàn chỉnh, chẳng hạn xem danh sách lớp mở. Qua đó, nhóm thống nhất cách viết API, trả lỗi, truy vấn database và viết kiểm thử rồi mới mở rộng các chức năng khác.

Về concurrency, ưu tiên xử lý trong phạm vi từng request và tận dụng thư viện có sẵn. Chỉ tạo thêm goroutine khi có nhu cầu cụ thể, kèm cơ chế giới hạn, hủy tác vụ và xử lý lỗi. Chức năng đăng ký cần được kiểm thử với nhiều yêu cầu cùng lúc, nhất là trường hợp lớp chỉ còn một chỗ.

## Kết luận

Chọn **Go** cho backend vì cách xử lý đồng thời, đóng gói ứng dụng và bộ công cụ của ngôn ngữ này phù hợp với hướng xây dựng dự án. Nhóm chấp nhận viết thêm một số phần mà các framework khác đã cung cấp sẵn để đổi lấy cấu trúc dễ kiểm soát và cách triển khai gọn.

Framework web và thư viện truy cập database sẽ được chọn riêng. Sau khi có chức năng đăng ký, cần kiểm thử tải và kiểm tra tính nhất quán dữ liệu để đánh giá thiết kế thực tế.
