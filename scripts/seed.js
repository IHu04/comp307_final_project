// dev seed: demo users and sample booking_slots; run after migrate: node scripts/seed.js
// wipes the three seed emails then reinserts; password for all seeded accounts is Seed123!
import 'dotenv/config';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import { DateTime } from 'luxon';
import { pool } from '../src/config/db.js';

const BCRYPT_ROUNDS = 12;
const DEMO_PASSWORD = 'Seed123!';

const SEED_EMAILS = ['prof@mcgill.ca', 'ta@mcgill.ca', 'student@mail.mcgill.ca'];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  const profInvite = randomUUID();

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `DELETE FROM users WHERE email IN (${SEED_EMAILS.map(() => '?').join(',')})`,
      SEED_EMAILS
    );

    const [profRes] = await connection.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_owner, invite_token)
       VALUES (?, ?, 'Pat', 'Professor', TRUE, ?)`,
      ['prof@mcgill.ca', passwordHash, profInvite]
    );
    const profId = profRes.insertId;

    const taInvite = randomUUID();
    const [taRes] = await connection.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_owner, invite_token)
       VALUES (?, ?, 'Terry', 'Assistant', TRUE, ?)`,
      ['ta@mcgill.ca', passwordHash, taInvite]
    );
    const taId = taRes.insertId;

    await connection.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_owner, invite_token)
       VALUES (?, ?, 'Sam', 'Student', FALSE, NULL)`,
      ['student@mail.mcgill.ca', passwordHash]
    );

    const zone = 'America/Montreal';
    const start = DateTime.now().setZone(zone).startOf('day').plus({ days: 3 });

    const draftSpecs = [
      { dayOffset: 0, start: '10:00', end: '10:30' },
      { dayOffset: 1, start: '11:00', end: '11:30' },
      { dayOffset: 2, start: '14:00', end: '14:30' },
      { dayOffset: 3, start: '15:00', end: '15:30' },
      { dayOffset: 4, start: '09:00', end: '09:30' },
    ];
    const activeSpecs = [
      { dayOffset: 7, start: '13:00', end: '13:30' },
      { dayOffset: 8, start: '16:00', end: '16:30' },
    ];

    for (const s of draftSpecs) {
      const d = start.plus({ days: s.dayOffset }).toISODate();
      await connection.query(
        `INSERT INTO booking_slots
          (owner_id, date, start_time, end_time, status, slot_type)
         VALUES (?, ?, ?, ?, 'draft', 'office_hours')`,
        [profId, d, s.start, s.end]
      );
    }
    for (const s of activeSpecs) {
      const d = start.plus({ days: s.dayOffset }).toISODate();
      await connection.query(
        `INSERT INTO booking_slots
          (owner_id, date, start_time, end_time, status, slot_type)
         VALUES (?, ?, ?, ?, 'active', 'office_hours')`,
        [profId, d, s.start, s.end]
      );
    }

    // ta gets two active slots so browse lists are non empty
    const taActiveSpecs = [
      { dayOffset: 5, start: '10:00', end: '10:30' },
      { dayOffset: 6, start: '14:00', end: '14:30' },
    ];
    for (const s of taActiveSpecs) {
      const d = start.plus({ days: s.dayOffset }).toISODate();
      await connection.query(
        `INSERT INTO booking_slots
          (owner_id, date, start_time, end_time, status, slot_type)
         VALUES (?, ?, ?, ?, 'active', 'office_hours')`,
        [taId, d, s.start, s.end]
      );
    }

    // sample team requests so teamfinder pages are not empty
    const [teamRes1] = await connection.query(
      `INSERT INTO team_requests (creator_id, course_code, team_name, description, max_members, is_open)
       VALUES (?, 'COMP 307', 'Web Wizards', 'Looking for 1 more person for the COMP 307 project. We have backend covered, need a frontend person.', 4, TRUE)`,
      [profId]
    );
    await connection.query(
      `INSERT INTO team_members (team_request_id, user_id) VALUES (?, ?)`,
      [teamRes1.insertId, profId]
    );

    const [studentRes] = await connection.query(
      `SELECT id FROM users WHERE email = 'student@mail.mcgill.ca' LIMIT 1`
    );
    const studentId = studentRes[0].id;

    const [teamRes2] = await connection.query(
      `INSERT INTO team_requests (creator_id, course_code, team_name, description, max_members, is_open)
       VALUES (?, 'COMP 250', 'Data Structures Dream Team', 'Need 2 more members for COMP 250 final project. Any experience with trees/graphs is a plus!', 3, TRUE)`,
      [studentId]
    );
    await connection.query(
      `INSERT INTO team_members (team_request_id, user_id) VALUES (?, ?)`,
      [teamRes2.insertId, studentId]
    );

    await connection.commit();
    console.log('Seed complete.');
    console.log(`  Users: ${SEED_EMAILS.join(', ')}`);
    console.log(`  prof invite_token: ${profInvite}`);
    console.log(`  Password (all): ${DEMO_PASSWORD}`);
    console.log(`  booking_slots for prof: 5 draft, 2 active`);
    console.log(`  booking_slots for TA:   2 active`);
    console.log(`  ta invite_token: ${taInvite}`);
    console.log(`  team_requests: 2 seeded`);
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
