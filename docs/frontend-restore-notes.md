# Ghi chú khôi phục giao diện frontend (2026-10-25)

Giao diện `frontend/` đã được khôi phục theo bản gốc `frontend-base/` và giữ các lời gọi API thật. Tài liệu này ghi lại những điểm còn khác bản gốc, những quyết định đã chốt tạm và các việc cần xử lý sau. `frontend-base/` chỉ dùng để tham chiếu, không sửa.

## 1. Việc cần xử lý sau

### 1.1. Thời gian phiên đăng nhập: 20 phút hay 1 giờ

- Bản gốc nói "Phiên làm việc kéo dài 20 phút", nhưng backend đang cấp JWT 1 giờ: `JWT_TTL` mặc định `1h` trong `backend/internal/config/config.go`, `docker-compose.yml` (`${JWT_TTL:-1h}`) và `.env.example` (`JWT_TTL=1h`). `SESSION_TTL` mặc định `24h`.
- SRS, `api-design.md` và ADR không có quy định "20 phút". Nếu đây là yêu cầu thật thì cần thêm vào SRS §3.1 (hoặc ADR) trước.
- `JWT_TTL` đã là biến cấu hình sẵn, nên có hai cách:
  1. Đặt `JWT_TTL=20m` trong `.env` rồi chạy lại `docker compose up -d backend`. Không cần sửa code. `SESSION_TTL` phải lớn hơn hoặc bằng `JWT_TTL`, nếu không backend không khởi động.
  2. Đổi giá trị mặc định thành `20m` ở `config.go`, `docker-compose.yml` và `.env.example` cho đồng bộ.
- Frontend không cần sửa: đồng hồ "Phiên còn m:ss" ở `Layout.tsx` đọc `exp` trong JWT, nên tự khớp với TTL đã cấu hình.
- Cảnh báo "Phiên đăng nhập đã hết hạn" ở `pages/auth.tsx` hiện **không nêu số phút** để khỏi sai khi cấu hình đổi. Khi chốt 20 phút có thể thêm lại câu "Phiên làm việc kéo dài 20 phút."

### 1.2. Luồng sau khi đăng ký: đã bỏ tự đăng xuất

- Bản Codex từng làm: đăng ký thành công thì tự `logout`, hiện màn hình "Đăng ký học phần thành công" toàn trang và khóa đăng nhập lại 20 phút trên trình duyệt (cooldown chỉ ở frontend). Luồng này đã bị gỡ vì SRS, `api-design.md` và ADR không có quy tắc nào như vậy.
- Thay bằng cách của bản gốc, **theo quy tắc: chỉ khi TẤT CẢ lớp trong lần xác nhận đều thành công thì phiên chuyển sang chỉ xem**. Đăng ký và hủy bị khóa, kèm cảnh báo, cho tới khi đăng nhập lại. Nếu có lớp bị từ chối (một phần hoặc toàn bộ), các lớp thành công vẫn được ghi nhận, mỗi lớp lỗi hiện thông báo riêng, và sinh viên **không bị khóa**, tiếp tục đăng ký được. Mã nằm ở `frontend/src/auth/sessionLock.ts` (lưu trong bộ nhớ, reset khi `signIn`, `signOut`, `clearSession`) và hàm `confirm` trong `pages/student.tsx`.
- Khi bấm "Xác nhận đăng ký", nút và popup kết quả hiện trạng thái đang xử lý ngay; trạng thái này được giữ tối thiểu 600ms (`MIN_LOADING_MS`) để vẫn nhìn thấy khi máy chủ trả lời tức thì.
- Khóa này **chỉ có ở frontend**. **Đã kiểm tra: backend không có cơ chế chỉ-xem nào** (không có cờ trong service, repository hay `auth_sessions`). Thử thật: sau khi phiên đã chuyển sang chỉ xem trên giao diện, dùng đúng token của phiên đó gọi `POST /api/registrations` vẫn đăng ký thêm được (200, `registered`). Nghĩa là quy tắc "chỉ xem" có thể bị vượt qua bằng Swagger hoặc gọi API trực tiếp. Muốn chặn ở backend cần một trạng thái theo phiên, tức thêm cột vào `auth_sessions` (đổi schema, phải cập nhật `database.dbml` và `database-design.md`) cùng một quy tắc trong SRS.
- Cần quyết định: giờ một lần gửi đã đăng ký được nhiều lớp (mục 2), khóa phiên có còn cần không. Nếu bỏ khóa, xóa `sessionLock.ts` và các chỗ gọi `markSubmitted`, `useSessionLocked` trong `pages/student.tsx`.
- Đã xóa: `auth/registrationCompletion.ts`, `RegistrationFinalization`, `RegisterClassModal` và các trường `registrationNotice`, `finishRegistration`, `finalizationError`, `finishingRegistration` của `AuthProvider`.

