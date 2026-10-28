# ADR-01: Lựa chọn ngôn ngữ backend - Go

## Bối cảnh

Backend cần cung cấp API tra cứu, đăng ký, hủy đăng ký và quản trị lớp học phần. Nhóm cần một ngôn ngữ có kiểu dữ liệu rõ ràng, hỗ trợ kiểm thử và thuận tiện khi đóng gói bằng Docker.

## Quyết định

Chọn **Go** cho backend. Go có thư viện HTTP sẵn có, hỗ trợ xử lý nhiều yêu cầu bằng goroutine và biên dịch thành file thực thi. Các công cụ `gofmt`, `go test`, `go vet` giúp nhóm thống nhất cách viết và kiểm tra code.

TypeScript trên Node.js có lợi thế dùng chung ngôn ngữ với frontend; Java/Spring Boot, C#/ASP.NET Core, Python/Django và PHP/Laravel cung cấp nhiều chức năng sẵn có. Nhóm chọn Go để giữ cách tổ chức và triển khai backend gọn, chấp nhận tự xây dựng thêm các phần xử lý cần thiết.

## Đánh đổi

Go yêu cầu xử lý lỗi tường minh và không cung cấp sẵn toàn bộ cấu trúc ứng dụng. Nhóm phải thống nhất ranh giới giữa HTTP, nghiệp vụ và truy cập dữ liệu. Khả năng xử lý đồng thời của ngôn ngữ không thay thế transaction và ràng buộc trong cơ sở dữ liệu.

## Tài liệu liên quan

- [SRS](../SRS.md), §7.1 và §7.3.
- [Kiến trúc backend](../../ARCHITECTURE.md), §2.1.
