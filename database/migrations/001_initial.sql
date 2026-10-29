-- Users and semesters
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
  full_name TEXT NOT NULL,
  student_code TEXT UNIQUE,
  faculty TEXT,
  major TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_user_student_code CHECK (
    (role = 'student' AND student_code IS NOT NULL)
    OR (role = 'admin' AND student_code IS NULL)
  )
);

CREATE TABLE semesters (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  registration_opens_at TIMESTAMPTZ NOT NULL,
  registration_closes_at TIMESTAMPTZ NOT NULL,
  max_credits INT NOT NULL CHECK (max_credits > 0),
  CONSTRAINT chk_registration_period
    CHECK (registration_closes_at > registration_opens_at)
);

-- Courses and prerequisites
CREATE TABLE courses (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  credits INT NOT NULL CHECK (credits > 0),
  faculty TEXT NOT NULL,
  major TEXT
);

CREATE TABLE course_prerequisites (
  course_id BIGINT NOT NULL REFERENCES courses (id),
  prerequisite_course_id BIGINT NOT NULL REFERENCES courses (id),
  PRIMARY KEY (course_id, prerequisite_course_id),
  CONSTRAINT chk_different_prerequisite CHECK (course_id <> prerequisite_course_id)
);

-- Classes and schedules
CREATE TABLE course_classes (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses (id),
  semester_id BIGINT NOT NULL REFERENCES semesters (id),
  class_code TEXT NOT NULL,
  lecturer_name TEXT NOT NULL,
  max_capacity INT NOT NULL CHECK (max_capacity > 0),
  enrolled INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  UNIQUE (semester_id, class_code),
  CONSTRAINT chk_class_capacity CHECK (enrolled >= 0 AND enrolled <= max_capacity)
);

CREATE TABLE class_schedules (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES course_classes (id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 2 AND 7),
  start_period SMALLINT NOT NULL CHECK (start_period > 0),
  end_period SMALLINT NOT NULL,
  room TEXT NOT NULL,
  CONSTRAINT chk_schedule_period CHECK (end_period >= start_period)
);

-- Registrations and authentication sessions
CREATE TABLE registrations (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES users (id),
  class_id BIGINT NOT NULL REFERENCES course_classes (id) ON DELETE RESTRICT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_id)
);

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  logged_out_at TIMESTAMPTZ
);

CREATE INDEX ON auth_sessions (user_id, created_at);

-- Course results
CREATE TABLE course_results (
  student_id BIGINT NOT NULL REFERENCES users (id),
  course_id BIGINT NOT NULL REFERENCES courses (id),
  passed BOOLEAN NOT NULL,
  PRIMARY KEY (student_id, course_id)
);

CREATE INDEX ON course_results (course_id);