### 1.3. Bộ lọc khoa / ngành

- API `GET /api/classes` lọc `faculty` và `major` theo **chuỗi khớp chính xác**. Bản gốc dùng danh sách khoa/ngành giả, nên không dùng lại được.
- **Admin** (`pages/admin.tsx`): hai ô chọn Khoa/Ngành lấy từ hằng số `FACULTIES` viết cứng theo tên trong dữ liệu seed: Công nghệ thông tin → Công nghệ thông tin; Điện tử - Viễn thông → Công nghệ kỹ thuật điện tử - viễn thông; Liên khoa (không có ngành). Danh mục khác với seed thì phải sửa tay. Nên có API trả danh sách khoa/ngành, hoặc cho lọc theo `faculty_id`.
- **Sinh viên** (`pages/student.tsx`, `loadClasses`): "Theo ngành" lấy `major` của chính sinh viên (qua `GET /api/students/{id}`) rồi gọi `GET /api/classes` hai lần, một lần theo ngành và một lần theo khoa `Liên khoa` (học phần chung), rồi gộp lại. "Toàn trường" gọi không kèm bộ lọc. Sinh viên chưa có `major` thì "Theo ngành" trả toàn bộ lớp.
- Ngoài ra thanh tìm kiếm và bộ lọc "Đã đăng ký / Chưa đăng ký" chạy phía client trên danh sách đã tải.

### 1.5. Chi tiết lớp: khoa, học kỳ và học phần tiên quyết

- Trang `/student/classes/{id}` từng thiếu "Học kỳ", "Khoa" và thẻ "Học phần tiên quyết" vì `GET /api/classes/{id}` không trả các dữ liệu này (chỉ có `semester_id`; `courses.faculty` có trong schema nhưng câu truy vấn không chọn; tiên quyết chỉ được dùng nội bộ lúc kiểm tra đăng ký). "Số tín chỉ" thì đã hiển thị từ trước.
- Đã bổ sung vào API (chỉ thêm trường, không đổi schema): `faculty`, `semester_name`, `prerequisites[]` (`course_id`, `course_code`, `course_name`, và `passed` chỉ khi người gọi là sinh viên). Đã cập nhật `docs/api-design.md`, `docs/SRS.md` §3.2 #5 và Swagger.
- **Chi tiết lớp của sinh viên hiện là popup, không còn trang riêng.** Route `/student/classes/{id}` đã bỏ. Popup (`components/ClassDetailModal.tsx`, hook `useClassDetail`) mở khi bấm mã lớp ở Đăng ký học phần, tên học phần ở Tổng quan, "Xem chi tiết lớp" ở Học phần đã đăng ký, và khối/dòng lịch ở Thời khóa biểu. Popup rộng tối đa 1024px (`Modal` có thêm cỡ `xl`), chia hai cột: bên trái Thông tin lớp (lưới 3 cột) và Lịch học, bên phải Sĩ số và Học phần tiên quyết (320px). Dưới 1024px (viewport) các thẻ xếp thành một cột và nội dung cuộn trong popup; không có nút đăng ký trong popup. Thẻ "Điều kiện đăng ký" của bản gốc không đưa vào.
- Vì popup không có URL riêng, không chia sẻ hay đặt dấu trang được một lớp cụ thể, và bấm Back của trình duyệt không đóng popup. Nếu cần có thể thêm `?class=ID` trên URL.
- Trang chi tiết lớp của admin (`/admin/classes/{id}`) vẫn là trang riêng và chưa dùng các trường mới; có thể thêm Khoa và tiên quyết cho đồng bộ.

### 1.4. Thông tin học kỳ hiện tại đi kèm `GET /api/classes`

