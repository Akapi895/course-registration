# Hệ thống quản lý và đăng ký học phần

Ứng dụng web để sinh viên đăng ký học phần trong đợt đăng ký của học kỳ và để quản trị viên quản lý lớp học phần. Backend Go/Gin + PostgreSQL 16, frontend React, tài liệu API theo OpenAPI (Swagger).

## 1. Bài toán và nghiệp vụ

**Bài toán (Phase 1).** Xây dựng hệ thống đăng ký học phần với các tính năng cơ bản, cung cấp qua RESTful API: đăng nhập, tra cứu lớp học phần, đăng ký và hủy đăng ký, xem thời khóa biểu, quản lý lớp học phần. Việc đăng ký phải tuân theo các quy tắc nghiệp vụ bên dưới.

**Vai trò.**
- *Sinh viên*: đăng nhập, tra cứu lớp, đăng ký và hủy đăng ký, xem thời khóa biểu của mình.
- *Quản trị viên*: tạo, sửa và hủy lớp học phần; không đăng ký hay hủy thay sinh viên.

**Quy tắc đăng ký** (kiểm tra riêng cho từng lớp):

| Quy tắc | Nội dung |
|---|---|
| Sĩ số | Từ chối khi `enrolled` đạt `max_capacity` |
| Thời gian | Đăng ký và hủy chỉ trong khoảng mở/đóng đăng ký của học kỳ |
| Trùng lịch | Không trùng thứ/tiết với lớp đã đăng ký cùng học kỳ |
| Tiên quyết | Phải đạt các học phần tiên quyết (`course_results`) |
| Tín chỉ | Tổng tín chỉ trong học kỳ không vượt giới hạn (`MAX_CREDITS` nếu có, nếu không dùng giá trị của học kỳ) |
| Không trùng | Mỗi sinh viên tối đa một đăng ký cho một lớp |
| Nhiều lớp | Một request gồm 1–20 lớp khác nhau, xử lý lần lượt, mỗi lớp một transaction; lớp bị từ chối không ảnh hưởng lớp khác. Request hợp lệ luôn trả `200` kèm kết quả từng lớp |

**Xác thực và phiên.** Đăng nhập trả `access_token` (JWT HS256 gồm `sub`, `role`, `sid`, `iat`, `exp`). Mỗi request kiểm tra chữ ký, phiên trong bảng `auth_sessions` và so `role` với dòng `users` hiện tại. Mỗi sinh viên chỉ có **một phiên hoạt động** trên mọi thiết bị: đăng nhập khi còn phiên trả `409 ALREADY_LOGGED_IN`; sau khi phiên kết thúc (logout hoặc hết hạn) phải chờ `LOGIN_COOLDOWN` (mặc định 20 phút) mới đăng nhập lại, nếu chưa đến lúc trả `429 LOGIN_COOLDOWN` kèm `Retry-After`. Quản trị viên có thể có nhiều phiên, không có cooldown, token sống 8 giờ.

**Dữ liệu khi hủy.**
- Sinh viên hủy đăng ký: **xóa vật lý** bản ghi `registrations` và giảm `enrolled`. Đăng ký lại tạo ID mới; không lưu lịch sử hủy.
- Quản trị viên hủy lớp: giữ bản ghi lớp với `status = cancelled`, **xóa vật lý** mọi đăng ký của lớp và đặt `enrolled = 0` trong cùng transaction.

## 2. API: 12 endpoint

| STT | Nhóm | Phương thức | Endpoint | Quyền truy cập |
|---|---|---|---|---|
| 1 | Xác thực | POST | `/api/auth/login` | Công khai |
| 2 | Xác thực | POST | `/api/auth/logout` | Sinh viên, admin |
| 3 | Xác thực | GET | `/api/auth/me` | Sinh viên, admin |
| 4 | Lớp học phần | GET | `/api/classes` | Sinh viên, admin |
| 5 | Lớp học phần | GET | `/api/classes/{id}` | Sinh viên, admin |
| 6 | Đăng ký | POST | `/api/registrations` | Sinh viên |
| 7 | Đăng ký | GET | `/api/registrations` | Sinh viên |
| 8 | Đăng ký | DELETE | `/api/registrations/{id}` | Sinh viên sở hữu |
| 9 | Đăng ký | GET | `/api/schedules` | Sinh viên |
| 10 | Quản trị | POST | `/api/classes` | Admin |
| 11 | Quản trị | PUT | `/api/classes/{id}` | Admin |
| 12 | Quản trị | DELETE | `/api/classes/{id}` | Admin |


