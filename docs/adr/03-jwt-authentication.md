# ADR-03: Xác thực bằng JWT

SRS yêu cầu dùng JWT và không có luồng làm mới token. Access token ký HS256, gửi qua `Authorization: Bearer <token>`, chứa `sub`, `role`, `sid`, `iat`, `exp`; hết hạn thì người dùng đăng nhập lại. HS256 đủ dùng vì cùng một backend vừa phát hành vừa xác minh token, không cần cặp khóa bất đối xứng. Khóa ký lấy từ biến môi trường.

Vì mỗi request vẫn phải đối chiếu token với phiên trong database ([ADR-04](04-database-backed-auth-sessions.md)), JWT ở đây không tiết kiệm được truy vấn nào so với một chuỗi token ngẫu nhiên. Dự án giữ JWT vì SRS yêu cầu. Backend kiểm tra cả token, phiên và vai trò hiện tại của tài khoản trước khi phân quyền.
