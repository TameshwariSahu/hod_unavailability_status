-- Run this once in pgAdmin Query Tool for databases created before this rule was added.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE hod_availability_status
  ADD CONSTRAINT hod_availability_status_no_overlap
  EXCLUDE USING gist (
    hod_id WITH =,
    tstzrange(from_datetime, to_datetime, '[)') WITH &&
  ) WHERE (approval_status <> 'CANCELLED');
