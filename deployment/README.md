# Deployment

Cấu hình triển khai bản demo trên Render. Giao diện React và API Go/Gin được đóng gói trong cùng một Docker image, sử dụng Render PostgreSQL để lưu dữ liệu.

## Kiến trúc

```text
Browser ── HTTPS ── Render ── HTTP ── Go/Gin
                                      ├── /              React build
                                      ├── /assets/*      Static assets
                                      ├── /api/*         REST API
                                      ├── /swagger/*     Swagger UI / OpenAPI
                                      └── PostgreSQL    Render private network
```

Render kết thúc kết nối TLS; ứng dụng nghe trên `PORT`. Frontend gọi API cùng origin. Các route giao diện sử dụng hash, ví dụ `/#/login`, nên không cần rewrite đường dẫn API về `index.html`.

Docker Compose local dùng frontend nginx riêng. Cấu hình Render không sử dụng `docker-compose.yml` hoặc `frontend/nginx.conf`.

## Thành phần

| File | Vai trò |
|---|---|
| [`../render.yaml`](../render.yaml) | Blueprint khai báo Web Service và PostgreSQL, cùng vùng Singapore, theo nhánh `main`. |
| [`Dockerfile`](Dockerfile) | Multi-stage build cho React và Go; runtime chạy bằng user không đặc quyền. |
| [`start.py`](start.py) | Khởi tạo database demo trước khi thay tiến trình hiện tại bằng API server. |
| [`smoke_test.py`](smoke_test.py) | Kiểm thử image với PostgreSQL tạm độc lập. |

Blueprint sử dụng build context là gốc repository và Dockerfile tại `deployment/Dockerfile`. Web Service và database được cấu hình gói Free; auto-deploy chờ CI thành công trên `main`. Healthcheck sử dụng `/health`.

## CI/CD

Workflow [`CI`](../.github/workflows/ci.yml) chạy khi push `main`, mở/cập nhật pull request vào `main`, hoặc kích hoạt thủ công. Mỗi run có ba job:

| Job | Kiểm tra |
|---|---|
| Backend checks | Go theo `backend/go.mod`, chạy `go test ./...` và `go vet ./...`. |
| Frontend checks | Node.js 22, cài dependency bằng lockfile, typecheck và build React. |
| Deployment smoke checks | Build image Render, kiểm tra API/giao diện Chromium trên PostgreSQL tạm và giới hạn tín chỉ fallback. |

Render theo dõi `main` với `autoDeployTrigger: checksPass`: commit mới chỉ được tự deploy sau khi các GitHub checks thành công. CI dùng database tạm độc lập; dữ liệu của service Render được giữ theo quy trình startup hiện tại.

Service cần liên kết repository qua GitHub integration của Render để nhận trạng thái checks. Với service đã tồn tại, cấu hình Blueprint/Settings phải được đồng bộ một lần: **Branch = `main`**, **Auto-Deploy = After CI Checks Pass**. Khi quản lý bằng Blueprint, Blueprint cũng phải đọc `render.yaml` từ `main` và bật auto-sync để các thay đổi được áp dụng. Đổi file trong repository chưa đồng bộ không tự thay cấu hình service cũ.

Luồng này sử dụng GitHub Actions cho CI và Render cho CD, không cần deploy-hook hoặc secret Render trong GitHub. Các pull request chỉ chạy kiểm tra; deploy tự động dựa trên commit đã vào `main`.

## Cấu hình môi trường

| Biến | Giá trị / nguồn | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | Blueprint tham chiếu connection string nội bộ của PostgreSQL | Kết nối database. |
| `JWT_SECRET` | Render tự sinh qua `generateValue` | Khóa ký JWT, được giữ giữa các lần deploy nếu không thay đổi cấu hình. |
| `PORT` | Render cấp; image mặc định `10000` | Cổng HTTP của ứng dụng. |
| `FRONTEND_DIR` | `/app/frontend` trong image | Thư mục React build được backend phục vụ. |
| `GIN_MODE` | `release` | Chế độ chạy Gin. |
| `JWT_TTL` | `20m` | Thời hạn access token của sinh viên. |
| `SESSION_TTL` | `20m` | Phải bằng `JWT_TTL`; bỏ trống để theo `JWT_TTL`. |
| `ADMIN_JWT_TTL` | `8h` | Thời hạn access token và phiên của quản trị viên. |
| `LOGIN_COOLDOWN` | `20m` | Thời gian chờ theo tài khoản sau logout hoặc hết hạn, áp dụng cả admin. |
| `MAX_CREDITS` | `26` trong Blueprint | Giới hạn runtime cho hiển thị và đăng ký; bỏ trống để dùng giá trị từng học kỳ trong database. |
| `REFERENCE_DATE` | Ngày khởi tạo theo `Asia/Ho_Chi_Minh` khi không khai báo | Ngày neo dữ liệu demo, chỉ áp dụng lúc seed database trống. |
| `RANDOM_SEED` | `20261020` khi không khai báo | Seed sinh dữ liệu demo. |

PostgreSQL chỉ nhận kết nối qua mạng riêng Render (`ipAllowList: []`). Không cần `API_PROXY_TARGET` cho mô hình cùng origin.

