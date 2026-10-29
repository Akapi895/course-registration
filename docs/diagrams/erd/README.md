# Entity Relationship Diagram (ERD)

Sơ đồ quan hệ thực thể mô tả cấu trúc 9 bảng của cơ sở dữ liệu PostgreSQL cho Hệ thống Đăng ký Học phần: `users`, `semesters`, `courses`, `course_prerequisites`, `course_classes`, `class_schedules`, `registrations`, `auth_sessions`, `course_results`.

## Trực quan hóa

```mermaid
erDiagram
    users ||--o{ auth_sessions : "has"
    users ||--o{ registrations : "registers"
    users ||--o{ course_results : "has"

    courses ||--o{ course_classes : "offers"
    courses ||--o{ course_results : "records"
    courses ||--o{ course_prerequisites : "requires"
    courses ||--o{ course_prerequisites : "is_prerequisite_for"

    semesters ||--o{ course_classes : "contains"

    course_classes ||--o{ class_schedules : "has"
    course_classes ||--o{ registrations : "includes"

    users {
        bigserial id PK
        text username UK
        text password_hash
        text role
        text full_name
        text student_code UK
        text faculty
        text major
        timestamptz created_at
    }

    semesters {
        bigserial id PK
        text name UK
        timestamptz registration_opens_at
        timestamptz registration_closes_at
        int max_credits
    }

    courses {
        bigserial id PK
        text code UK
        text name
        int credits
        text faculty
        text major
    }

    course_prerequisites {
        bigint course_id PK,FK
        bigint prerequisite_course_id PK,FK
    }

    course_classes {
        bigserial id PK
        bigint course_id FK
        bigint semester_id FK
        text class_code
        text lecturer_name
        int max_capacity
        int enrolled
        text status
    }

    class_schedules {
        bigserial id PK
        bigint class_id FK
        smallint day_of_week
        smallint start_period
        smallint end_period
        text room
    }

    registrations {
        bigserial id PK
        bigint student_id FK
        bigint class_id FK
        text status
        timestamptz registered_at
    }

    auth_sessions {
        uuid id PK
        bigint user_id FK
        timestamptz created_at
        timestamptz expires_at
        timestamptz logged_out_at
    }

    course_results {
        bigint student_id PK,FK
        bigint course_id PK,FK
        boolean passed
    }
```

## Định dạng có sẵn

- [Mermaid source](erd.mmd) (`erd.mmd`) - Dùng cho GitHub preview và Markdown docs
- [DBML source](database.dbml) (`database.dbml`) - Dùng cho [dbdiagram.io](https://dbdiagram.io)
- [PlantUML source](erd.puml) (`erd.puml`) - Dùng cho PlantUML tools
