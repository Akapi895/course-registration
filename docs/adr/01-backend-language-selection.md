# ADR-01: Chọn Go cho backend

Backend cần API tra cứu, đăng ký, hủy đăng ký và quản trị lớp học phần, đóng gói bằng Docker. Chọn Go vì build ra một file chạy duy nhất, có sẵn `gofmt`, `go test`, `go vet`, và thư viện HTTP đủ dùng.

Đổi lại, Go không có framework dựng sẵn như Spring hay Django, nên nhóm tự thống nhất ranh giới controller, service, repository (xem ARCHITECTURE.md §2.1). Goroutine cũng không thay được transaction và ràng buộc trong database.