**Quy ước.** Thành công: `{ "status": "success", "data": ... }`. Lỗi: `{ "status": "fail", "data": { "code", "message" } }`; client xử lý theo `code`. API được bảo vệ nhận `Authorization: Bearer <access_token>`.

| Nhóm lỗi | Mã (HTTP) |
|---|---|
| Xác thực | `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `SESSION_REVOKED` (401); `ALREADY_LOGGED_IN` (409); `LOGIN_COOLDOWN` (429) |
| Quyền và dữ liệu | `VALIDATION_ERROR` (400), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500) |
| Nghiệp vụ (409) | `CLASS_FULL`, `CLASS_CANCELLED`, `REGISTRATION_CLOSED`, `ALREADY_REGISTERED`, `SCHEDULE_CONFLICT`, `PREREQUISITE_NOT_MET`, `CREDIT_LIMIT_EXCEEDED`, `CAPACITY_BELOW_ENROLLED`, `SCHEDULE_LOCKED` |

Với `POST /api/registrations`, các mã nghiệp vụ nằm trong `results[].code` của từng lớp, không phải HTTP 4xx. Đặc tả từng trường: [docs/api-design.md](docs/api-design.md); Swagger chạy cùng backend.

## 3. Công nghệ và kỹ thuật

| Thành phần | Lựa chọn |
|---|---|
| Backend | Go 1.26, Gin, pgx v5, golang-jwt (HS256), bcrypt, swaggo (Swagger sinh từ chú thích) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, router theo hash; token trong `sessionStorage` |
| Database | PostgreSQL 16, 9 bảng, ràng buộc `CHECK`/`UNIQUE`/FK; một file `database/migrations/001_initial.sql` |
| Triển khai | Docker Compose (local): 3 container `db`, `backend`, `frontend`; frontend build bằng Node rồi phục vụ bằng nginx, nginx chuyển `/api/` tới backend. Render (demo Internet): một Web Service duy nhất, không dùng nginx, Go phục vụ cả React đã build qua `FRONTEND_DIR` |
| CI | GitHub Actions: `go test`/`go vet`, `npm run typecheck`/`build`, build image Render và smoke test API + trình duyệt (Playwright) |

**Kiến trúc backend.** Ba tầng một chiều `controller → service → repository`: controller giữ route, DTO, middleware, ánh xạ lỗi; service giữ quy tắc nghiệp vụ và lỗi nghiệp vụ; repository giữ SQL. Controller không chứa SQL, service không import `gin`.

**Triển khai.** Khi khởi động trên Render, `deployment/start.py` lấy khóa tư vấn (advisory lock) rồi: database trống thì áp dụng `001_initial.sql` và nạp dữ liệu mẫu; database có sẵn thì kiểm tra schema; schema không khớp thì dừng, không tự sửa. Web Service và PostgreSQL gói Free: service ngủ sau 15 phút không truy cập, database hết hạn sau 30 ngày.

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
│   │   ├── api/                 # client.ts (fetch, gắn token, xử lý 401), index.ts (hàm gọi từng endpoint), types.ts
│   │   ├── auth/                # AuthProvider (phiên, hẹn giờ hết hạn), sessionLock (chế độ chỉ xem)
│   │   ├── components/          # Layout, ui, PeriodBanner, ClassDetailModal, RegistrationFlow, Schedule
│   │   ├── hooks/               # useRequest
│   │   ├── pages/               # auth, student, schedule, admin
│   │   ├── App.tsx              # bảng route theo vai trò
│   │   ├── router.tsx           # router theo hash (#/...)
│   │   └── main.tsx
│   ├── nginx.conf               # phục vụ bản build và proxy /api/ trong Compose
│   ├── Dockerfile
│   └── package.json             # npm + package-lock.json
├── database/
│   ├── migrations/              # 001_initial.sql (schema 9 bảng)
│   ├── tools/                   # migrate, seed, verify, reset
│   ├── data/                    # catalog học phần, kịch bản kiểm thử (scenarios.json)
│   └── docs/                    # hướng dẫn dữ liệu mẫu
├── deployment/                  # Dockerfile, start.py, smoke test cho Render
├── docs/
│   ├── SRS.md
│   ├── api-design.md
│   ├── database-design.md
│   ├── diagrams/                # deployment, erd, sequence, system-architecture, use-case
│   └── adr/
├── docker-compose.yml
├── render.yaml
├── GLOSSARY.md
├── ARCHITECTURE.md
└── README.md
```

