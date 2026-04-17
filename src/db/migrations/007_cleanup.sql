-- Migration 007: schema cleanup
-- 1. Remove unused 'cancelled' enum value from booking_slots.status
--    (nothing ever writes it; ownerHasOverlappingSlot already excludes it)
-- 2. Fix bookings.id from INT UNSIGNED to plain INT to match every other PK/FK
--    in the schema (consistency; the two tables are never cross-joined via FK)

-- Safety: no rows should have status='cancelled', but coerce any that do to 'draft'
-- before altering the column to prevent a strict-mode error.
UPDATE booking_slots SET status = 'draft' WHERE status = 'cancelled';

ALTER TABLE booking_slots
  MODIFY COLUMN status ENUM('draft', 'active', 'booked') NOT NULL DEFAULT 'draft';

-- Fix bookings PK type (no FK references this table so it is safe to change).
ALTER TABLE bookings
  MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;
