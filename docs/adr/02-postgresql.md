# ADR-0002: Lựa chọn cơ sở dữ liệu - PostgreSQL

## Bài toán cần giải quyết

SRS yêu cầu cơ sở dữ liệu hỗ trợ transaction và ràng buộc toàn vẹn, nhưng chưa chỉ định hệ quản trị cụ thể. Yêu cầu nặng nhất nằm ở chức năng đăng ký: nhiều sinh viên cùng gửi yêu cầu vào một lớp chỉ còn đúng một chỗ, và luồng "kiểm tra sĩ số → ghi nhận đăng ký" phải diễn ra nguyên tử. Nếu tách hai bước này xử lý riêng, request chen lúc giữa chừng sẽ làm hệ thống nhận thừa đăng ký — đúng trường hợp tiêu chí nghiệm thu số 6 muốn loại trừ.

Trước khi viết schema, nhóm cần chốt hệ quản trị cụ thể vì lựa chọn này quyết định driver, công cụ migration và cách viết phần xử lý đăng ký.

## Các lựa chọn đã xem xét

| Lựa chọn | Điểm thuận lợi | Điều cần cân nhắc |
|---|---|---|
| **PostgreSQL** | Row-level locking với MVCC, ràng buộc toàn vẹn đầy đủ (CHECK, UNIQUE, khóa ngoại), hệ sinh thái Go phong phú | Thêm một dịch vụ cần cấu hình và bảo trì |
| **MySQL / MariaDB** | Phổ biến, tài liệu nhiều, InnoDB hỗ trợ transaction và row lock | CHECK chỉ được thực thi từ MySQL 8.0.16 và MariaDB 10.2; các bản cũ hơn chỉ đọc qua rồi bỏ |
| **SQLite** | Không cần cài đặt, cả hệ thống nằm gọn trong một file | Chỉ một writer tại mỗi thời điểm; dữ liệu gắn với từng instance nên không phù hợp khi chạy nhiều bản stateless |
| **MongoDB** | Schema linh hoạt, làm việc với JSON thuận tiện | Ràng buộc toàn vẹn giữa các thực thể phải tự xử lý trong code, đi ngược yêu cầu của SRS |

## Vì sao chọn PostgreSQL

### Cập nhật sĩ số nguyên tử

Với PostgreSQL, phần kiểm tra chỗ trống và phần tăng sĩ số có thể gộp vào một câu lệnh:

```sql
UPDATE course_classes
SET enrolled = enrolled + 1
WHERE id = $1
  AND enrolled < max_capacity;
```

Nếu câu lệnh ảnh hưởng một dòng, chỗ đó đã thuộc về sinh viên. Nếu ảnh hưởng không dòng nào, lớp đã đầy và hệ thống trả lỗi. PostgreSQL khóa dòng khi hai cập nhật chạm vào cùng một chỗ, câu lệnh đến sau đợi đến phiên mình rồi đánh giá lại điều kiện với dữ liệu mới. Nhờ vậy, không thể có hai request cùng vượt qua điều kiện để giành một chỗ duy nhất.

Toàn bộ luồng đăng ký — ghi bản ghi đăng ký và tăng sĩ số — bọc trong một transaction, hoặc cùng thành công hoặc cùng quay lại, nên hai bên dữ liệu không bao giờ lệch nhau.

### Ràng buộc toàn vẹn do database giữ

Các luật như `enrolled <= max_capacity`, một sinh viên không đăng ký trùng một lớp (UNIQUE), lớp phải thuộc học phần có thật (khóa ngoại) khai báo ngay trong schema. Lợi ích thực tế: khi code có chỗ sai, database vẫn từ chối dữ liệu không hợp lệ thay vì im lặng chấp nhận.

### Hệ sinh thái Go hướng về PostgreSQL

Driver pgx được dùng rộng rãi và có hiệu năng tốt. sqlc sinh code Go trực tiếp từ câu SQL, hiểu cú pháp PostgreSQL chi tiết. GORM cũng hỗ trợ đầy đủ. Công cụ cụ thể sẽ chốt ở bước thiết kế, nhưng cả ba hướng đều làm việc tốt với PostgreSQL.

### Chạy cùng ứng dụng trong docker-compose

Image chính thức có sẵn, cấu hình qua biến môi trường, dữ liệu nằm trong volume. Yêu cầu "chạy ứng dụng cùng cơ sở dữ liệu bằng một lệnh" của SRS chỉ cần thêm một service trong compose file.

## Những điểm phải chấp nhận

- **Vận hành thêm một dịch vụ.** Nhóm cần làm quen với psql, cách quản lý migration và backup. Với phạm vi MVP, backup định kỳ bằng pg_dump là đủ.
- **Phiên bản cần cố định.** Trong docker-compose nên ghi rõ phiên bản PostgreSQL thay vì dùng tag mới nhất, để môi trường của các thành viên và máy kiểm thử giống nhau.
- **Số liệu load test chỉ mang tính tương đối.** Môi trường Kaggle CPU chạy cả ứng dụng lẫn database trong container, kết quả không so sánh được với server thật; chỉ dùng để đối chiếu giữa các lần chạy với nhau.

## Kết luận

Chọn PostgreSQL cho toàn bộ dữ liệu của hệ thống; SRS mục 7.3 được cập nhật theo quyết định này. Schema, migration và dữ liệu mẫu sẽ đặt trong thư mục `database/` của repo.
