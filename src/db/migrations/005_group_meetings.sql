-- Calendar voting: owner proposes options, participants vote, owner finalizes (optionally recurring).

CREATE TABLE IF NOT EXISTS group_meetings (
  id INT NOT NULL AUTO_INCREMENT,
  owner_id INT NOT NULL,
  title VARCHAR(255) NULL,
  status ENUM('voting', 'finalized', 'cancelled') NOT NULL DEFAULT 'voting',
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recur_weeks INT NOT NULL DEFAULT 1,
  finalized_date DATE NULL DEFAULT NULL,
  finalized_start TIME NULL DEFAULT NULL,
  finalized_end TIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_group_meetings_owner (owner_id),
  CONSTRAINT fk_group_meetings_owner
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_meeting_options (
  id INT NOT NULL AUTO_INCREMENT,
  group_meeting_id INT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  vote_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_group_meeting_options_meeting (group_meeting_id),
  CONSTRAINT fk_group_meeting_options_meeting
    FOREIGN KEY (group_meeting_id) REFERENCES group_meetings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_meeting_votes (
  id INT NOT NULL AUTO_INCREMENT,
  option_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_group_meeting_votes_option_user (option_id, user_id),
  KEY idx_group_meeting_votes_user (user_id),
  CONSTRAINT fk_group_meeting_votes_option
    FOREIGN KEY (option_id) REFERENCES group_meeting_options (id) ON DELETE CASCADE,
  CONSTRAINT fk_group_meeting_votes_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_meeting_participants (
  id INT NOT NULL AUTO_INCREMENT,
  group_meeting_id INT NOT NULL,
  user_id INT NOT NULL,
  invited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_group_meeting_participants_meeting_user (group_meeting_id, user_id),
  KEY idx_group_meeting_participants_user (user_id),
  CONSTRAINT fk_group_meeting_participants_meeting
    FOREIGN KEY (group_meeting_id) REFERENCES group_meetings (id) ON DELETE CASCADE,
  CONSTRAINT fk_group_meeting_participants_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE booking_slots
  ADD CONSTRAINT fk_booking_slots_group_meeting
  FOREIGN KEY (group_meeting_id) REFERENCES group_meetings (id) ON DELETE SET NULL;
