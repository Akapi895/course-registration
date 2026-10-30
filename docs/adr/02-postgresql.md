# ADR-02: Chọn PostgreSQL

Dữ liệu tài khoản, học phần, lớp và đăng ký có quan hệ chặt với nhau, và việc ghi đăng ký phải đi cùng thay đổi sĩ số. Chọn PostgreSQL vì có transaction, khóa ngoại, `UNIQUE`, `CHECK` và driver pgx cho Go, nên bản ghi trùng hoặc tham chiếu sai bị từ chối ngay ở database. Database chạy cùng ứng dụng trong Docker Compose, dữ liệu lưu trong volume.

Kiểm tra chỗ trống và tăng sĩ số gộp trong một câu lệnh, nằm cùng transaction với việc ghi đăng ký:

```sql
UPDATE course_classes SET enrolled = enrolled + 1
WHERE id = $1
  AND status = 'active'
  AND enrolled < max_capacity;
```

Đổi lại, nhóm phải chạy thêm một dịch vụ và quản lý kết nối, còn các truy vấn dùng cú pháp riêng của PostgreSQL nên khó chuyển sang hệ khác.
