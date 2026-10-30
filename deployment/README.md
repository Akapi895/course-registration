# Deployment

Cấu hình chạy bản demo trên Render: giao diện React và API Go/Gin nằm trong một Docker image, dữ liệu lưu ở Render PostgreSQL.

## Kiến trúc

```text
Browser ── HTTPS ── Render ── HTTP ── Go/Gin
                                      ├── /              React build
                                      ├── /assets/*      Static assets
                                      ├── /api/*         REST API
                                      ├── /swagger/*     Swagger UI / OpenAPI
                                      └── PostgreSQL    Render private network
```

Render xử lý TLS, ứng dụng nghe trên `PORT`. Frontend gọi API cùng origin và dùng route hash (`/#/login`), nên không cần rewrite đường dẫn về `index.html`. Docker Compose local dùng nginx riêng; Render không dùng `docker-compose.yml` hay `frontend/nginx.conf`.

## Thành phần

| File | Vai trò |
|---|---|
| [`../render.yaml`](../render.yaml) | Blueprint khai báo Web Service và PostgreSQL (gói Free, vùng Singapore, nhánh `main`), healthcheck `/health`. |
| [`Dockerfile`](Dockerfile) | Multi-stage build cho React và Go, runtime chạy bằng user không đặc quyền. |
| [`start.py`](start.py) | Khởi tạo database demo rồi thay tiến trình bằng API server. |
| [`smoke_test.py`](smoke_test.py) | Kiểm thử image với PostgreSQL tạm. |

Build context là gốc repository, Dockerfile ở `deployment/Dockerfile`.

## CI/CD

Workflow [`CI`](../.github/workflows/ci.yml) chạy khi push `main`, khi mở hoặc cập nhật pull request vào `main`, hoặc chạy tay. Có ba job:

| Job | Kiểm tra |
|---|---|
| Backend checks | `go test ./...` và `go vet ./...` theo phiên bản Go trong `backend/go.mod`. |
| Frontend checks | Node.js 22, cài dependency theo lockfile, typecheck và build React. |
| Deployment smoke checks | Build image Render, kiểm tra API và giao diện (Chromium) trên PostgreSQL tạm, cùng trường hợp giới hạn tín chỉ lấy từ database. |

Pull request chỉ chạy kiểm tra. Render theo dõi `main` với `autoDeployTrigger: checksPass`, nên commit chỉ được deploy sau khi các check qua. Luồng này không cần deploy hook hay secret Render trong GitHub.

Service cần liên kết repository qua GitHub integration của Render để nhận trạng thái check. Với service đã tồn tại, cần đồng bộ cấu hình một lần: Branch = `main`, Auto-Deploy = After CI Checks Pass. Nếu quản lý bằng Blueprint, Blueprint phải đọc `render.yaml` từ `main` và bật auto-sync; sửa file trong repository không tự đổi cấu hình của service cũ.

## Cấu hình môi trường

| Biến | Giá trị / nguồn | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | Blueprint tham chiếu connection string nội bộ của PostgreSQL | Kết nối database. |
| `JWT_SECRET` | Render tự sinh (`generateValue`) | Khóa ký JWT, giữ nguyên giữa các lần deploy nếu cấu hình không đổi. |
| `PORT` | Render cấp; image mặc định `10000` | Cổng HTTP. |
| `FRONTEND_DIR` | `/app/frontend` trong image | Thư mục React build do backend phục vụ. |
| `GIN_MODE` | `release` | Chế độ chạy Gin. |
| `JWT_TTL` | `20m` | Thời hạn access token của sinh viên. |
| `SESSION_TTL` | `20m` | Phải bằng `JWT_TTL`; bỏ trống thì theo `JWT_TTL`. |
| `ADMIN_JWT_TTL` | `8h` | Thời hạn access token và phiên của quản trị viên. |
| `LOGIN_COOLDOWN` | `20m` | Thời gian chờ đăng nhập lại sau logout hoặc hết hạn; chỉ áp dụng cho sinh viên. |
| `MAX_CREDITS` | `26` trong Blueprint | Giới hạn tín chỉ khi hiển thị và đăng ký; bỏ trống thì dùng giá trị của từng học kỳ trong database. |
| `REFERENCE_DATE` | Ngày khởi tạo (múi giờ `Asia/Ho_Chi_Minh`) nếu không khai báo | Ngày neo dữ liệu demo, chỉ dùng khi seed database trống. |
| `RANDOM_SEED` | `20261020` nếu không khai báo | Seed sinh dữ liệu demo. |

