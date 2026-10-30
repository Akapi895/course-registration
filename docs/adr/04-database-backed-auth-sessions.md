# ADR-04: Lưu phiên đăng nhập trong PostgreSQL

JWT còn hạn không tự mất hiệu lực khi người dùng đăng xuất, trong khi hệ thống phải giới hạn mỗi sinh viên một phiên hoạt động và bắt chờ trước khi đăng nhập lại. Vì vậy cần trạng thái ở backend: mỗi phiên là một dòng trong bảng `auth_sessions`, gắn với JWT qua claim `sid`. Dùng PostgreSQL có sẵn để phiên không mất khi backend khởi động lại, thay vì giữ trong bộ nhớ hoặc thêm một dịch vụ như Redis.

Bảng chỉ có `id`, `user_id`, `created_at`, `expires_at`, `logged_out_at`, không có cột trạng thái và không có tác vụ nền: phiên hoạt động khi chưa đăng xuất và chưa đến `expires_at`. Bản ghi đã kết thúc được giữ lại để tính cooldown từ `COALESCE(logged_out_at, expires_at)`, nên bảng `users` không cần thêm cột "được đăng nhập từ". Khi đăng nhập, backend khóa dòng tài khoản rồi kiểm tra phiên gần nhất và tạo phiên trong cùng transaction. JWT và các câu SQL dùng chung một mốc thời gian của ứng dụng, để không lệch đồng hồ giữa API và database.

Đổi lại, mỗi request được bảo vệ thêm một truy vấn nên xác thực phụ thuộc vào PostgreSQL, và lịch sử phiên tăng dần theo số lần đăng nhập. Quy tắc chi tiết nằm ở SRS §3.1.
