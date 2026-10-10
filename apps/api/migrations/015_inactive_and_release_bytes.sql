-- 'inactive' cannot be used in the same transaction that adds it.
-- This file only adds the value and the size column.
ALTER TYPE project_state ADD VALUE IF NOT EXISTS 'inactive';

ALTER TABLE deployments
  ADD COLUMN total_bytes bigint NOT NULL DEFAULT 0;

-- Existing rows stay at 0. The files column stores paths, not sizes,
-- so older releases report no retained bytes until the next ship.
