# ADR-03: Xác thực API bằng JWT

## Bối cảnh

Frontend cần gửi thông tin xác thực khi gọi API; backend cần xác định tài khoản, vai trò và phiên đăng nhập của người gửi. SRS yêu cầu dùng JWT và không có luồng làm mới token trong phạm vi hiện tại.

## Quyết định

Dùng JWT ký bằng HS256 làm access token, gửi qua header `Authorization: Bearer <token>`. Token chứa `sub`, `role`, `sid`, `iat`, `exp`; hết hạn thì người dùng đăng nhập lại.

JWT có định dạng chuẩn và thư viện xác minh sẵn cho Go. HS256 phù hợp khi cùng một backend phát hành và xác minh token, không cần quản lý cặp khóa bất đối xứng. Khóa ký được nạp từ biến môi trường.

Một chuỗi token ngẫu nhiên chỉ dùng để tra cứu phiên cũng có thể đáp ứng bài toán. Dự án giữ JWT theo SRS, đồng thời liên kết với phiên trong cơ sở dữ liệu như [ADR-04](04-database-backed-auth-sessions.md). Với thiết kế này, JWT không giúp loại bỏ truy vấn kiểm tra phiên.

## Đánh đổi

Chữ ký bảo vệ tính toàn vẹn, không mã hóa nội dung token; vì vậy không đưa mật khẩu hay dữ liệu nhạy cảm vào JWT. Backend phải kiểm tra cả token, phiên và vai trò hiện tại trước khi phân quyền. Nếu khóa HS256 bị lộ, bên có khóa có thể ký token giả.

## Tài liệu liên quan

- [SRS](../SRS.md), §3.1 và §7.2.
- [Thiết kế API](../api-design.md), mục Vòng đời xác thực.