Quy ước backend: mỗi tài nguyên một file trong mỗi tầng (`class.go` ở cả ba tầng); struct request/response ở `controller/`, struct theo bảng ở `repository/`; lỗi nghiệp vụ ở `service/errors.go`, ánh xạ sang HTTP ở `controller/response.go`. Chi tiết: [ARCHITECTURE.md](ARCHITECTURE.md) §2.1.

## 5. Chạy bằng Docker (local)

Cần Docker Desktop (Linux containers) và Docker Compose v2. Chạy từ thư mục gốc bằng PowerShell; không cần cài Go hay Python.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose build backend frontend seed
docker compose up -d --wait db
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm seed
docker compose --profile tools run --rm verify
docker compose up -d --wait
```

Chỉ chạy lệnh tiếp theo khi lệnh trước thành công. `verify` phải chạy **trước khi đăng nhập hoặc gọi API**, vì sau đó dữ liệu không còn khớp dữ liệu mẫu (103 đăng ký, 0 phiên). Kết quả cuối: `db`, `backend`, `frontend` đều `healthy`.

| Địa chỉ (cổng mặc định) | |
|---|---|
| <http://localhost:5173> | Giao diện |
| <http://localhost:8080/swagger/index.html> | Swagger UI (`/swagger/doc.json`: đặc tả JSON) |
| <http://localhost:8080/health> | Kiểm tra tiến trình API |

**Tài khoản demo** (dùng chung cho bản local và bản Render):

| Vai trò | Username | Password | Ghi chú |
|---|---|---|---|
| Sinh viên | `student001` | `DemoUET@123` | Đã có sẵn một đăng ký (lớp 4), dùng để thử hủy và đăng ký lại |
| Sinh viên | `student002`–`student100` | `DemoUET@123` | Dùng cho các tình huống trong `scenarios.json` |
| Quản trị viên | `admin1` | `DemoUET@123` | Tạo, sửa, hủy lớp học phần |
| Quản trị viên | `admin2` | `DemoUET@123` | Như `admin1` |

Sinh viên chỉ có một phiên hoạt động: sau khi đăng xuất hoặc hết hạn phải chờ `LOGIN_COOLDOWN` (mặc định 20 phút) mới đăng nhập lại. Quản trị viên không có cooldown.

Trong Swagger, gọi `POST /api/auth/login`, bấm **Authorize** và nhập đầy đủ `Bearer <access_token>`. Kịch bản kiểm thử (thành công, trùng lịch, lớp đầy, vượt tín chỉ, đăng ký lại...) nằm ở [database/data/scenarios.json](database/data/scenarios.json). Đăng nhập lặp lại có thể gặp `429`; xem `login_allowed_at` hoặc đặt `LOGIN_COOLDOWN` ngắn khi thử.

**Cấu hình** nằm trong `.env` (sao chép từ `.env.example`): thông tin PostgreSQL, cổng, `JWT_SECRET`, thời hạn token/phiên (`JWT_TTL`, `SESSION_TTL`, `ADMIN_JWT_TTL`), `LOGIN_COOLDOWN`, `MAX_CREDITS` và ngày neo dữ liệu mẫu `REFERENCE_DATE`. Cần nhớ ba điều: `JWT_TTL` và `SESSION_TTL` phải bằng nhau; `REFERENCE_DATE` phải đặt trước khi seed; nếu Windows không cho bind cổng thì đổi `POSTGRES_PORT`, `PORT` hoặc `FRONTEND_PORT`. Fixture mặc định mở đăng ký từ ngày neo −7 đến +30 ngày.

**Database và schema.** Dữ liệu nằm trong volume `postgres_data`. Seed không ghi đè dữ liệu đã có; đổi `POSTGRES_*` hay build lại image cũng không đổi database trong volume. Công cụ `migrate` so dấu vân tay (fingerprint) của schema với `001_initial.sql` và từ chối nếu khác. Vì vậy khi schema thay đổi, hoặc muốn nạp lại dữ liệu mẫu, chạy `docker compose down -v` (xóa dữ liệu PostgreSQL) rồi thực hiện lại các bước trên. Chi tiết dữ liệu mẫu và reset: [database/docs/demo-guide.md](database/docs/demo-guide.md).

**Vận hành thường dùng.**

```powershell
docker compose logs backend frontend db
docker compose stop
docker compose up -d --build --wait backend   # sau khi sửa code backend (tương tự: frontend)
docker compose up -d --force-recreate backend # sau khi đổi .env
```

## 6. Phát triển và kiểm thử

**Backend** (cần Go 1.26.0 và PostgreSQL đã migrate/seed; dừng backend Compose nếu trùng cổng). Backend nạp `.env` đầu tiên tìm thấy ở thư mục hiện tại hoặc thư mục cha; biến môi trường của shell được ưu tiên. Chạy từ `backend/`:

```powershell
go run ./cmd/api
go test ./...; go vet ./...; gofmt -l .
go run github.com/swaggo/swag/cmd/swag@v1.16.4 init -g cmd/api/main.go -o docs   # sau khi sửa chú thích/DTO API
```

Test tích hợp (auth, đăng ký, hủy) cần PostgreSQL thật: đặt `TEST_DATABASE_URL` rồi chạy `go test ./internal/controller -v`. Mỗi test tạo và xóa schema riêng, không động vào dữ liệu ứng dụng; thiếu biến này các test bị bỏ qua (CI luôn cấp PostgreSQL 16). `backend/docs/` là mã sinh tự động, không sửa tay.

**Frontend** (cần Node 22.12+ hoặc 24; dừng frontend Docker nếu trùng cổng 5173). Từ `frontend/`:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm run typecheck   # npm run build không kiểm tra kiểu
npm run dev
```

