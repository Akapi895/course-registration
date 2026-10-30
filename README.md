# Hệ thống quản lý và đăng ký học phần

Ứng dụng web để sinh viên đăng ký học phần trong đợt đăng ký của học kỳ và để quản trị viên quản lý lớp học phần. Backend Go/Gin + PostgreSQL 16, frontend React, tài liệu API theo OpenAPI (Swagger).

- Demo trực tuyến (Render): <https://course-registration-demo.onrender.com/>
- Swagger UI: <https://course-registration-demo.onrender.com/swagger/index.html>

## 1. Bài toán và nghiệp vụ

Hệ thống có hai role:

- Sinh viên: tra cứu lớp học phần, đăng ký/hủy học phần và xem thời khóa biểu của mình.
- Quản trị viên: tạo, sửa và hủy lớp học phần.

Các quy tắc chính:

- Mỗi lớp được kiểm tra sĩ số, thời gian đăng ký, trùng lịch, học phần tiên quyết và giới hạn tín chỉ của học kỳ.
- Một request đăng ký được 1–20 lớp, xử lý lần lượt, mỗi lớp một transaction; lớp bị từ chối không ảnh hưởng các lớp đã thành công.
- Hủy đăng ký xóa hẳn record trong database và giảm sĩ số lớp trong cùng transaction.
- Mỗi sinh viên có tối đa một phiên hoạt động và phải chờ `LOGIN_COOLDOWN` (mặc định 20 phút) sau khi phiên kết thúc mới đăng nhập lại được.

Đặc tả đầy đủ, quy tắc nghiệp vụ và tiêu chí nghiệm thu: [docs/SRS.md](docs/SRS.md).

## 2. API: 12 endpoint

| STT | Nhóm | Phương thức | Endpoint | Quyền truy cập |
|---|---|---|---|---|
| 1 | Xác thực | POST | `/api/auth/login` | Công khai |
| 2 | Xác thực | POST | `/api/auth/logout` | Sinh viên, Admin |
| 3 | Xác thực | GET | `/api/auth/me` | Sinh viên, Admin |
| 4 | Lớp học phần | GET | `/api/classes` | Sinh viên, Admin |
| 5 | Lớp học phần | GET | `/api/classes/{id}` | Sinh viên, Admin |
| 6 | Đăng ký | POST | `/api/registrations` | Sinh viên |
| 7 | Đăng ký | GET | `/api/registrations` | Sinh viên |
| 8 | Đăng ký | DELETE | `/api/registrations/{id}` | Sinh viên sở hữu |
| 9 | Đăng ký | GET | `/api/schedules` | Sinh viên |
| 10 | Quản trị | POST | `/api/classes` | Admin |
| 11 | Quản trị | PUT | `/api/classes/{id}` | Admin |
| 12 | Quản trị | DELETE | `/api/classes/{id}` | Admin |

Request, response và mã lỗi: Swagger UI hoặc [docs/api-design.md](docs/api-design.md).

## 3. Công nghệ và kỹ thuật

- Backend: Go 1.26, Gin, pgx v5, JWT, Swagger.
- Frontend: React 19, TypeScript, Vite, Tailwind CSS 4.
- Database: PostgreSQL 16.
- Triển khai và CI: Docker Compose, Render, GitHub Actions.

## 4. Tổ chức mã nguồn

```text
course-registration/
├── backend/
│   ├── cmd/
│   │   └── api/
│   │       └── main.go          # nạp config, tạo DB pool, lắp ghép các tầng, chạy server
│   ├── internal/
│   │   ├── config/              # đọc biến môi trường vào struct Config
│   │   ├── controller/          # HTTP: route, middleware xác thực/phân quyền, handler, DTO, ánh xạ lỗi
│   │   ├── service/             # quy tắc nghiệp vụ, JWT, băm mật khẩu, lỗi nghiệp vụ
│   │   └── repository/          # truy vấn PostgreSQL, tạo connection pool
│   ├── docs/                    # Swagger sinh bởi swag, không sửa tay
│   ├── Dockerfile
│   ├── go.mod
│   └── go.sum
├── frontend/
│   ├── src/
│   │   ├── api/                 # client.ts (fetch, gắn token, xử lý 401), index.ts, types.ts
│   │   ├── auth/                # AuthProvider (phiên, hẹn giờ hết hạn), sessionLock
│   │   ├── components/          # Layout, ui, PeriodBanner, ClassDetailModal, RegistrationFlow, Schedule
│   │   ├── hooks/               # useRequest
│   │   ├── pages/               # auth, student, schedule, admin
│   │   ├── App.tsx              # bảng route theo vai trò
│   │   ├── router.tsx           # router theo hash (#/...)
│   │   └── main.tsx
│   ├── nginx.conf               # phục vụ bản build và proxy /api/ trong Docker Compose
│   ├── Dockerfile
│   └── package.json             # npm + package-lock.json
├── database/
│   ├── migrations/              # 001_initial.sql (schema 9 bảng)
│   ├── tools/                   # migrate, seed, verify, reset
│   ├── data/                    # catalog học phần, kịch bản kiểm thử (scenarios.json)
│   └── docs/                    # tài liệu dữ liệu mẫu
├── deployment/                  # Dockerfile, start.py, smoke test cho Render
├── loadtest/                    # kiểm thử tải/đồng thời/DoS, chạy trên Kaggle CPU (loadtest/README.md)
├── docs/
│   ├── SRS.md
│   ├── api-design.md
│   ├── database-design.md
│   ├── diagrams/                # deployment, erd, sequence, system-architecture, use-case
│   └── adr/
├── docker-compose.yml
├── render.yaml
├── ARCHITECTURE.md
└── README.md
```

