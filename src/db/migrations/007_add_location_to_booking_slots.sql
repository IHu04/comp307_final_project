-- Author: Isaac Hu
-- Adds optional location field to booking_slots.
-- For prof-created slots, location is set at creation time.
-- For student-requested meetings, location is set when the prof accepts.

ALTER TABLE booking_slots
  ADD COLUMN location VARCHAR(255) NULL DEFAULT NULL;
