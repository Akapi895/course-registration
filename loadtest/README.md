# Báo cáo kiểm thử tải và chống chịu Phase 1

## Môi trường kiểm thử

- Nền tảng: Kaggle, 4 vCPU. API và PostgreSQL chạy trên 2 core, bộ phát tải trên 2 core còn lại (đảm bảo cô lập CPU). Kaggle cấp hai loại CPU: Xeon 2,2 GHz (3 lần chạy) và AMD EPYC 7B12 (1 lần chạy).
- Phần mềm: PostgreSQL 16.15, API Go, `JWT_TTL=4h`, `MAX_CREDITS=26`.
- Dữ liệu: 4.000 sinh viên tải và 579 lớp học phần ở ba lần chạy cuối; lần chạy ban đầu của `race`, `window`, `abuse` dùng 200 sinh viên và ~125 lớp.
- Nội dung đo: giới hạn tải (`perf`), tranh chấp đồng thời (`race`, `window`), chống chịu tấn công tầng ứng dụng (`abuse`).
- Ngưỡng đạt của bài thử: p95 ≤ 500 ms, lỗi ≤ 1%, dữ liệu nhất quán.

## Năng lực hệ thống

| Luồng xử lý | CPU Xeon (3 lần chạy) | CPU EPYC (1 lần chạy) | Khi vượt giới hạn |
|---|---|---|---|
| Đọc dữ liệu (request/giây) | ổn định ≥ 400; giới hạn 430–520 | ổn định ≥ 500; giới hạn 730–780 | Chậm dần; lỗi chỉ xuất hiện ở mức rất cao4.000 người, Xeon |
| Đăng ký và hủy đăng ký (thao tác/giây) | ổn định ~37; giới hạn ~50 | ổn định 50; giới hạn ~75 | Lỗi hàng loạt |
| Đăng nhập (lượt/giây) | ~6 | ~8 | Quá thời gian chờ |

- Đăng nhập là điểm nghẽn hẹp nhất: 4.000 sinh viên cần khoảng 8–11 phút chỉ để đăng nhập hết.
- Cùng một mã nguồn, CPU EPYC cho thông lượng cao hơn khoảng 25–60% (đăng nhập thấp nhất, đọc cao nhất), nên mọi giới hạn cần được trích kèm loại CPU. Giữa các lần chạy trên cùng loại Xeon, thông lượng đọc và đăng nhập lệch nhau khoảng ±5%.
- Giới hạn của luồng đăng ký nhạy với biến động hơn: ở 50 thao tác/giây trên Xeon, chỉ 1 trong 7 lần đo đạt ngưỡng.
- Dữ liệu luôn nhất quán và hệ thống hồi phục ngay khi tải giảm, kể cả sau những đợt quá tải nặng.

## Các điểm yếu chính

| # | Điểm yếu | Kết quả kiểm thử |
|---|---|---|
| 1 | Đăng nhập tiêu tốn CPU, không có giới hạn tốc độ | Chỉ khoảng 5 lượt đăng nhập sai mỗi giây đã chiếm toàn bộ CPU máy chủ, khiến người dùng đang đọc dữ liệu chậm đi từ hàng chục đến hơn một trăm lần. |
| 2 | Yêu cầu đăng nhập đã bị client bỏ vẫn được xử lý đến cùng | Một đợt đăng nhập đồng thời làm hệ thống không hoàn tất được lượt đăng nhập nào trong khoảng 10 phút, dù các client đã ngắt kết nối. |
| 3 | Quá tải không được kiểm soát | Khi vượt giới hạn, hệ thống không từ chối sớm mà để yêu cầu chờ đến hết thời gian. Đợt 4.000 sinh viên đăng ký trong 5 giây gần như thất bại hoàn toàn (trên 90% yêu cầu lỗi ở cả bốn lần chạy). |
| 4 | Không giới hạn số lần thử sai mật khẩu | Hàng chục lần thử sai liên tiếp không bị chặn hay làm chậm; lần đăng nhập đúng ngay sau đó vẫn thành công. |
| 5 | Máy chủ HTTP không đặt timeout | Kết nối gửi dữ liệu dở dang được giữ mở vô thời hạn; 1.000 kết nối vẫn mở sau 60 giây. |
| 6 | Không giới hạn kích thước yêu cầu | Một yêu cầu 100 MB gửi tới endpoint chưa xác thực làm bộ nhớ của API tăng thêm khoảng 600 MB. |
| 7 | Danh sách lớp học phần không phân trang | Mỗi lần gọi trả toàn bộ danh mục, chiếm khoảng 70% chi phí xử lý của các yêu cầu đọc. |
| 8 | Client ngắt kết nối bị ghi nhận là lỗi hệ thống | Yêu cầu bị bỏ giữa chừng trả mã 500 và ghi log lỗi nội bộ, làm lẫn với lỗi thật. |

## Chi tiết các điểm yếu

