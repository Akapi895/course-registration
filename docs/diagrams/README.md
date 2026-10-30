# Tài liệu Biểu đồ Hệ thống (System Diagrams)

Thư mục này chứa đầy đủ 5 loại biểu đồ thiết kế và kiến trúc của Hệ thống Đăng ký Học phần, được tổ chức theo từng nhóm thư mục chuyên biệt.

Mỗi nhóm biểu đồ được cung cấp dưới các định dạng tiêu chuẩn:
- **Markdown (`README.md`)**: Hiển thị đồ họa trực quan tự động ngay trên GitHub qua khối mã Mermaid.
- **Mermaid (`.mmd`)**: Định dạng Diagram-as-Code trực quan, gọn nhẹ, dễ diff trên Git.
- **PlantUML (`.puml`)**: Định dạng UML chuẩn công nghiệp và học thuật.
- **DBML (`.dbml`)**: Định dạng lược đồ CSDL chuyên dụng cho [dbdiagram.io](https://dbdiagram.io) (cho ERD).

---

## Danh mục biểu đồ

| STT | Loại biểu đồ | Thư mục | Định dạng có sẵn | Mô tả |
|:---:|---|---|---|---|
| 1 | **Use Case Diagram** | [use-case/](use-case/) | `.mmd`, `.puml`, `README.md` | Các ca sử dụng chính của Sinh viên và Quản trị viên |
| 2 | **System Architecture Diagram** | [system-architecture/](system-architecture/) | `.mmd`, `.puml`, `README.md` | Kiến trúc phân tầng Frontend, Nginx, Go/Gin 3 tầng và PostgreSQL |
| 3 | **Entity Relationship Diagram (ERD)** | [erd/](erd/) | `.mmd`, `.puml`, `.dbml`, `README.md` | Mô hình dữ liệu quan hệ 9 bảng và khóa ngoại |
| 4 | **Sequence Diagram (API-level)** | [sequence/](sequence/) | `.mmd`, `.puml`, `README.md` | Luồng đăng ký học phần hàng loạt qua Middleware, Service, Transaction |
| 5 | **Deployment Diagram** | [deployment/](deployment/) | `.mmd`, `.puml`, `README.md` | Kiến trúc triển khai Docker Compose (Local) và Cloud (Render) |