Render dùng biến môi trường trong Dashboard/Blueprint thay cho `.env` local. Thay cấu hình có hiệu lực sau redeploy; không cần seed lại. TTL mới dùng khi tạo phiên mới, không đổi thời hạn phiên đã lưu. Khi sinh viên có phiên hoạt động, login trả `409 ALREADY_LOGGED_IN`; thời gian chờ sau khi phiên kết thúc tính từ `COALESCE(logged_out_at, expires_at) + LOGIN_COOLDOWN` theo cấu hình hiện hành. Quản trị viên không chịu hai giới hạn này.

## Vòng đời dữ liệu

Trước khi mở HTTP server, `start.py` kiểm tra migration và trạng thái dữ liệu trong cùng transaction có advisory lock:

- **Database mới:** áp dụng `001_initial.sql`, sinh và nạp fixture từ catalog có sẵn. Không crawl nguồn dữ liệu khi khởi động.
- **Database đã có dữ liệu:** kiểm tra schema, chuẩn hóa mã lớp fixture cũ dạng `INT2204-DEMO04` thành `INT2204-04`; giữ ID, đăng ký và các thay đổi khác, bỏ qua seed và việc đối chiếu fixture chính xác. Mã lớp ngoài mẫu cũ không bị đổi.
- Tên học kỳ fixture cũ được chuẩn hóa từ `Demo - ...` sang dạng `Học kỳ 1 năm học 2026-2027`; tên tự đặt và thời gian đăng ký được giữ nguyên.
- Tên giảng viên fixture được sinh từ danh sách tên tiếng Việt cố định. Khi cập nhật database cũ, chỉ thay nhãn `Giảng viên giả lập XX`; tên đã chỉnh sửa được giữ nguyên.
- **Schema không khớp hoặc dữ liệu thiếu các bảng nghiệp vụ cốt lõi:** khởi động thất bại, không tự ghi đè.

Thao tác đăng nhập, đăng ký/hủy và quản trị được lưu trong PostgreSQL, tồn tại qua restart, cold start và redeploy của Web Service. Thay `REFERENCE_DATE` không đặt lại dữ liệu đã nạp. Database trống mới sẽ kích hoạt lại quy trình khởi tạo.

Fixture gồm `student001`–`student100`, `admin1`, `admin2`, dùng chung mật khẩu `DemoUET@123`. Học kỳ demo đang mở có khoảng đăng ký từ ngày neo −7 đến +30 ngày. Muốn đổi thời gian đăng ký phải seed lại hoặc sửa bảng `semesters`; ứng dụng không tự gia hạn khi khởi động lại.

Dữ liệu demo được chia sẻ giữa các phiên truy cập.

### Database mock và kết thúc phiên demo

`auth_sessions` chỉ gồm `id`, `user_id`, `created_at`, `expires_at`, `logged_out_at`. `registrations` chỉ gồm `id`, `student_id`, `class_id`, `registered_at`; hủy đăng ký xóa vật lý bản ghi và đăng ký lại tạo ID mới. Admin hủy lớp giữ bản ghi lớp với `status = cancelled`, xóa vật lý các đăng ký của lớp và đặt sĩ số về 0. Database có schema khác phải được dựng lại: startup không nâng cấp schema và không tự xóa volume, build lại image không đổi database đã tồn tại. Trên Render, dùng PostgreSQL demo mới và cập nhật `DATABASE_URL` trước khi redeploy để startup khởi tạo schema/fixture mới.

Khi cần chủ động kết thúc các phiên đang hoạt động trên database demo dùng schema mới:

```sh
docker compose stop backend
docker compose --profile tools run --rm seed expire-sessions --confirm-expire-sessions
```

Lệnh ghi `logged_out_at` một lần cho các phiên còn hoạt động, giữ nguyên `expires_at` và lịch sử. Cooldown bắt đầu từ mốc logout vừa ghi; phiên đã logout hoặc tự hết hạn không bị đổi. Trên Render, lệnh tương ứng trong image là `python /app/database/tools/manage.py expire-sessions --confirm-expire-sessions`; gói Free cần chạy image công cụ từ môi trường có kết nối database. Không chạy lệnh này ở mỗi startup/redeploy.

## Kiểm thử image

Chạy từ gốc repository, với Docker và Python:

```sh
docker build -f deployment/Dockerfile -t course-registration-render-test .
python deployment/smoke_test.py
```

Kiểm thử giao diện bổ sung yêu cầu Python Playwright và Chromium:

```sh
python deployment/smoke_test.py --browser
```

Smoke test tạo network và PostgreSQL tạm riêng, sau đó dọn các container test. Phạm vi kiểm tra gồm:

- Khởi tạo schema/fixture và cổng HTTP tùy biến.
- Phục vụ frontend, Swagger và API trên cùng origin.
- Đăng nhập, đăng ký/hủy học phần và sửa lớp.
- Giữ dữ liệu và phiên đăng nhập sau restart; từ chối token sau logout.
- Đăng nhập qua trình duyệt và tự điền học kỳ trong hai form quản trị với `--browser`.

## Giới hạn môi trường demo

Web Service Free có thể ngủ sau 15 phút không có truy cập và cần thời gian khởi động lại ở lần truy cập tiếp theo. PostgreSQL Free hết hạn sau 30 ngày, không có backup được quản lý và giới hạn một instance Free cho mỗi workspace.

Gói web Free không hỗ trợ shell, one-off job hoặc pre-deploy command. Việc khởi tạo database được thực hiện ở startup để không phụ thuộc các tính năng này. `/health` kiểm tra tiến trình HTTP, không truy vấn database.