PostgreSQL chỉ nhận kết nối qua mạng riêng của Render (`ipAllowList: []`). Mô hình cùng origin nên không cần `API_PROXY_TARGET`.

Render đọc biến môi trường từ Dashboard hoặc Blueprint thay cho `.env` local. Đổi cấu hình có hiệu lực sau redeploy và không cần seed lại. TTL mới chỉ áp dụng cho phiên tạo sau đó, phiên đã lưu giữ nguyên thời hạn.

## Vòng đời dữ liệu

Trước khi mở HTTP server, `start.py` kiểm tra migration và dữ liệu trong một transaction có advisory lock:

- Database mới: áp dụng `001_initial.sql`, sinh và nạp fixture từ catalog có sẵn. Không crawl nguồn dữ liệu khi khởi động.
- Database đã có dữ liệu: kiểm tra schema, giữ nguyên ID, đăng ký và mọi thay đổi, bỏ qua seed. Riêng nhãn fixture cũ được chuẩn hóa: mã lớp `INT2204-DEMO04` thành `INT2204-04`, tên học kỳ `Demo - ...` thành `Học kỳ 1 năm học 2026-2027`, tên `Giảng viên giả lập XX` thành tên tiếng Việt. Mã lớp, tên học kỳ và tên giảng viên đã tự chỉnh thì giữ nguyên, thời gian đăng ký cũng không đổi.
- Schema không khớp, hoặc thiếu các bảng nghiệp vụ cốt lõi: khởi động thất bại, không tự ghi đè.

Dữ liệu được lưu trong PostgreSQL nên tồn tại qua restart, cold start và redeploy, và dùng chung cho mọi người truy cập demo. Đổi `REFERENCE_DATE` không đặt lại dữ liệu đã nạp; chỉ database trống mới chạy lại bước khởi tạo.

Fixture gồm `student001`–`student100`, `admin1`, `admin2`, cùng mật khẩu `DemoUET@123`. Học kỳ demo đang mở có thời gian đăng ký từ ngày neo −7 đến +30 ngày. Muốn đổi thì phải seed lại hoặc sửa bảng `semesters`; ứng dụng không tự gia hạn khi khởi động lại.

### Dựng lại database và kết thúc phiên demo

Startup không nâng cấp schema và không xóa volume, build lại image cũng không đổi database đang có. Database có schema khác phải được dựng lại. Trên Render, tạo PostgreSQL demo mới và cập nhật `DATABASE_URL` trước khi redeploy để startup khởi tạo schema và fixture mới.

Để kết thúc các phiên đang hoạt động trên database demo:

```sh
docker compose stop backend
docker compose --profile tools run --rm seed expire-sessions --confirm-expire-sessions
```

Lệnh ghi `logged_out_at` cho các phiên còn hoạt động, giữ nguyên `expires_at` và lịch sử; cooldown tính từ mốc logout vừa ghi. Phiên đã logout hoặc đã hết hạn không bị đổi. Trên Render, lệnh tương ứng trong image là `python /app/database/tools/manage.py expire-sessions --confirm-expire-sessions`; gói Free không có shell, nên phải chạy image công cụ từ máy có kết nối tới database. Không chạy lệnh này ở mỗi startup hay redeploy.

## Kiểm thử image

Chạy từ gốc repository, cần Docker và Python:

```sh
docker build -f deployment/Dockerfile -t course-registration-render-test .
python deployment/smoke_test.py
```

Thêm `--browser` để kiểm thử cả giao diện (cần Python Playwright và Chromium):

```sh
python deployment/smoke_test.py --browser
```

Smoke test tạo network và PostgreSQL tạm riêng, chạy xong thì dọn container. Phạm vi kiểm tra:

- Khởi tạo schema, fixture và cổng HTTP tùy biến.
- Frontend, Swagger và API phục vụ trên cùng origin.
- Đăng nhập, đăng ký/hủy học phần và sửa lớp.
- Dữ liệu và phiên đăng nhập còn sau restart; token bị từ chối sau logout.
- Với `--browser`: đăng nhập qua trình duyệt và học kỳ tự điền trong hai form quản trị.