1. **Đăng nhập tiêu tốn CPU.** Mỗi lần kiểm tra mật khẩu (bcrypt) tốn khoảng một phần tư đến một phần ba giây CPU (tùy loại CPU) và chạy trước mọi kiểm tra khác, trên endpoint không cần xác thực, không có giới hạn tốc độ hay số yêu cầu đồng thời. Một client nhỏ cũng làm nghẽn cả hệ thống.
2. **Công việc đã bị bỏ vẫn chạy.** Bcrypt không hủy được khi client ngắt kết nối khiến các yêu cầu đã bị bỏ vẫn chiếm CPU và tạo thành hàng đợi kéo dài nhiều phút.
3. **Quá tải không được kiểm soát.** Không có cơ chế từ chối sớm hoặc giới hạn hàng đợi. Khi yêu cầu đăng ký bị bỏ giữa chừng, các lớp còn lại trong lô trả lỗi nội bộ hàng loạt và đăng ký bị sót, làm các lượt đăng ký sau bị từ chối do trùng. Dữ liệu vẫn nhất quán.
4. **Không giới hạn thử sai mật khẩu.** Tốc độ thử chỉ bị chặn bởi chi phí bcrypt, không bởi cơ chế bảo vệ nào. Thời gian chờ đăng nhập lại chỉ áp dụng sau khi một phiên đăng nhập kết thúc, không áp dụng cho lần thử sai.
5. **Không có timeout HTTP.** `http.Server` dùng cấu hình mặc định, không đặt `ReadHeaderTimeout`, `ReadTimeout` hay `IdleTimeout`, nên kết nối chậm hoặc dở dang chiếm tài nguyên vô thời hạn. Ở quy mô đã thử, yêu cầu mới vẫn được phục vụ bình thường.
6. **Không giới hạn kích thước yêu cầu.** Phần đọc JSON nạp toàn bộ nội dung vào bộ nhớ rồi giải mã hai lần, nên bộ nhớ tăng gấp nhiều lần kích thước yêu cầu. Trên máy nhiều RAM chưa gây lỗi; máy nhỏ có thể bị hết bộ nhớ.
7. **Danh sách lớp không phân trang.** Chi phí mỗi lần đọc tăng theo số lớp mở trong học kỳ, trong khi đây là yêu cầu mà mọi sinh viên gọi khi mở trang.
8. **Ngắt kết nối bị tính là lỗi hệ thống.** Mọi lỗi không nhận diện đều được quy về `INTERNAL_ERROR`, kể cả `context canceled` do client bỏ yêu cầu, vì vậy tỉ lệ lỗi 5xx bị phóng đại.

## Điểm mạnh đã xác nhận

- Tranh chấp dữ liệu được xử lý đúng: đăng ký trùng, vượt tín chỉ, trùng lịch, hủy kép, admin sửa hoặc hủy lớp khi đang có đăng ký đều không phát sinh vi phạm qua 20 vòng thử, lặp lại ở cả bốn lần chạy.
- Đợt đăng ký đóng đúng hạn (một lần chạy); token hết hạn bị từ chối ngay (bốn lần chạy).
- Dữ liệu luôn nhất quán, không có deadlock, kể cả khi hệ thống bị quá tải nặng.
- Nhiều sinh viên tranh một lớp còn ít chỗ vẫn xử lý khoảng 1.000 yêu cầu/giây, không lỗi.
- Hệ thống hồi phục ngay khi tải giảm; chạy 10 phút ở trạng thái quá tải không rò rỉ bộ nhớ.
- Dữ liệu đầu vào dị dạng bị từ chối đúng, không gây lỗi máy chủ.

## Hạn chế của kết quả

- Giới hạn của luồng đăng ký được thu hẹp bằng các lần đo lặp; giới hạn của luồng đọc chưa có bậc thất bại rõ ràng ở phía trên (bài 800 yêu cầu/giây luôn ở trạng thái chưa kết luận vì bộ phát phải bỏ bớt thao tác), nên là ước lượng từ các bài còn lại.
- Kết quả phụ thuộc loại CPU Kaggle cấp. Chỉ có một lần chạy trên EPYC nên các con số của loại này chưa có khoảng dao động.
- `abuse` c6–c8 và `window` chỉ có một lần chạy, vì cả ba lần cuối đều dừng khi khởi động lại API (cổng 8080 còn bị chiếm). Nguyên nhân chưa xác định; lỗi nằm ở khâu khởi động lại tiến trình của công cụ kiểm thử.
- Một số bài bị giới hạn bởi chính công cụ kiểm thử (một mức tranh chấp 80 người, đăng nhập 128 luồng đồng thời, hai bài flood và áp lực pool), nên các kết luận ở trên không dựa vào chúng. Hiện tượng này lặp lại ở mọi lần chạy.
- Bài chạy 10 phút ở mức tải vượt khả năng đăng ký, nên chỉ cho biết không có rò rỉ hay suy giảm dần.
- Chưa thử nhiều yêu cầu lớn đồng thời, chưa thử đoán mật khẩu trên tài khoản sinh viên, và giới hạn kết nối chỉ thử tới 1.000.
- Môi trường Kaggle khác Docker Compose: kết nối PostgreSQL dùng TLS, và lần chạy ban đầu của `abuse`, `race` dùng danh mục nhỏ hơn (~125 lớp so với 579 lớp ở các lần còn lại).