Vite chuyển `/api` tới `API_PROXY_TARGET` trong `frontend/.env` (mặc định `http://127.0.0.1:8080`); đổi giá trị này nếu API chạy cổng khác. Dự án dùng npm và `package-lock.json`. Chưa có script test frontend.

**Smoke test như CI** (từ thư mục gốc, cần Python Playwright 1.56.0 và Chromium):

```powershell
docker build -f deployment/Dockerfile -t course-registration-render-test .
python -u deployment/smoke_test.py --image course-registration-render-test --browser
```

## 7. Triển khai lên Render

`render.yaml` là Blueprint gồm một Web Service Docker (`deployment/Dockerfile`, healthcheck `/health`) và một PostgreSQL 16, cùng region; `DATABASE_URL` lấy từ database qua `fromDatabase`, `JWT_SECRET` được sinh tự động. Render tự deploy commit mới trên `main` khi CI thành công. Khi thay schema, tạo PostgreSQL mới (hoặc xóa dữ liệu cũ), cập nhật `DATABASE_URL` của service rồi redeploy để startup khởi tạo schema và dữ liệu mẫu. Hướng dẫn đầy đủ, liên kết CI/CD và cấu hình biến: [deployment/README.md](deployment/README.md).

## 8. Tài liệu chi tiết

| Cần biết | Xem |
|---|---|
| Yêu cầu, quy tắc nghiệp vụ, tiêu chí nghiệm thu | [docs/SRS.md](docs/SRS.md) |
| Request/response từng trường, mã lỗi, vòng đời phiên | [docs/api-design.md](docs/api-design.md) |
| Schema, ràng buộc, ERD | [docs/database-design.md](docs/database-design.md), [docs/diagrams/](docs/diagrams/) |
| Kiến trúc, luồng xử lý, quy ước code | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Quyết định kỹ thuật (ngôn ngữ, PostgreSQL, JWT, phiên) | [docs/adr/](docs/adr/) |
| Thuật ngữ dùng chung | [GLOSSARY.md](GLOSSARY.md) |
| Dữ liệu mẫu và tình huống kiểm thử | [database/docs/](database/docs/) |

## 9. Gợi ý cho Phase 2

Phase 1 dừng ở đúng nghiệp vụ, nhất quán dữ liệu và bảo mật cơ bản. Các hướng cho Phase 2:

| Hướng | Gợi ý |
|---|---|
| Xử lý đồng thời | Kiểm chứng các tình huống tranh chấp (giành chỗ cuối, đăng ký/hủy đồng thời, sửa lớp khi đang đăng ký, đăng nhập song song) bằng kiểm thử tải; cân nhắc hàng đợi hoặc khóa phân tán khi chạy nhiều instance |
| Tối ưu hiệu năng | Đo trước khi tối ưu: chỉ mục và truy vấn, kích thước connection pool, bộ nhớ đệm cho danh sách lớp |
| Kiến trúc | Cân nhắc tách thành các dịch vụ riêng (microservices) như xác thực, lớp học phần, đăng ký, nếu số liệu tải cho thấy cần thiết |
| Mã nguồn | Áp dụng thêm design pattern ở những chỗ quy tắc đăng ký phình to, ví dụ tách từng quy tắc thành đối tượng kiểm tra riêng |
| Bảo vệ API | Rate limit và chống DoS/DDoS, đặc biệt với `POST /api/auth/login` và `POST /api/registrations` |
| Nghiệp vụ | Thông báo cho sinh viên khi lớp bị hủy, lưu lịch sử đăng ký/hủy, API danh sách học phần để form tạo lớp không phải nhập tay `course_id` |
