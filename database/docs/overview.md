# Tổng quan database và dữ liệu mẫu UET

Tài liệu database được tổ chức tại thư mục này:

- [Chạy demo local](demo-guide.md): khởi động, kết nối, truy vấn và thử transaction.
- [Nguồn dữ liệu và crawler](data-sources.md): nguồn CTĐT, cách cập nhật và rà soát dữ liệu.

PostgreSQL triển khai đúng **9 bảng** theo [thiết kế database](../../docs/database-design.md) và [DBML](../../docs/database.dbml), được backend Go và frontend React sử dụng. Tài khoản, lớp, lịch và đăng ký là fixture phục vụ phát triển; hướng dẫn chạy toàn hệ thống ở [README gốc](../../README.md).

Các đường dẫn dạng `database/...` và mọi lệnh shell trong bộ tài liệu đều tính từ thư mục gốc repository.

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

Username `student001` … `student100`, `admin1`, `admin2`; cùng mật khẩu demo **`DemoUET@123`**, lưu bcrypt cost 12. Các tài khoản này chỉ dùng phát triển local. File `database/data/demo-password.json` chứa hash cố định để seed lặp lại giống nhau; bcrypt xác thực được bằng Go.

[database/data/scenarios.json](../data/scenarios.json) liệt kê tài khoản, ID/mã lớp và kết quả mong đợi cho 10 tình huống: thành công, trùng lịch, đăng ký trùng, vượt tín chỉ, học kỳ đóng/chưa mở, đầy/còn một chỗ, đăng ký lại sau hủy, lớp đã hủy. Đây là fixture chuẩn bị cho kiểm thử API; DB không tự thi hành các luật thuộc Service.

Bảng `registrations` chỉ lưu đăng ký đang hiệu lực. Với tình huống lớp 6, thực hiện đăng ký → hủy → đăng ký lại; lần sau nhận ID mới. Khi admin hủy lớp, bản ghi lớp được giữ với `status = cancelled` và mọi đăng ký của lớp bị xóa vật lý.

Mã lớp dùng dạng `<mã học phần>-<số lớp>`, ví dụ `INT2204-04`. Database đã seed theo dạng cũ có thể cập nhật bằng `docker compose --profile tools run --rm seed normalize-class-codes`; lệnh chỉ đổi mã khớp mẫu fixture cũ `INT2204-DEMO04`, giữ ID, đăng ký và các dữ liệu khác. Nếu mã đích bị trùng trong cùng học kỳ, toàn bộ thao tác rollback theo ràng buộc UNIQUE.

Tên học kỳ dùng dạng `Học kỳ 1 năm học 2026-2027`, sinh theo ngày neo và thứ tự học kỳ trước/hiện tại/kế tiếp. `docker compose --profile tools run --rm seed normalize-semester-names` chỉ đổi ba nhãn fixture cũ `Demo - đã đóng/đang mở/chưa mở`, giữ ID và thời gian đăng ký; tên học kỳ tự đặt không bị đổi.

Tên giảng viên sử dụng danh sách tên tiếng Việt cố định, các lớp cùng học phần nhận cùng tên. `docker compose --profile tools run --rm seed normalize-lecturer-names` thay nhãn fixture cũ `Giảng viên giả lập XX`, không ghi đè tên đã chỉnh sửa. Đây vẫn là dữ liệu tổng hợp, không phải danh sách giảng viên thực tế của trường.

Ngày neo mặc định `REFERENCE_DATE=2026-10-20`, múi giờ `Asia/Ho_Chi_Minh`, random seed `20261020`. Học kỳ đang mở từ ngày neo -7 đến +30 ngày; tương lai +60 đến +90; đã đóng -90 đến -60. Giới hạn **12 tín chỉ là tham số demo**, không phải quy định UET. Khi demo ở thời điểm khác, đặt ngày neo mong muốn trước khi seed database sạch. Cùng ngày neo, random seed và dataset tạo cùng nội dung; thay các giá trị này trên DB đã seed sẽ bị từ chối.

Seed chạy trong một transaction, khóa bảng để tránh thay đổi đồng thời. Nếu database rỗng thì nạp; nếu toàn bộ nội dung giống fixture thì không làm gì; dữ liệu khác bị từ chối, kể cả thay đổi từ thao tác demo/API. Migration kiểm tra checksum migration và fingerprint schema ghi trong comment bảng `users`, không thêm bảng theo dõi migration.

## Giới hạn ánh xạ vào 9 bảng

- `courses.code` là duy nhất. Học phần xuất hiện ở cả hai CTĐT hoặc chưa xác định khoa sở hữu được gắn nhãn quy ước `Liên khoa`, `major=NULL`. Với học phần chuyên ngành, faculty/major là nhãn phục vụ demo, không khẳng định đơn vị giảng dạy thực tế.
- Schema không lưu khóa tuyển sinh, nhóm tự chọn, tín chỉ tối thiểu mỗi nhóm hay quan hệ nhiều ngành–một môn. Những thông tin này nằm ngoài DB trong catalog; không thể tái dựng đầy đủ CTĐT chỉ từ 9 bảng.
- Bảng `course_results` chỉ là kết quả đạt/chưa đạt do fixture sinh, không phải bảng điểm thật. Fixture bảo đảm mọi tiên quyết của đăng ký hiện hành đã đạt; luật này khi đăng ký mới vẫn do backend kiểm tra.
- Khác biệt tiên quyết giữa hai phiên bản CTĐT được báo cáo và bỏ khỏi DB cho học phần đó. Không gộp chúng thành điều kiện bắt buộc mới. Mã tiên quyết không tồn tại không được tự tạo môn để đủ FK.
- Không có dữ liệu cá nhân sinh viên thật; tên giảng viên, phòng, lịch và sĩ số không phải thời khóa biểu chính thức UET.
- Theo thiết kế, quyền sinh viên, trùng lịch, tín chỉ, thời gian đăng ký và cập nhật sĩ số nhất quán do backend thực hiện. Không thêm trigger thay nghiệp vụ.
