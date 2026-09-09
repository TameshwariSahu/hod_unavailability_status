-- Create the database first: CREATE DATABASE hod_availability_db;
-- Then run this file while connected to hod_availability_db.

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN', 'HOD')),
  hod_id BIGINT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE departments (
  id BIGSERIAL PRIMARY KEY,
  department_name VARCHAR(150) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hod_members (
  id BIGSERIAL PRIMARY KEY,
  sap_id VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  department_id BIGINT NOT NULL REFERENCES departments(id),
  email VARCHAR(150),
  phone VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD CONSTRAINT users_hod_id_fkey FOREIGN KEY (hod_id) REFERENCES hod_members(id);

-- Transaction/history table: one HOD can have many availability status records.
CREATE TABLE hod_availability_status (
  id BIGSERIAL PRIMARY KEY,
  hod_id BIGINT NOT NULL REFERENCES hod_members(id),
  availability_status VARCHAR(20) NOT NULL DEFAULT 'UNAVAILABLE' CHECK (availability_status IN ('AVAILABLE', 'UNAVAILABLE')),
  reason VARCHAR(30) NOT NULL CHECK (reason IN ('MEETING', 'OUT_OF_STATION', 'MEDICAL', 'LEAVE', 'OTHER')),
  from_datetime TIMESTAMPTZ NOT NULL,
  to_datetime TIMESTAMPTZ NOT NULL,
  remarks TEXT,
  alternate_hod_id BIGINT REFERENCES hod_members(id),
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (to_datetime > from_datetime),
  CHECK (alternate_hod_id IS NULL OR alternate_hod_id <> hod_id)
);

CREATE INDEX idx_hod_status_period ON hod_availability_status (from_datetime, to_datetime);
CREATE INDEX idx_hod_status_hod ON hod_availability_status (hod_id);

-- One HOD cannot have overlapping active availability/meeting records.
-- [) means an entry ending at 11:00 and another starting at 11:00 are allowed.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE hod_availability_status
  ADD CONSTRAINT hod_availability_status_no_overlap
  EXCLUDE USING gist (
    hod_id WITH =,
    tstzrange(from_datetime, to_datetime, '[)') WITH &&
  ) WHERE (approval_status <> 'CANCELLED');
