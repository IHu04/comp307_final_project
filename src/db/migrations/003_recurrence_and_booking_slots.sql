-- Type 3 recurring office hours patterns + bookable slots (draft until owner activates)

CREATE TABLE IF NOT EXISTS recurrence_patterns (
  id INT NOT NULL AUTO_INCREMENT,
  owner_id INT NOT NULL,
  day_of_week TINYINT NOT NULL COMMENT '0=Mon .. 6=Sun',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  start_date DATE NOT NULL,
  num_weeks INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_recurrence_patterns_owner
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_slots (
  id INT NOT NULL AUTO_INCREMENT,
  owner_id INT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status ENUM('draft', 'active', 'booked') NOT NULL DEFAULT 'draft',
  slot_type ENUM('office_hours', 'meeting_request', 'group_meeting') NOT NULL DEFAULT 'office_hours',
  recurrence_id INT NULL DEFAULT NULL,
  group_meeting_id INT NULL DEFAULT NULL,
  booked_by INT NULL DEFAULT NULL,
  booked_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_booking_slots_owner_date_status (owner_id, date, status),
  KEY idx_booking_slots_booked_by (booked_by),
  KEY idx_booking_slots_recurrence (recurrence_id),
  CONSTRAINT fk_booking_slots_owner
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_slots_recurrence
    FOREIGN KEY (recurrence_id) REFERENCES recurrence_patterns (id) ON DELETE SET NULL,
  CONSTRAINT fk_booking_slots_booked_by
    FOREIGN KEY (booked_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
