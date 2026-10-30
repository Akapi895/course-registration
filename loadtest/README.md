# Báo cáo kiểm thử tải và chống chịu Phase 1

## Môi trường kiểm thử

- Nền tảng: Kaggle, 4 vCPU Xeon 2,2 GHz. API và PostgreSQL chạy trên 2 core, bộ phát tải trên 2 core còn lại (đã xác minh cô lập CPU).
- Phần mềm: PostgreSQL 16.15, API Go (commit `669e485`), `JWT_TTL=4h`, `MAX_CREDITS=26`.
- Dữ liệu: 579 lớp học phần; 4.000 sinh viên tải ở nhóm `perf`, 200 sinh viên ở `race`, `window`, `abuse`.
- Nội dung đo: giới hạn tải (`perf`), tranh chấp đồng thời (`race`, `window`), chống chịu tấn công tầng ứng dụng (`abuse`).
- Ngưỡng đạt của bài thử: p95 ≤ 500 ms, lỗi ≤ 1%, dữ liệu nhất quán. Đây không phải SLA trong SRS.
- Mỗi bài chạy một lần. Dữ liệu thô nằm ở `loadtest/results/all-runs/` (không commit).

## Năng lực hệ thống

| Luồng xử lý | Tải ổn định | Giới hạn | Khi vượt giới hạn |
|---|---|---|---|
| Đọc dữ liệu | ~400 yêu cầu/giây | ~500 yêu cầu/giây | Chậm dần, hầu như không lỗi |
| Đăng ký và hủy đăng ký | 50 thao tác/giây | ~57 thao tác/giây | Lỗi hàng loạt |
| Đăng nhập | dưới 6 lượt/giây | ~6 lượt/giây | Quá thời gian chờ |

- Đăng nhập là điểm nghẽn hẹp nhất: 4.000 sinh viên cần khoảng 11 phút chỉ để đăng nhập hết.
- Dữ liệu luôn nhất quán và hệ thống hồi phục ngay khi tải giảm, kể cả sau những đợt quá tải nặng.
- Các con số trên là của cấu hình 2 core, chưa thử cấu hình khác.

## Các điểm yếu chính

| # | Điểm yếu | Kết quả kiểm thử |
|---|---|---|
| 1 | Đăng nhập tiêu tốn CPU, không có giới hạn tốc độ | Chỉ khoảng 5 lượt đăng nhập sai mỗi giây đã chiếm toàn bộ CPU máy chủ, khiến người dùng đang đọc dữ liệu chậm đi hơn một trăm lần. |
| 2 | Yêu cầu đăng nhập đã bị client bỏ vẫn được xử lý đến cùng | Một đợt đăng nhập đồng thời làm hệ thống không hoàn tất được lượt đăng nhập nào trong khoảng 10 phút, dù các client đã ngắt kết nối. |
| 3 | Quá tải không được kiểm soát | Khi vượt giới hạn, hệ thống không từ chối sớm mà để yêu cầu chờ đến hết thời gian. Đợt 4.000 sinh viên đăng ký trong 5 giây gần như thất bại hoàn toàn. |
| 4 | Không giới hạn số lần thử sai mật khẩu | Hàng chục lần thử sai liên tiếp không bị chặn hay làm chậm; lần đăng nhập đúng ngay sau đó vẫn thành công. |
| 5 | Máy chủ HTTP không đặt timeout | Kết nối gửi dữ liệu dở dang được giữ mở vô thời hạn; 1.000 kết nối vẫn mở sau 60 giây. |
| 6 | Không giới hạn kích thước yêu cầu | Một yêu cầu 100 MB gửi tới endpoint chưa xác thực làm bộ nhớ của API tăng thêm khoảng 600 MB. |
| 7 | Danh sách lớp học phần không phân trang | Mỗi lần gọi trả toàn bộ danh mục, chiếm khoảng hai phần ba chi phí xử lý của các yêu cầu đọc. |
| 8 | Client ngắt kết nối bị ghi nhận là lỗi hệ thống | Yêu cầu bị bỏ giữa chừng trả mã 500 và ghi log lỗi nội bộ, làm lẫn với lỗi thật. |

Hai giả thuyết chưa được kiểm chứng bằng phép đo:

- Thời gian phản hồi đăng nhập có thể khác nhau giữa tên đăng nhập tồn tại và không tồn tại, cho phép dò tên đăng nhập hợp lệ.
- Pool kết nối PostgreSQL để mặc định (4 kết nối) có thể giới hạn thông lượng đăng ký trước khi CPU cạn.

## Chi tiết các điểm yếu

