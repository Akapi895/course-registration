# Biểu đồ hệ thống

Thư mục có 5 biểu đồ, mỗi biểu đồ nằm trong một thư mục con với các file sau:

- `README.md`: Mermaid nhúng sẵn, GitHub tự vẽ khi xem.
- `.mmd`: nguồn Mermaid, dễ so sánh khi diff.
- `.puml`: nguồn PlantUML.
- `.dbml`: schema cho [dbdiagram.io](https://dbdiagram.io), chỉ có ở ERD.

## Danh mục biểu đồ

| STT | Loại biểu đồ | Thư mục | Định dạng có sẵn | Mô tả |
|:---:|---|---|---|---|
| 1 | Use Case Diagram | [use-case/](use-case/) | `.mmd`, `.puml`, `README.md` | Các ca sử dụng chính của Sinh viên và Quản trị viên |
| 2 | System Architecture Diagram | [system-architecture/](system-architecture/) | `.mmd`, `.puml`, `README.md` | Frontend, Nginx, Go/Gin ba tầng và PostgreSQL |
| 3 | Entity Relationship Diagram (ERD) | [erd/](erd/) | `.mmd`, `.puml`, `.dbml`, `README.md` | 9 bảng và khóa ngoại |
| 4 | Sequence Diagram (API-level) | [sequence/](sequence/) | `.mmd`, `.puml`, `README.md` | Đăng ký nhiều lớp qua middleware, service và transaction |
| 5 | Deployment Diagram | [deployment/](deployment/) | `.mmd`, `.puml`, `README.md` | Triển khai bằng Docker Compose (local) và Render |
