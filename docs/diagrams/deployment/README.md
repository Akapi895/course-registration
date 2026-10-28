# Deployment Diagram

Sơ đồ triển khai hệ thống mô tả cấu trúc triển khai trên 2 môi trường:
1. **Local Development (Docker Compose)**: gồm frontend container (Nginx + React build), backend container (Go/Gin), PostgreSQL 16 container, tools container (migrate/seed/verify/crawl), và postgres_data volume.
2. **Render Cloud Deployment**: gồm Web Service container (Single Docker image đóng gói cả Frontend build và Go API binary) kết nối qua private network tới Render PostgreSQL 16.

## Trực quan hóa

```mermaid
flowchart TB
    user[User browser]

    subgraph local[Local Docker Compose]
        local_frontend[frontend container\nNginx + React build]
        local_backend[backend container\nGo/Gin API]
        local_db[(db container\nPostgreSQL 16)]
        local_tools[tools profile\nmigrate / seed / verify / crawl]
        volume[(postgres_data volume)]

        local_frontend -->|/api proxy| local_backend
        local_backend --> local_db
        local_tools --> local_db
        local_db --- volume
    end

    subgraph render[Render deployment]
        web[Web service\nDocker image: frontend build + Go API]
        render_db[(Render PostgreSQL 16)]

        web -->|private network| render_db
    end

    user -->|HTTP localhost| local_frontend
    user -->|HTTPS| web

    classDef runtime fill:#e8f1ff,stroke:#2563eb,color:#111827
    classDef data fill:#fff7ed,stroke:#ea580c,color:#111827
    class local_frontend,local_backend,local_tools,web runtime
    class local_db,volume,render_db data
```

## Định dạng có sẵn

- [Mermaid source](deployment.mmd) (`deployment.mmd`)
- [PlantUML source](deployment.puml) (`deployment.puml`)
