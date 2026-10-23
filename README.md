# Hệ thống quản lý và đăng ký học phần — Phase 1

Backend Go/Gin, PostgreSQL 16 và Swagger cho 15 endpoint trong [SRS](docs/SRS.md). Yêu cầu và hợp đồng API nằm tại [docs/SRS.md](docs/SRS.md) và [docs/api-design.md](docs/api-design.md).

## 1. Chuẩn bị cấu hình

Cài Docker Desktop, bật Linux containers và Docker Compose v2 có hỗ trợ `--wait`. Lần build đầu cần Internet để tải image và dependency. Chạy các lệnh dưới đây từ thư mục gốc repository bằng PowerShell; không cần cài Go/Python để chạy bằng Docker.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Nếu đã có `.env`, bổ sung các biến còn thiếu từ `.env.example`, giữ lại cấu hình đang dùng. Các giá trị secret/password trong file mẫu chỉ phục vụ demo local; đặt giá trị riêng khi triển khai.

| Biến | Ý nghĩa |
|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Database và tài khoản PostgreSQL; Compose dùng cùng thông tin cho API và các công cụ dữ liệu |
| `POSTGRES_PORT` | Cổng PostgreSQL trên host, mặc định `5432`; kết nối giữa container luôn là `db:5432` |
| `PORT` | Cổng API trên host, mặc định `8080`; API trong container luôn nghe cổng `8080` |
| `DATABASE_URL` | URL khi chạy API trực tiếp trên host; Compose tự cấp URL dùng `db:5432`, không dùng giá trị host này |
| `JWT_SECRET` | Khóa ký JWT; cần giữ nguyên để token hiện hành tiếp tục được xác thực sau khi khởi động lại |
| `JWT_TTL`, `SESSION_TTL` | Thời hạn theo cú pháp Go, mặc định `1h` và `24h`; thời hạn phiên phải ít nhất bằng thời hạn JWT |
| `REFERENCE_DATE`, `RANDOM_SEED` | Ngày neo và seed của dữ liệu mẫu, mặc định `2026-10-20` và `20261020` |

Nếu cổng bị chiếm hoặc Windows không cho phép bind, đổi `PORT` (ví dụ `8081`) hoặc `POSTGRES_PORT` (máy local hiện dùng `55432`). Khi chạy API trên host, cập nhật cả `DATABASE_URL` cho khớp cổng và thông tin `POSTGRES_*`; password trong URL phải được URL-encode nếu có ký tự đặc biệt.

## 2. Khởi chạy lần đầu với database mới

```powershell
docker compose build backend seed
docker compose up -d --wait db
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm seed
docker compose --profile tools run --rm verify
docker compose up -d --wait
docker compose ps
```

Chỉ chuyển sang lệnh tiếp theo khi lệnh trước thành công. Compose chờ PostgreSQL healthy trước khi bật API; migrate/seed được chạy tường minh theo thứ tự trên. Kết quả cuối: `db` và `backend` đều `healthy`. Các công cụ `migrate`, `seed`, `verify`, `crawl` vẫn nằm trong profile `tools`; chúng không chạy khi khởi động ứng dụng bình thường.

Seed dùng catalog đã lưu, không cần crawl nguồn lại. Với fixture mặc định hiện tại, verify báo 102 tài khoản, 80 lớp, 104 đăng ký, 100 kết quả học phần và 0 phiên đăng nhập. Seed chỉ lặp lại được khi dữ liệu còn giống fixture. Sau login hoặc các thao tác API, seed/verify có thể từ chối vì dữ liệu đã đổi; verify fixture trước khi kiểm thử API.

**Database cũ:** dữ liệu được giữ trong volume `postgres_data`. Seed mới không tự ghi đè dữ liệu cũ hoặc dữ liệu đã bị API thay đổi; muốn nạp lại fixture, dùng database/project riêng hoặc quy trình reset tường minh trong [hướng dẫn dữ liệu](database/docs/demo-guide.md). Đổi `POSTGRES_*` trong `.env` không tự đổi tài khoản/database trong volume đã khởi tạo.

