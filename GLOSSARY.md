# Glossary — Hệ thống đăng ký học phần

Ngôn ngữ thống nhất của dự án, dùng cho cả tài liệu lẫn code. Khi viết code, đặt tên theo cột tiếng Anh trong ngoặc để hai bên luôn khớp nhau.

## Con người

**Tài khoản (Account)**:
Định danh đăng nhập gồm username, mật khẩu đã băm và vai trò.
_Avoid_: Người dùng, user (khi nói về thực thể lưu trong database)

**Vai trò (Role)**:
Phạm vi quyền của một tài khoản. Hệ thống chỉ có hai vai trò: sinh viên và quản trị (admin).
_Avoid_: Permission, nhóm quyền, chức vụ

**Sinh viên (Student)**:
Hồ sơ người học gắn với đúng một tài khoản, có mã sinh viên, họ tên, khoa và ngành.
_Avoid_: Học viên, user (hồ sơ user không phải ai cũng là sinh viên — admin có tài khoản nhưng không có hồ sơ sinh viên)

## Khung chương trình

**Học phần (Course)**:
Một môn trong chương trình đào tạo, có mã, tên, số tín chỉ và danh sách điều kiện tiên quyết. Thông tin này không đổi theo kỳ.
_Avoid_: Môn học, subject

**Lớp học phần (Class Section)**:
Một lớp cụ thể dạy một học phần trong một học kỳ, có giảng viên, phòng học, số chỗ tối đa và lịch học. Một học phần có thể mở nhiều lớp học phần trong cùng kỳ.
_Avoid_: Lớp, class (trong code dùng `class section`/`class_section`, đừng đặt tên là `Course` cho lớp học phần)

**Học kỳ (Semester)**:
Một kỳ đào tạo, mang theo cửa sổ thời gian đăng ký và giới hạn tín chỉ tối đa/tối thiểu của kỳ đó.
_Avoid_: Kỳ học, term

**Lịch học (Class Schedule)**:
Một buổi học lặp hàng tuần của lớp học phần: thứ trong tuần và khoảng tiết.
_Avoid_: Buổi học, session, lesson

**Điều kiện tiên quyết (Prerequisite)**:
Học phần phải có kết quả "đạt" trước khi được đăng ký lớp học phần khác.
_Avoid_: Môn tiên quyết, prereq

**Kết quả học phần (Course Result)**:
Ghi nhận một sinh viên đã hoàn thành (đạt) một học phần, là dữ liệu đầu vào để kiểm tra tiên quyết.
_Avoid_: Bảng điểm, transcript (bảng điểm đầy đủ nằm ngoài phạm vi MVP)

## Đăng ký

**Đăng ký (Registration)**:
Bản ghi liên kết một sinh viên với một lớp học phần mà anh ta đang giữ chỗ.
_Avoid_: Enrollment, phiếu đăng ký

**Hủy đăng ký (Cancellation)**:
Thao tác gỡ bỏ một đăng ký còn hiệu lực, trả lại chỗ cho lớp học phần.
_Avoid_: Xóa lớp (xóa lớp là việc của admin, khác với sinh viên tự hủy đăng ký)

**Sĩ số**:
Cặp số liệu của một lớp học phần: số chỗ tối đa và số chỗ đã nhận. Lớp đầy khi hai số bằng nhau.
_Avoid_: Slot, quota

**Trùng lịch (Schedule Conflict)**:
Hai buổi học trong cùng một học kỳ giao nhau về thứ trong tuần và khoảng tiết.
_Avoid_: Chồng lịch, đụng lịch

**Đợt đăng ký (Registration Window)**:
Khoảng thời gian (tính theo học kỳ) mà hệ thống chấp nhận đăng ký và hủy đăng ký. Ngoài khoảng này, mọi yêu cầu đăng ký/hủy bị từ chối.
_Avoid_: Phiên đăng ký, registration period

**Thời khóa biểu (Timetable)**:
Khung nhìn tổng hợp lịch học của các lớp mà một sinh viên đã đăng ký trong một học kỳ. Là kết quả tính toán khi truy vấn, không phải dữ liệu được lưu riêng.
_Avoid_: Schedule (đã dành cho lịch học của lớp), lịch học tổng hợp
