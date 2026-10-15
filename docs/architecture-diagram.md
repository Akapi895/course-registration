# Sơ đồ kiến trúc

## Tổng quan hệ thống

```mermaid
graph TB
    User([Client<br/>HTTP + JSON]) -->|REST API| MW[Middleware<br/>Logger / Recovery / JWT Auth / Role]
    MW --> API[Go Backend<br/>Controllers]
    API --> SVC[Services<br/>nghiệp vụ đăng ký]
    SVC --> REPO[Repositories<br/>SQL + transaction]
    REPO --> DB[(PostgreSQL)]
    SWAG[Swagger<br/>/swagger] -.-> API
```

## Luồng đăng ký

```mermaid
graph LR
    START((Start)) --> Auth[Xác thực JWT + role]
    Auth --> Tx[Transaction + khóa dòng student]
    Tx --> Window{Trong đợt<br/>đăng ký?}
    Window -->|Không| Reject[Từ chối + lý do]
    Window -->|Có| Check{Trùng lịch?<br/>Đủ tiên quyết?<br/>Đủ tín chỉ?}
    Check -->|Vi phạm| Reject
    Check -->|Hợp lệ| Slot{Còn chỗ?}
    Slot -->|Không| Reject
    Slot -->|Còn| Write[UPDATE enrolled + 1<br/>INSERT registration]
    Write --> Commit[Commit]
    Commit --> OK((200 OK))
```

## Chi tiết thành phần

| Thành phần | Công nghệ | Mục đích |
|-----------|-----------|---------|
| Client | HTTP/JSON | Gọi API, gửi JWT trong header |
| Backend | Go (Gin — đề xuất) | REST API server, phân tầng Controller/Service/Repository |
| Auth | JWT + middleware | Xác thực và phân quyền student/admin tập trung |
| Database | PostgreSQL | Lưu trữ, transaction, row-lock chống vượt sĩ số |
| API Docs | OpenAPI/Swagger | Mô tả endpoint tại `/swagger` |
| Migration | golang-migrate (đề xuất) | Quản lý schema trong `database/migrations/` |
| Deploy | Docker + docker-compose | Chạy app + database bằng một lệnh |
