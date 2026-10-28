# Use Case Diagram

Sơ đồ ca sử dụng của Hệ thống Đăng ký Học phần mô tả tương tác giữa 2 tác nhân chính (Sinh viên và Quản trị viên) với các chức năng nghiệp vụ tương ứng 12 endpoint API.

## Trực quan hóa

```mermaid
flowchart LR
    student[Student]
    admin[Administrator]

    subgraph system[Course Registration System]
        login((Log in))
        logout((Log out))
        profile((View profile))
        browse((Browse classes))
        details((View class details))
        register((Register for classes))
        cancel((Cancel registration))
        schedule((View timetable))
        manage((Manage classes))
    end

    student --> login
    student --> logout
    student --> profile
    student --> browse
    student --> details
    student --> register
    student --> cancel
    student --> schedule

    admin --> login
    admin --> logout
    admin --> profile
    admin --> browse
    admin --> details
    admin --> manage

    register -.->|includes authentication and business rules| login
    cancel -.->|includes authentication and ownership check| login
    manage -.->|includes role authorization| login
```

## Định dạng có sẵn

- [Mermaid source](use-case.mmd) (`use-case.mmd`)
- [PlantUML source](use-case.puml) (`use-case.puml`)
