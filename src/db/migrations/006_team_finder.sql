-- TeamFinder (optional): browse open team requests by course_code; creator manages members.

CREATE TABLE IF NOT EXISTS team_requests (
  id INT NOT NULL AUTO_INCREMENT,
  creator_id INT NOT NULL,
  course_code VARCHAR(20) NOT NULL,
  team_name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  max_members INT NOT NULL DEFAULT 4,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_team_requests_creator (creator_id),
  KEY idx_team_requests_course_open (course_code, is_open),
  CONSTRAINT fk_team_requests_creator
    FOREIGN KEY (creator_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS team_members (
  id INT NOT NULL AUTO_INCREMENT,
  team_request_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_team_members_team_user (team_request_id, user_id),
  KEY idx_team_members_team (team_request_id),
  KEY idx_team_members_user (user_id),
  CONSTRAINT fk_team_members_team
    FOREIGN KEY (team_request_id) REFERENCES team_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_team_members_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