## 3. Sử dụng và kiểm thử Swagger

Với `PORT=8080`:

- Kiểm tra tiến trình API: <http://localhost:8080/health>.
- Swagger UI: <http://localhost:8080/swagger/index.html>.
- Đặc tả JSON: <http://localhost:8080/swagger/doc.json>.

Nếu đổi `PORT`, thay cổng tương ứng trong URL. `/health` kiểm tra tiến trình HTTP; dùng login hoặc API nghiệp vụ để kiểm tra cả schema và dữ liệu.

1. Tại Swagger, gọi `POST /api/auth/login` bằng `student001` hoặc `admin1`, password demo `DemoUET@123`. Các tài khoản khác: `student002`–`student100`, `admin2`.
2. Sao chép `data.access_token`, bấm **Authorize**, nhập đầy đủ `Bearer <access_token>` rồi thử các API được bảo vệ.
3. Dùng [database/data/scenarios.json](database/data/scenarios.json) để chọn tài khoản/lớp cho các tình huống thành công và lỗi nghiệp vụ. Kiểm tra cả phân quyền, quyền sở hữu và token cũ sau logout theo SRS §8.

Thời gian nghiệp vụ dùng đồng hồ thực, không dùng `REFERENCE_DATE`. Fixture mặc định mở đăng ký từ ngày neo −7 đến +30 ngày. Nếu demo ở thời điểm khác, chọn ngày neo phù hợp **trước khi seed database mới**, hoặc dùng tài khoản admin cấu hình lại thời gian qua `PUT /api/registration-period`. Giới hạn 12 tín chỉ là cấu hình demo.

## 4. Dừng, khởi động lại và kiểm tra lỗi

```powershell
docker compose logs backend db
docker compose stop
docker compose up -d --wait
```

`docker compose down` gỡ container/network nhưng giữ volume. `docker compose down -v` xóa dữ liệu PostgreSQL; chỉ dùng khi chủ động bỏ database đó. Sau khi thay code backend, chạy `docker compose up -d --build --wait backend`. Khi thay dependency hoặc Dockerfile của công cụ dữ liệu, chạy lại `docker compose build seed`.

Có thể chỉ chạy database và công cụ như trước:

```powershell
docker compose up -d --wait db
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm verify
```

Nếu API không khởi động, kiểm tra log và `JWT_TTL`/`SESSION_TTL`. Nếu login lỗi do thiếu bảng/dữ liệu, hoàn tất migrate và seed trước. Nếu `REGISTRATION_CLOSED`, kiểm tra cửa sổ đăng ký của học kỳ thay vì chỉ kiểm tra trạng thái container.

## 5. Phát triển backend trên host

Cần Go 1.26.0 và PostgreSQL đã migrate/seed. Đặt `DATABASE_URL` trỏ tới `127.0.0.1:<POSTGRES_PORT>`, khai báo `JWT_SECRET` trong `.env`. Dừng service backend trong Compose để nhường cổng nếu cần: `docker compose stop backend`.

Chạy trong thư mục `backend/`:

```powershell
go run ./cmd/api
# Các lệnh kiểm tra chạy ở terminal khác hoặc sau khi dừng API:
go test ./...
go vet ./...
gofmt -l .
```

Backend nạp `.env` đầu tiên tìm thấy trong thư mục hiện tại hoặc thư mục cha; biến môi trường của shell được ưu tiên. `go test` báo `[no test files]` không thay thế việc kiểm thử API qua Swagger.

Khi sửa annotation/DTO API, tái sinh Swagger từ `backend/`:

```powershell
go run github.com/swaggo/swag/cmd/swag@v1.16.4 init -g cmd/api/main.go -o docs
```

`backend/docs/` là mã/tài liệu sinh tự động và đã được đóng gói trong binary. Kiến trúc và quy ước code: [ARCHITECTURE.md](ARCHITECTURE.md) §2.1; schema: [docs/database-design.md](docs/database-design.md) và [docs/database.dbml](docs/database.dbml). Một số mô tả cũ trong tài liệu database được viết trước khi có API; dùng hướng dẫn khởi chạy backend tại README này.