- Trước đây API không trả tên học kỳ, ngày mở/đóng đợt và giới hạn tín chỉ cho sinh viên, nên banner "Đợt đăng ký" và thẻ "Tiến độ tín chỉ" của Tổng quan không giống bản gốc. Đã bổ sung `data.semester` vào `GET /api/classes` (`id`, `name`, `max_credits`, `registration_opens_at`, `registration_closes_at`, `registration_open`). Đây là thay đổi chỉ thêm trường, client cũ vẫn chạy. Không đổi schema (`semesters.name` có sẵn). Đã cập nhật `docs/api-design.md`, `docs/SRS.md` §3.2 #4 và Swagger.
- `semester` là `null` khi chưa có học kỳ nào mở đăng ký, và không phụ thuộc bộ lọc `faculty`, `major`.
- Frontend dùng `semester` ở Tổng quan, Đăng ký học phần, Học phần đã đăng ký và Tổng quan admin. Số học phần, tín chỉ và lịch học trong tuần chỉ tính các đăng ký thuộc **học kỳ hiện tại** (lọc theo danh sách lớp của học kỳ đó), giống bản gốc tính theo học kỳ đang chọn.
- Trạng thái "Chưa mở" chỉ xuất hiện về lý thuyết: học kỳ hiện tại luôn là học kỳ đã mở (`registration_opens_at <= now`), nên trên giao diện chỉ gặp "Đang mở" hoặc "Đã đóng".

## 2. Thay đổi API: đăng ký nhiều lớp trong một yêu cầu

