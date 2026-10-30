# ADR-04: Lưu phiên đăng nhập trong PostgreSQL

## Bối cảnh

JWT còn hạn không tự mất hiệu lực khi người dùng đăng xuất. Hệ thống còn cần giới hạn mỗi sinh viên ở một phiên hoạt động và áp dụng thời gian chờ đăng nhập lại. Các yêu cầu này cần trạng thái được lưu ở backend, không thể chỉ dựa vào token phía client.

## Quyết định

Lưu mỗi phiên trong bảng `auth_sessions`, liên kết với JWT qua claim `sid`. Dùng PostgreSQL sẵn có để phiên tồn tại qua các lần khởi động lại backend, thay vì lưu trong bộ nhớ hoặc bổ sung một dịch vụ lưu trữ riêng.

Bảng chỉ giữ `id`, `user_id`, `created_at`, `expires_at`, `logged_out_at`. Phiên hoạt động khi chưa đăng xuất và chưa đến `expires_at`; không cần cột trạng thái hay tác vụ nền đánh dấu hết hạn.

- Đăng xuất chỉ ghi `logged_out_at` một lần cho phiên hiện tại còn hạn. Phiên tự hết hạn giữ trường này là `NULL`.
- Giữ bản ghi đã kết thúc để tính thời gian chờ từ `COALESCE(logged_out_at, expires_at)`, thay vì lưu thêm một mốc cho phép đăng nhập ở bảng `users`.
- Sau khi kiểm tra mật khẩu, backend khóa dòng tài khoản, kiểm tra phiên gần nhất và tạo phiên trong cùng transaction. Sinh viên còn phiên hoạt động bị từ chối đăng nhập mới; quản trị viên được có nhiều phiên và không phải chờ.
- Mỗi request được bảo vệ đều kiểm tra phiên và vai trò hiện tại trong cơ sở dữ liệu. Backend dùng cùng mốc thời gian ứng dụng để kiểm tra JWT và phiên, tránh lệch đồng hồ giữa các máy.

## Đánh đổi

Mỗi request được bảo vệ cần thêm truy vấn, nên việc xác thực phụ thuộc vào PostgreSQL. Lịch sử phiên cũng tăng dần theo số lần đăng nhập. Đổi lại, backend có thể từ chối token đã đăng xuất và kiểm soát phiên thống nhất trên mọi thiết bị.

## Tài liệu liên quan

- [SRS](../SRS.md), §3.1, §3.5.1 và mục "Quy tắc một phiên và đăng nhập lại" (sau §3.1).
- [Thiết kế cơ sở dữ liệu](../database-design.md), §3.8.
- [Thiết kế API](../api-design.md), mục Vòng đời xác thực.