1. **Đăng nhập tiêu tốn CPU.** Mỗi lần kiểm tra mật khẩu (bcrypt) tốn khoảng một phần ba giây CPU và chạy trước mọi kiểm tra khác, trên endpoint không cần xác thực, không có giới hạn tốc độ hay số yêu cầu đồng thời. Một client nhỏ cũng làm nghẽn cả hệ thống.
2. **Công việc đã bị bỏ vẫn chạy.** Bcrypt không hủy được khi client ngắt kết nối, nên các yêu cầu đã bị bỏ vẫn chiếm CPU và tạo thành hàng đợi kéo dài nhiều phút.
3. **Quá tải không được kiểm soát.** Không có cơ chế từ chối sớm hoặc giới hạn hàng đợi. Khi yêu cầu đăng ký bị bỏ giữa chừng, các lớp còn lại trong lô trả lỗi nội bộ hàng loạt và đăng ký bị sót, làm các lượt đăng ký sau bị từ chối do trùng. Dữ liệu vẫn nhất quán.
4. **Không giới hạn thử sai mật khẩu.** Tốc độ thử chỉ bị chặn bởi chi phí bcrypt, không bởi cơ chế bảo vệ nào. Thời gian chờ đăng nhập lại chỉ áp dụng sau khi một phiên đăng nhập kết thúc, không áp dụng cho lần thử sai.
5. **Không có timeout HTTP.** `http.Server` dùng cấu hình mặc định, không đặt `ReadHeaderTimeout`, `ReadTimeout` hay `IdleTimeout`, nên kết nối chậm hoặc dở dang chiếm tài nguyên vô thời hạn. Ở quy mô đã thử, yêu cầu mới vẫn được phục vụ bình thường.
6. **Không giới hạn kích thước yêu cầu.** Phần đọc JSON nạp toàn bộ nội dung vào bộ nhớ rồi giải mã hai lần, nên bộ nhớ tăng gấp nhiều lần kích thước yêu cầu. Trên máy nhiều RAM chưa gây lỗi; máy nhỏ có thể bị hết bộ nhớ.
7. **Danh sách lớp không phân trang.** Chi phí mỗi lần đọc tăng theo số lớp mở trong học kỳ, trong khi đây là yêu cầu mà mọi sinh viên gọi khi mở trang.
8. **Ngắt kết nối bị tính là lỗi hệ thống.** Mọi lỗi không nhận diện đều được quy về `INTERNAL_ERROR`, kể cả `context canceled` do client bỏ yêu cầu. Tỉ lệ lỗi 5xx vì vậy bị phóng đại.

## Điểm mạnh đã xác nhận

- Tranh chấp dữ liệu được xử lý đúng: đăng ký trùng, vượt tín chỉ, trùng lịch, hủy kép, admin sửa hoặc hủy lớp khi đang có đăng ký đều không phát sinh vi phạm qua 20 vòng thử.
- Đợt đăng ký đóng đúng hạn; token hết hạn bị từ chối ngay.
- Dữ liệu luôn nhất quán, không có deadlock, kể cả khi hệ thống bị quá tải nặng.
- Nhiều sinh viên tranh một lớp còn ít chỗ vẫn xử lý khoảng 1.000 yêu cầu/giây, không lỗi.
- Hệ thống hồi phục ngay khi tải giảm; chạy 10 phút ở trạng thái quá tải không rò rỉ bộ nhớ.
- Dữ liệu đầu vào dị dạng bị từ chối đúng, không gây lỗi máy chủ.

## Hạn chế của kết quả

- Mỗi bài chỉ chạy một lần nên các giới hạn là ước lượng; bậc tải vượt giới hạn của bài đăng ký và đọc đều ở trạng thái chưa kết luận, chưa có bước thu hẹp và lặp lại.
- Một số bài bị giới hạn bởi chính công cụ kiểm thử (một mức tranh chấp 80 người, đăng nhập 128 luồng đồng thời, hai bài flood và áp lực pool), nên các kết luận ở trên không dựa vào chúng.
- Bài chạy 10 phút ở mức tải vượt khả năng đăng ký, nên chỉ cho biết không có rò rỉ hay suy giảm dần.
- Chưa thử nhiều yêu cầu lớn đồng thời, chưa thử đoán mật khẩu trên tài khoản sinh viên, và giới hạn kết nối chỉ thử tới 1.000.
- Môi trường Kaggle khác Docker Compose: kết nối PostgreSQL dùng TLS, và nhóm `abuse`, `race` dùng danh mục nhỏ hơn (~125 lớp so với 579 lớp ở `perf`).
