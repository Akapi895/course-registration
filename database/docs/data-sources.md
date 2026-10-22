# Nguồn dữ liệu và pipeline crawl

Chạy các lệnh dưới đây tại thư mục gốc repository. Xem [hướng dẫn demo](demo-guide.md) để dựng database và [tổng quan dữ liệu](overview.md) để hiểu các giới hạn ánh xạ.

## Nguồn và pipeline crawl

- CNTT: [sách CTĐT chuẩn UET, trang 19–23](https://services.uet.vnu.edu.vn/books/CT_DT_CNTT/files/basic-html/page19.html); trang 24 được kiểm tra để xác nhận kết thúc phần khung. Chưa xác minh khóa áp dụng; không coi đây là CTĐT mới nhất.
- ĐTVT: [khung CTĐT điều chỉnh 2023](https://fet.uet.vnu.edu.vn/wp-content/uploads/2024/03/2.-Khung-chuong-trinh-dai-hoc-he-chuan_Cong-nghe-ky-thuat-dien-tu-Vien-thong_2023.pdf), áp dụng từ khóa tuyển sinh 2022, bảng ở trang PDF 7–13. Bản công khai để trống số/ngày quyết định.

`database/sources/` lưu HTML/PDF gốc và manifest URL, thời điểm tải UTC, SHA-256, trạng thái TLS. `database/data/catalog.json` là snapshot đã chấp nhận: danh mục, quan hệ CTĐT–học phần, nhóm kiến thức, bắt buộc/tự chọn/thay thế, tiên quyết và vị trí nguồn từng dòng. Các bản ghi lặp ở nhiều định hướng được giữ trong memberships, chỉ gộp trong courses.

```powershell
# Dùng cache có checksum, tạo candidate và báo cáo, chưa thay catalog đang dùng
docker compose run --rm crawl

# Tải lại; website CNTT có chứng chỉ hết hạn khi khảo sát
docker compose run --rm crawl crawl --refresh --allow-expired-uet-tls

# Rà soát candidate.json, crawl-report.json và corrections.json trước khi chấp nhận
docker compose run --rm crawl promote
docker compose run --rm crawl test
```

Không có fallback tự tắt kiểm tra TLS. Tùy chọn ngoại lệ chỉ áp dụng đúng host `services.uet.vnu.edu.vn`, có cảnh báo và `tls_verified=false` trong manifest. PDF ĐTVT luôn được kiểm tra TLS. Crawler chỉ dùng URL tài liệu đã chọn, timeout kết nối 10s/đọc 60s, retry tối đa 2 và nghỉ 1s giữa các lượt tải. Cache sai checksum bị từ chối.

Báo cáo nêu các dòng không có mã, điều kiện không biểu diễn được, tiên quyết thiếu đích và khác biệt giữa CTĐT. Hiệu chỉnh tên do xuống dòng/ô bị chia nằm trong `corrections.json`, có lý do và vị trí nguồn. Mâu thuẫn tên/tín chỉ chưa giải quyết làm crawl trả exit code khác 0 và chặn promote. `promote` kiểm tra checksum candidate khớp báo cáo; phải đọc issues ngay cả khi không có conflicts.
