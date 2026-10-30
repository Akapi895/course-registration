# Hệ thống quản lý và đăng ký học phần

Ứng dụng web để sinh viên đăng ký học phần trong đợt đăng ký của học kỳ và để quản trị viên quản lý lớp học phần. Backend Go/Gin + PostgreSQL 16, frontend React, tài liệu API theo OpenAPI (Swagger).

- **Demo trực tuyến (Render):** [https://course-registration-demo.onrender.com/](https://course-registration-demo.onrender.com/)
- **Swagger UI:** [https://course-registration-demo.onrender.com/swagger/index.html](https://course-registration-demo.onrender.com/swagger/index.html)

---

## 1. Bài toán và nghiệp vụ

Hệ thống cung cấp giải pháp đăng ký học phần trực tuyến theo thời gian thực cho trường đại học, phân quyền theo 2 vai trò chính:

- **Sinh viên:** Tra cứu lớp học phần, thực hiện đăng ký / hủy môn học và theo dõi thời khóa biểu cá nhân.
- **Quản trị viên:** Quản lý danh mục lớp học phần (tạo mới, điều chỉnh thông tin hoặc hủy lớp).

**Tóm tắt quy tắc cốt lõi:**
- **Điều kiện đăng ký:** Tự động kiểm tra sĩ số lớp, khung giờ mở cổng đăng ký, trùng lịch học, học phần tiên quyết và giới hạn tín chỉ tối đa trong học kỳ.
- **Xử lý đăng ký:** Hỗ trợ đăng ký đồng thời 1–20 lớp trong một request, xử lý tuần tự theo từng transaction độc lập (lớp lỗi không ảnh hưởng các lớp thành công).
- **Chính sách phiên & dữ liệu:** Mỗi sinh viên duy trì tối đa 1 phiên hoạt động (áp dụng `LOGIN_COOLDOWN` 20 phút); dữ liệu hủy đăng ký được xử lý xóa vật lý để giải phóng chỉ tiêu ngay lập tức.

*Chi tiết đặc tả yêu cầu, toàn bộ quy tắc nghiệp vụ và tiêu chí nghiệm thu: xem tại [docs/SRS.md](docs/SRS.md).*

---

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

*Chi tiết request/response, payload và mã lỗi: xem tại Swagger UI hoặc [docs/api-design.md](docs/api-design.md).*

---

## 3. Công nghệ và kỹ thuật

- **Backend:** Go 1.26, Gin, pgx v5, JWT, Swagger.
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4.
- **Database:** PostgreSQL 16.
- **DevOps & CI:** Docker Compose, Render, GitHub Actions.

---

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

*Quy ước: mỗi tài nguyên một file qua 3 tầng (controller / service / repository). Chi tiết: [ARCHITECTURE.md](ARCHITECTURE.md).*

---

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

> *Lưu ý: Lệnh `verify` cần chạy trước khi gọi API hoặc đăng nhập để đảm bảo dữ liệu khớp đúng fixture ban đầu.*

### 5.2. Truy cập & Tài khoản thử nghiệm

- **Giao diện Web:** <http://localhost:5173>
- **Swagger UI:** <http://localhost:8080/swagger/index.html> *(Health check: <http://localhost:8080/health>)*

| Vai trò | Username | Password | Ghi chú |
|---|---|---|---|
| **Sinh viên** | `student001` | `DemoUET@123` | Đã có sẵn 1 đăng ký lớp 4 (dùng để thử hủy & đăng ký lại) |
| **Sinh viên** | `student002` – `student100` | `DemoUET@123` | Dùng cho các kịch bản trong `database/data/scenarios.json` |
| **Quản trị viên** | `admin1`, `admin2` | `DemoUET@123` | Quản trị danh sách lớp học phần |

> *Lưu ý : Sinh viên chỉ duy trì duy nhất 1 phiên hoạt động (cần chờ `LOGIN_COOLDOWN` sau khi kết thúc phiên để đăng nhập lại). Quản trị viên không áp dụng cooldown.*

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

---

## 6. Triển khai lên Cloud

Hệ thống được đóng gói và triển khai tự động lên **Render** thông qua Blueprint (`render.yaml`):

- **Thành phần:** 1 Docker Web Service (Go đóng vai trò reverse proxy phục vụ cả API và frontend tĩnh) kết nối 1 cơ sở dữ liệu PostgreSQL 16 cùng vùng.
- **Quy trình CI/CD:** Tự động kích hoạt khi push vào nhánh `main` sau khi vượt qua kiểm thử trên GitHub Actions; script `deployment/start.py` tự động xác thực schema và nạp dữ liệu mẫu khi khởi động container.
- **Kết quả triển khai (Demo Live):**
  - **Giao diện Web:** <https://course-registration-demo.onrender.com/>
  - **Swagger UI:** <https://course-registration-demo.onrender.com/swagger/index.html>
  - **Health Check:** <https://course-registration-demo.onrender.com/health>

*Chi tiết quy trình triển khai và cấu hình biến môi trường: xem tại [deployment/README.md](deployment/README.md).*

---

## 7. Tài liệu chi tiết

| Nội dung | Tài liệu |
|---|---|
| Yêu cầu, quy tắc nghiệp vụ, tiêu chí nghiệm thu | [docs/SRS.md](docs/SRS.md) |
| Đặc tả API từng trường, mã lỗi, vòng đời phiên | [docs/api-design.md](docs/api-design.md) |
| Thiết kế CSDL, ràng buộc toàn vẹn, sơ đồ ERD | [docs/database-design.md](docs/database-design.md), [docs/diagrams/](docs/diagrams/) |
| Kiến trúc hệ thống, luồng dữ liệu, quy ước code | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Bản ghi các quyết định kỹ thuật | [docs/adr/](docs/adr/) |
| Hướng dẫn dữ liệu mẫu và kịch bản kiểm thử | [database/docs/demo-guide.md](database/docs/demo-guide.md), [database/data/scenarios.json](database/data/scenarios.json) |
| Hướng dẫn triển khai Render & CI/CD | [deployment/README.md](deployment/README.md) |

## 8. Gợi ý cho Phase 2

Phase 1 tập trung bảo đảm tính đúng đắn nghiệp vụ, nhất quán dữ liệu và bảo mật cơ bản. Các hướng mở rộng cho Phase 2:

| Hướng | Gợi ý |
|---|---|
| Xử lý đồng thời | Kiểm chứng các tình huống tranh chấp (giành chỗ cuối, đăng ký/hủy đồng thời, sửa lớp khi đang đăng ký, đăng nhập song song) bằng kiểm thử tải; cân nhắc hàng đợi hoặc khóa phân tán khi chạy nhiều instance |
| Tối ưu hiệu năng | Đo trước khi tối ưu: chỉ mục và truy vấn, kích thước connection pool, bộ nhớ đệm cho danh sách lớp |
| Kiến trúc | Cân nhắc tách thành các dịch vụ riêng (microservices) như xác thực, lớp học phần, đăng ký, nếu số liệu tải cho thấy cần thiết |
| Mã nguồn | Áp dụng thêm design pattern ở những chỗ quy tắc đăng ký phình to, ví dụ tách từng quy tắc thành đối tượng kiểm tra riêng |
| Bảo vệ API | Rate limit và chống DoS/DDoS, đặc biệt với `POST /api/auth/login` và `POST /api/registrations` |
| Bảo mật | Dùng HTTPS khi triển khai thực tế (SRS yêu cầu, Phase 1 đang dùng HTTP). Cân nhắc chuyển token từ `sessionStorage` sang cookie `HttpOnly` kèm chống CSRF, để giảm rủi ro nếu có lỗ hổng XSS |
| Phân trang | Phân trang và lọc phía server cho `GET /api/classes` khi số lớp tăng |
| Migration | Thay cơ chế fingerprint bằng migration có phiên bản, để nâng cấp schema mà không phải xóa dữ liệu |
| Hạ tầng | Sao lưu database, môi trường staging trước khi deploy production |
