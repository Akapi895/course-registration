# Glossary — Hệ thống đăng ký học phần

Các thuật ngữ dùng chung khi trao đổi về hệ thống đăng ký học phần. Tên tiếng Anh trong ngoặc giúp thống nhất cách gọi trong tài liệu và khi phát triển.

## Con người

**Tài khoản (Account)**:
Danh tính dùng để truy cập hệ thống, gắn với một người và vai trò của người đó.
_Avoid_: Sinh viên (không phải tài khoản nào cũng là sinh viên)

**Phiên đăng nhập (Auth Session)**:
Khoảng thời gian một tài khoản được dùng token sau khi đăng nhập; mỗi tài khoản sinh viên chỉ có một phiên hoạt động, quản trị viên có thể có nhiều. Phiên kết thúc khi hết hạn hoặc khi người dùng đăng xuất.
_Avoid_: Session (dễ nhầm với buổi học), phiên đăng ký, token

**Thời gian chờ đăng nhập lại (Login Cooldown)**:
Khoảng chờ tính từ lúc phiên gần nhất kết thúc; tài khoản sinh viên chưa được đăng nhập lại trước khi hết khoảng này; quản trị viên không có thời gian chờ.
_Avoid_: Khóa tài khoản, lockout

**Vai trò (Role)**:
Phạm vi quyền của một tài khoản. Dự án có hai vai trò: sinh viên (student) và quản trị (admin).
_Avoid_: Permission, nhóm quyền, chức vụ

**Sinh viên (Student)**:
Người học có mã sinh viên, thuộc một khoa và ngành, được đăng ký các lớp học phần khi đáp ứng điều kiện.
_Avoid_: Học viên, tài khoản (khi nói riêng về người học)

**Giảng viên (Lecturer)**:
Người phụ trách giảng dạy lớp học phần, được giới thiệu trong thông tin lớp. Giảng viên không phải vai trò sử dụng hệ thống trong phạm vi hiện tại.
_Avoid_: Admin (giảng dạy và quản trị là hai khái niệm khác nhau)

**Quản trị (Admin)**:
Người có toàn quyền quản lý tài khoản, học phần, lớp học phần, đăng ký và dữ liệu cấu hình của hệ thống, trong các ràng buộc nghiệp vụ đã thống nhất.
_Avoid_: Giảng viên (phụ trách giảng dạy không đồng nghĩa có quyền quản trị)

## Khung chương trình

**Học phần (Course)**:
Một môn trong chương trình đào tạo, có mã, tên, số tín chỉ và điều kiện tiên quyết; có thể được mở thành nhiều lớp học phần.
_Avoid_: Môn học, subject

**Lớp học phần (Class Section)**:
Một lớp cụ thể dạy một học phần trong một học kỳ, có giảng viên, phòng học, số chỗ tối đa và lịch học. Một học phần có thể mở nhiều lớp học phần trong cùng kỳ.
_Avoid_: Học phần, Course (khi nói về một lớp mở cụ thể)

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
Kết quả đạt hoặc chưa đạt của sinh viên đối với một học phần, dùng để xác định điều kiện tiên quyết.
_Avoid_: Bảng điểm, transcript (bảng điểm đầy đủ nằm ngoài phạm vi MVP)

## Đăng ký

**Đăng ký (Registration)**:
Việc một sinh viên giữ chỗ trong một lớp học phần sau khi đáp ứng các điều kiện đăng ký.
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
Lịch học tổng hợp của các lớp mà một sinh viên đã đăng ký trong một học kỳ.
_Avoid_: Schedule (đã dành cho lịch học của lớp), lịch học tổng hợp
