-- Run this once on databases created with an earlier version of schema.sql.
ALTER TABLE hod_availability_status
  DROP COLUMN IF EXISTS approval_status;
