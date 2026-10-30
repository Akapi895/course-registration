# ADR-02: Lựa chọn cơ sở dữ liệu - PostgreSQL

## Bối cảnh

Dữ liệu tài khoản, học phần, lớp học phần và đăng ký có quan hệ chặt chẽ. Việc ghi nhận đăng ký và thay đổi sĩ số cần cùng thành công hoặc cùng hoàn tác; các bản ghi trùng hay tham chiếu không hợp lệ phải bị từ chối ngay tại cơ sở dữ liệu.

## Quyết định

Chọn PostgreSQL cho toàn bộ dữ liệu của hệ thống. PostgreSQL hỗ trợ transaction, khóa ngoại, `UNIQUE`, `CHECK` và có driver pgx cho Go. Cơ sở dữ liệu chạy cùng ứng dụng qua Docker Compose, dữ liệu được lưu trong volume.

MySQL/MariaDB cũng đáp ứng được bài toán. SQLite đơn giản hơn về triển khai nhưng chỉ cho phép một tác vụ ghi tại một thời điểm; MongoDB không thuận tiện bằng cơ sở dữ liệu quan hệ khi cần ràng buộc giữa các bảng. PostgreSQL phù hợp với mô hình dữ liệu và cách truy cập bằng SQL của dự án.

Việc kiểm tra chỗ trống và tăng sĩ số được gộp trong một câu lệnh:

```sql
UPDATE course_classes SET enrolled = enrolled + 1
WHERE id = $1
  AND status = 'active'
  AND enrolled < max_capacity;
```

Thay đổi sĩ số và ghi đăng ký nằm trong cùng một transaction để tránh dữ liệu lệch nhau khi có lỗi.

## Đánh đổi

Nhóm cần cấu hình thêm một dịch vụ, quản lý kết nối và dữ liệu lưu trữ. Các truy vấn dùng cú pháp riêng của PostgreSQL cũng làm việc chuyển sang hệ quản trị khác tốn công hơn.

## Tài liệu liên quan

- [SRS](../SRS.md), §7.3.
- [Thiết kế cơ sở dữ liệu](../database-design.md).
