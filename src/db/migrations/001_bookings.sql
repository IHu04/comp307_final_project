CREATE TABLE IF NOT EXISTS bookings (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_email VARCHAR(255) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description VARCHAR(500) DEFAULT NULL,
  appointment_at DATETIME NOT NULL,
  duration_minutes INT UNSIGNED NOT NULL DEFAULT 30,
  status ENUM('pending', 'confirmed', 'cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_bookings_appointment_at (appointment_at),
  KEY idx_bookings_student_email (student_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
