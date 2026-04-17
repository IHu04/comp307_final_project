-- User asks an owner for a meeting; owner accepts (new booking_slot + created_slot_id) or declines.

CREATE TABLE IF NOT EXISTS meeting_requests (
  id INT NOT NULL AUTO_INCREMENT,
  requester_id INT NOT NULL,
  owner_id INT NOT NULL,
  message TEXT NULL,
  status ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
  created_slot_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_meeting_requests_owner (owner_id),
  KEY idx_meeting_requests_requester (requester_id),
  KEY idx_meeting_requests_created_slot (created_slot_id),
  CONSTRAINT fk_meeting_requests_requester
    FOREIGN KEY (requester_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_meeting_requests_owner
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_meeting_requests_created_slot
    FOREIGN KEY (created_slot_id) REFERENCES booking_slots (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