Mỗi tài nguyên có một file ở mỗi tầng (controller, service, repository); quy ước chi tiết ở [ARCHITECTURE.md](ARCHITECTURE.md).

## 5. Hướng dẫn chạy (Docker)

### 5.1. Khởi động hệ thống

Yêu cầu Docker Desktop (Linux containers) và Docker Compose v2. Chạy từ thư mục gốc bằng PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose build backend frontend seed
docker compose up -d --wait db
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm seed
docker compose --profile tools run --rm verify
docker compose up -d --wait
```

Lưu ý: Cần chạy `verify` trước khi gọi API hoặc đăng nhập để kiểm tra dữ liệu còn khớp fixture ban đầu.

### 5.2. Truy cập và tài khoản thử nghiệm

- Giao diện web: <http://localhost:5173>
- Swagger UI: <http://localhost:8080/swagger/index.html>; health check: <http://localhost:8080/health>

| Vai trò | Username | Password | Ghi chú |
|---|---|---|---|
| Sinh viên | `student001` | `DemoUET@123` | Đã có sẵn 1 đăng ký lớp 4 (dùng để thử hủy & đăng ký lại) |
| Sinh viên | `student002` – `student100` | `DemoUET@123` | Dùng cho các kịch bản trong `database/data/scenarios.json` |
| Quản trị viên | `admin1`, `admin2` | `DemoUET@123` | Quản trị danh sách lớp học phần |

Sinh viên chỉ có một phiên hoạt động và phải chờ `LOGIN_COOLDOWN` sau khi phiên kết thúc mới đăng nhập. Không áp dụng giới hạn trên cho quản trị viên.

### 5.3. Thao tác vận hành thường dùng

```powershell
# Xem log các service
docker compose logs -f backend frontend db

# Rebuild khi sửa code backend / frontend
docker compose up -d --build --wait backend
docker compose up -d --build --wait frontend

# Reset toàn bộ database và dữ liệu
docker compose down -v
```

## 6. Deploy lên Cloud

Bản demo chạy trên Render qua Blueprint (`render.yaml`):

- Thành phần: một Docker Web Service (Go phục vụ cả API và bản build frontend) và một PostgreSQL 16 cùng vùng.
- CI/CD: Render tự deploy khi `main` qua kiểm tra trên GitHub Actions; `deployment/start.py` kiểm tra schema và nạp dữ liệu mẫu khi container khởi động.
- Health check: <https://course-registration-demo.onrender.com/health>

Quy trình triển khai và biến môi trường: [deployment/README.md](deployment/README.md).

## 7. Tài liệu chi tiết

| Nội dung | Tài liệu |
|---|---|
| Yêu cầu, quy tắc nghiệp vụ, tiêu chí nghiệm thu | [docs/SRS.md](docs/SRS.md) |
| Đặc tả API từng trường, mã lỗi, vòng đời phiên | [docs/api-design.md](docs/api-design.md) |
| Thiết kế CSDL, ràng buộc toàn vẹn, sơ đồ ERD | [docs/database-design.md](docs/database-design.md), [docs/diagrams/](docs/diagrams/) |
| Kiến trúc hệ thống, luồng dữ liệu, quy ước code | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Bản ghi các quyết định kỹ thuật | [docs/adr/](docs/adr/) |
| Hướng dẫn dữ liệu mẫu và kịch bản kiểm thử | [database/docs/demo-guide.md](database/docs/demo-guide.md), [database/data/scenarios.json](database/data/scenarios.json) |
| Hướng dẫn triển khai Render và CI/CD | [deployment/README.md](deployment/README.md) |
| Kết quả kiểm thử tải và chống chịu | [loadtest/README.md](loadtest/README.md) |

## 8. Gợi ý cho Phase 2

Phase 1 tập trung bảo đảm tính đúng đắn nghiệp vụ, nhất quán dữ liệu và bảo mật cơ bản. Các hướng mở rộng cho Phase 2:

| Hướng | Gợi ý |
|---|---|
| Xử lý đồng thời | Tranh chấp dữ liệu đã qua kiểm thử tải ([loadtest/README.md](loadtest/README.md)); cân nhắc hàng đợi hoặc khóa phân tán khi chạy nhiều instance |
| Tối ưu hiệu năng | Giảm tải cho đăng nhập (điểm nghẽn chính), cache danh sách lớp, rà soát chỉ mục, truy vấn và connection pool |
| Kiến trúc | Chỉ cân nhắc tách microservices nếu sau khi xử lý các điểm nghẽn trên, tải thực tế vẫn vượt khả năng |
| Mã nguồn | Áp dụng thêm design pattern ở những chỗ quy tắc đăng ký phình to, ví dụ tách từng quy tắc thành đối tượng kiểm tra riêng |
| Bảo vệ API | Rate limit cho đăng nhập và đăng ký, giới hạn số lần thử sai mật khẩu theo tài khoản, timeout cho HTTP server, giới hạn kích thước body |
| Kiểm soát quá tải | Giới hạn số lượt kiểm tra mật khẩu chạy đồng thời, từ chối sớm khi quá tải, bỏ qua yêu cầu client đã hủy và không tính chúng là lỗi 500 |
| Bảo mật | Dùng HTTPS khi triển khai thực tế (SRS yêu cầu, Phase 1 đang dùng HTTP). Cân nhắc chuyển token từ `sessionStorage` sang cookie `HttpOnly` kèm chống CSRF, để giảm rủi ro nếu có lỗ hổng XSS |
| Phân trang | Phân trang và lọc phía server cho `GET /api/classes` |
| Migration | Thay cơ chế fingerprint bằng migration có phiên bản, để nâng cấp schema mà không phải xóa dữ liệu |
| Hạ tầng | Sao lưu database, môi trường staging trước khi deploy production |
