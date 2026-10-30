# Tổng quan database và dữ liệu mẫu UET

Tài liệu database gồm [chạy demo local](demo-guide.md) (khởi động, kết nối, truy vấn, thử transaction) và [nguồn dữ liệu và crawler](data-sources.md) (nguồn CTĐT, cách cập nhật, rà soát). Đường dẫn dạng `database/...` và các lệnh shell đều tính từ thư mục gốc repository.

PostgreSQL có đúng 9 bảng theo [thiết kế database](../../docs/database-design.md) và [DBML](../../docs/diagrams/erd/database.dbml). Tài khoản, lớp, lịch và đăng ký là fixture phục vụ phát triển; cách chạy cả hệ thống nằm ở [README gốc](../../README.md).

## Dữ liệu và tài khoản demo

| Thành phần | Số lượng |
|---|---:|
| Học phần CNTT trong dataset CTĐT | 66 |
| Học phần Điện tử–Viễn thông trong dataset CTĐT | 74 |
| Học phần duy nhất sau gộp mã | 126 |
| Sinh viên giả | 100, mỗi khoa 50 |
| Admin | 2 |
| Học kỳ | 3: đã đóng, đang mở, chưa mở |
| Lớp | 80: 35 chuyên ngành CNTT, 35 chuyên ngành ĐTVT, 6 lớp chung, 4 lớp ở học kỳ khác |
| Buổi học | 82 |
| Đăng ký | 103, đều đang hiệu lực |
| Kết quả học tập | 100 |
| Phiên đăng nhập | 0 |

Các tài khoản `student001` … `student100`, `admin1`, `admin2` dùng chung mật khẩu `DemoUET@123` (bcrypt cost 12), chỉ để phát triển local. `database/data/demo-password.json` giữ hash cố định để mỗi lần seed cho kết quả giống nhau; hash này xác thực được bằng Go.

[database/data/scenarios.json](../data/scenarios.json) liệt kê tài khoản, ID và mã lớp, kết quả mong đợi cho 10 tình huống: thành công, trùng lịch, đăng ký trùng, vượt tín chỉ, học kỳ đóng hoặc chưa mở, lớp đầy hoặc còn một chỗ, đăng ký lại sau hủy, lớp đã hủy. Đây là fixture để kiểm thử API; database không tự thi hành các luật thuộc Service.

Bảng `registrations` chỉ lưu đăng ký đang hiệu lực. Với tình huống lớp 6, thực hiện đăng ký, hủy rồi đăng ký lại sẽ nhận ID mới. Khi admin hủy lớp, bản ghi lớp được giữ với `status = cancelled` và mọi đăng ký của lớp bị xóa vật lý.

Mã lớp có dạng `<mã học phần>-<số lớp>` (ví dụ `INT2204-04`), tên học kỳ dạng `Học kỳ 1 năm học 2026-2027` sinh theo ngày neo, tên giảng viên lấy từ danh sách tên tiếng Việt cố định (các lớp cùng học phần cùng tên). Tên giảng viên vẫn là dữ liệu tổng hợp, không phải danh sách thực tế của trường. Database seed theo nhãn cũ (`INT2204-DEMO04`, `Demo - đã đóng/đang mở/chưa mở`, `Giảng viên giả lập XX`) được đổi sang dạng hiện tại bằng `seed normalize-class-codes`, `normalize-semester-names` và `normalize-lecturer-names` (chạy với `docker compose --profile tools run --rm`). Các lệnh này giữ ID, đăng ký và dữ liệu khác, không đổi nhãn đã tự chỉnh; nếu mã lớp đích trùng trong cùng học kỳ thì rollback toàn bộ theo ràng buộc UNIQUE. Trên Render, `deployment/start.py` tự chạy cả ba bước.

Ngày neo mặc định `REFERENCE_DATE=2026-10-20`, múi giờ `Asia/Ho_Chi_Minh`, random seed `20261020`. Học kỳ đang mở từ ngày neo −7 đến +30 ngày, học kỳ tương lai +60 đến +90, học kỳ đã đóng −90 đến −60. Giới hạn 12 tín chỉ là tham số demo, không phải quy định của UET. Muốn demo ở thời điểm khác, đặt ngày neo trước khi seed database sạch. Cùng ngày neo, random seed và dataset cho cùng nội dung; đổi các giá trị này trên database đã seed sẽ bị từ chối.

Seed chạy trong một transaction và khóa bảng để tránh thay đổi đồng thời. Database rỗng thì nạp; nếu toàn bộ nội dung giống fixture thì không làm gì; dữ liệu khác bị từ chối, kể cả khi do thao tác demo hay API. Migration kiểm tra checksum migration và fingerprint schema ghi trong comment của bảng `users`, không thêm bảng theo dõi migration.

## Giới hạn ánh xạ vào 9 bảng

- `courses.code` là duy nhất. Học phần xuất hiện ở cả hai CTĐT, hoặc chưa xác định khoa sở hữu, được gắn nhãn quy ước `Liên khoa` với `major=NULL`. Với học phần chuyên ngành, faculty và major là nhãn phục vụ demo, không khẳng định đơn vị giảng dạy thực tế.
- Schema không lưu khóa tuyển sinh, nhóm tự chọn, tín chỉ tối thiểu mỗi nhóm hay quan hệ nhiều ngành–một môn. Các thông tin này nằm ngoài database, trong catalog, nên không thể dựng lại đầy đủ CTĐT chỉ từ 9 bảng.
- `course_results` chỉ là kết quả đạt hoặc chưa đạt do fixture sinh, không phải bảng điểm thật. Fixture bảo đảm mọi tiên quyết của đăng ký hiện hành đã đạt; luật này với đăng ký mới vẫn do backend kiểm tra.
- Khác biệt tiên quyết giữa hai phiên bản CTĐT được báo cáo và bỏ khỏi database cho học phần đó, không gộp thành điều kiện bắt buộc mới. Mã tiên quyết không tồn tại không được tự tạo môn để đủ khóa ngoại.
- Không có dữ liệu cá nhân của sinh viên thật. Tên giảng viên, phòng, lịch và sĩ số không phải thời khóa biểu chính thức của UET.
- Theo thiết kế, quyền sinh viên, trùng lịch, tín chỉ, thời gian đăng ký và cập nhật sĩ số nhất quán do backend thực hiện. Không thêm trigger thay nghiệp vụ.