`POST /api/registrations` không còn nhận `class_id`. Hợp đồng mới (đã cập nhật `docs/SRS.md` §3.3, §3.6.2, §4 #10, §5.2.4, §8 #5, #6, #13; `docs/api-design.md`; `ARCHITECTURE.md` §3.2; Swagger):

- Body: `{ "class_ids": [10, 11, 12, 13, 14] }`, tối đa 20 lớp, không trùng. Sai định dạng, rỗng, quá 20 hoặc trùng ID thì cả yêu cầu bị `400 VALIDATION_ERROR`, không lớp nào được xử lý. Không phải sinh viên thì `403`.
- Backend xử lý từng lớp theo thứ tự gửi, **mỗi lớp một transaction riêng** (vẫn khóa hàng sinh viên và giành chỗ bằng `UPDATE ... WHERE enrolled < max_capacity` như trước). Lớp bị từ chối chỉ rollback chính nó.
- Trùng lịch và giới hạn tín chỉ tính cả các lớp vừa được ghi nhận trước đó trong cùng yêu cầu, nên **thứ tự gửi quyết định lớp nào được ưu tiên**.
- Response luôn `200` với yêu cầu hợp lệ, kể cả khi mọi lớp bị từ chối: `registered_count`, `failed_count` và `results[]`. Mỗi phần tử có `class_id`, `status` (`registered` hoặc `failed`), kèm `id` và `registered_at` nếu thành công, hoặc `code` và `message` nếu bị từ chối. Ví dụ gửi 5 lớp, 3 thành công và 2 báo `CLASS_FULL` thì 3 đăng ký vẫn được ghi nhận.
- `results[].code` có thể là `NOT_FOUND`, `CLASS_CANCELLED`, `CLASS_FULL`, `REGISTRATION_CLOSED`, `ALREADY_REGISTERED`, `SCHEDULE_CONFLICT`, `PREREQUISITE_NOT_MET`, `CREDIT_LIMIT_EXCEEDED`, `INTERNAL_ERROR`. Các mã này không còn đi kèm HTTP 409 cho `POST`.
- Đây là thay đổi **không tương thích ngược**: ai còn gửi `{ "class_id": ... }` sẽ nhận `400`. Frontend (`api.registerClasses`) và Swagger đã cập nhật. Cần xem lại các script hoặc ví dụ ngoài repo nếu có.
- `database/data/scenarios.json` vẫn mô tả từng tình huống theo một `class_id`. Khi thử qua Swagger hãy gửi mảng một phần tử, ví dụ `{ "class_ids": [7] }`.
- Giới hạn 20 lớp là hằng số trong tag `binding` của `controller/registration.go`, chưa cấu hình được.

## 3. Phần không khôi phục được vì API hoặc CSDL không có dữ liệu

| Phần của bản gốc | Lý do | Hiện trạng |
|---|---|---|
| Nhóm thực hành (LT/TH), badge LT/TH, nét đứt trên thời khóa biểu | Schema không có nhóm thực hành | Bỏ |
| Thẻ "Điều kiện đăng ký" (kiểm tra trước khi đăng ký) trong chi tiết lớp | Không có API kiểm tra trước; thẻ này cũng được bỏ vì thừa | Bỏ; tiên quyết nay hiện ở thẻ "Học phần tiên quyết" (xem 1.5), các điều kiện khác chỉ biết sau khi gửi đăng ký |
| Giảng viên, lịch học, phòng trong danh sách lớp | `GET /api/classes` không trả các trường này | Chỉ có ở trang chi tiết lớp; tránh gọi thêm một request cho mỗi dòng |
| Giảng viên trên khối thời khóa biểu | `GET /api/schedules` không trả giảng viên | Bỏ |
| Badge LT/TH trên danh sách lịch học của Tổng quan và cột "Lớp / Nhóm" | Schema không có nhóm thực hành, nên mọi lớp đều là lý thuyết | Bỏ badge; cột chỉ ghi "Lớp" |
| Ô chọn học kỳ trên header admin | Không có API liệt kê học kỳ | Bỏ; danh sách lớp chỉ gồm học kỳ hiện tại |
| Danh sách, tìm kiếm sinh viên (admin) | Không có endpoint | Chỉ tra cứu theo ID tài khoản |
| Danh sách sinh viên đăng ký một lớp, đăng ký của một sinh viên (admin) | Không có endpoint | Bỏ |
| Bảng lịch sử đợt đăng ký, sửa đợt (admin) | Không có endpoint đọc đợt | Bỏ; chỉ có form cập nhật theo ID học kỳ |
| Chọn học phần và học kỳ trong form tạo lớp | Không có API học phần, học kỳ | Nhập ID dạng số, nhãn "Mã học phần (ID)", "Mã học kỳ (ID)" |
| Trang `/register` | Không có API tạo tài khoản | Bỏ |
| Khung "Đợt đăng ký" ở trang đăng nhập | Không có API công khai | Bỏ |
| Cột Chủ nhật của thời khóa biểu | CSDL ràng buộc `day_of_week BETWEEN 2 AND 7` | Chỉ Thứ Hai đến Thứ Bảy |

## 4. Các khác biệt khác so với bản gốc

- **Hồ sơ sinh viên:** sinh viên không có giao diện sửa hồ sơ (bản gốc không có). API `PUT /api/students/{id}` vẫn cho sinh viên sửa chính mình, nên SRS §8 #3 đạt qua Swagger. Admin chỉ sửa **họ tên** trên giao diện; khoa/ngành gửi lại nguyên giá trị cũ vì endpoint yêu cầu đủ ba trường.
- **"Hủy lớp" thay cho "Xóa lớp":** admin hủy lớp là hủy mềm và hủy luôn đăng ký còn hiệu lực (SRS, `api-design.md`). Cách bố trí nút icon, modal giống bản gốc nhưng nội dung nói đúng hành vi này.
- **`Layout`** vẫn nhận prop `semester` nhưng bỏ qua, để các chỗ cũ không lỗi. Có thể xóa.
- **Mã lỗi:** `ErrorNotice` chỉ hiện thông điệp, không hiện `code`. Frontend chưa xử lý riêng theo `data.code` nào ngoài 401 và 404.
- `frontend/src/api/client.ts` vẫn có câu lỗi tiếng Việt khi không kết nối được hoặc phản hồi không đọc được.

## 5. Chưa kiểm tra

- **Đã chụp ảnh bằng Chrome và đối chiếu với bản gốc** cho Tổng quan sinh viên (banner đợt, 3 thẻ thống kê, bảng gần đây, lịch học trong tuần), Đăng ký học phần và Học phần đã đăng ký ở màn hình 1440px. **Chưa xem** bằng mắt: mobile, lưới thời khóa biểu (6 cột) và chế độ danh sách, bảng kết quả đăng ký nhiều lớp, nhãn "Đã khóa" sau khi đăng ký thành công, toàn bộ trang admin.
- Đồng hồ phiên của bản gốc chạy 20 phút, bản thật hiện 1 giờ theo `JWT_TTL` (xem 1.1).
- `frontend/` chưa có test.

## 6. Đã kiểm tra

- `backend`: `go vet ./...`, `go test ./...` (test validate `POST /api/registrations` và ánh xạ mã lỗi theo lớp).
- Chạy thật trên một stack Docker riêng với dữ liệu seed sạch (đã xóa sau khi test, không ảnh hưởng CSDL đang dùng). Đã đạt: gửi 5 lớp được 3 thành công và 2 `CLASS_FULL` (3 đăng ký được lưu, sĩ số lớp thành công tăng 1, sĩ số lớp đầy không đổi); `NOT_FOUND` theo từng lớp; gửi lại các lớp đã đăng ký trả 200 với `registered_count = 0`; giới hạn 12 tín chỉ áp dụng trong một lô và tổng không vượt 12; `REGISTRATION_CLOSED` theo từng lớp ở học kỳ đã đóng hoặc chưa mở; `400` cho danh sách rỗng, thiếu trường, trùng ID, ID không dương, 21 ID và trường `class_id` cũ; `401` khi thiếu token và với token đã đăng xuất (`SESSION_REVOKED`); `403` với tài khoản admin.
- `frontend`: `tsc --strict` và `vite build` thành công.
