// teamfinder: students post course teams; others join until max members, then it closes
import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk, sendCreated } from '../utils/apiResponse.js';
import { buildMailtoUri } from '../utils/mailto.js';

function mapPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
  };
}

export function mapListItem(row) {
  return {
    id: row.id,
    courseCode: row.course_code,
    teamName: row.team_name,
    description: row.description,
    maxMembers: row.max_members,
    isOpen: Boolean(row.is_open),
    createdAt: row.created_at,
    memberCount: Number(row.member_count),
    isMember: Boolean(row.is_member),
    creatorId: row.creator_id,
    creator: {
      firstName: row.creator_first_name,
      lastName: row.creator_last_name,
      email: row.creator_email,
    },
  };
}

function mapDetail(tr, members, creatorRow) {
  return {
    id: tr.id,
    courseCode: tr.course_code,
    teamName: tr.team_name,
    description: tr.description,
    maxMembers: tr.max_members,
    isOpen: Boolean(tr.is_open),
    createdAt: tr.created_at,
    creatorId: tr.creator_id,
    creator: mapPublicUser(creatorRow),
    members: members.map((m) => ({
      userId: m.user_id,
      joinedAt: m.joined_at,
      email: m.email,
      firstName: m.first_name,
      lastName: m.last_name,
    })),
  };
}

export const createTeamRequest = asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const courseCode = String(req.body.courseCode || '').trim().slice(0, 20);
  const teamName = String(req.body.teamName || '').trim().slice(0, 100);
  const description =
    req.body.description == null || req.body.description === ''
      ? null
      : String(req.body.description).trim().slice(0, 65535);
  let maxMembers = parseInt(req.body.maxMembers, 10);
  if (Number.isNaN(maxMembers)) {
    maxMembers = 4;
  }

  if (!courseCode) {
    return res.status(422).json({ success: false, message: 'courseCode is required' });
  }
  if (!teamName) {
    return res.status(422).json({ success: false, message: 'teamName is required' });
  }
  if (maxMembers < 1 || maxMembers > 100) {
    return res.status(422).json({
      success: false,
      message: 'maxMembers must be between 1 and 100',
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [ins] = await connection.query(
      `INSERT INTO team_requests
        (creator_id, course_code, team_name, description, max_members, is_open)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [userId, courseCode, teamName, description, maxMembers]
    );
    const teamId = ins.insertId;

    await connection.query(
      `INSERT INTO team_members (team_request_id, user_id) VALUES (?, ?)`,
      [teamId, userId]
    );

    const [rows] = await connection.query(
      `SELECT tr.*, u.email AS creator_email, u.first_name AS creator_first_name,
              u.last_name AS creator_last_name
       FROM team_requests tr
       JOIN users u ON u.id = tr.creator_id
       WHERE tr.id = ?`,
      [teamId]
    );
    const [memberRows] = await connection.query(
      `SELECT tm.user_id, tm.joined_at, u.email, u.first_name, u.last_name
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_request_id = ?
       ORDER BY tm.joined_at ASC`,
      [teamId]
    );

    await connection.commit();

    const tr = rows[0];
    const creatorRow = {
      id: tr.creator_id,
      email: tr.creator_email,
      first_name: tr.creator_first_name,
      last_name: tr.creator_last_name,
    };
    sendCreated(res, {
      teamRequest: mapDetail(tr, memberRows, creatorRow),
    });
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
});

export const listTeamRequests = asyncHandler(async (req, res) => {
  const raw = req.query.courseCode;
  const filter =
    raw != null && String(raw).trim() !== '' ? String(raw).trim().slice(0, 20) : null;

  const userId = req.session.userId;

  let sql = `
    SELECT tr.id, tr.course_code, tr.team_name, tr.description, tr.max_members, tr.is_open,
           tr.created_at, tr.creator_id,
           u.first_name AS creator_first_name, u.last_name AS creator_last_name,
           u.email AS creator_email,
           COUNT(tm.id) AS member_count,
           EXISTS (
             SELECT 1 FROM team_members tm2
             WHERE tm2.team_request_id = tr.id AND tm2.user_id = ?
           ) AS is_member
    FROM team_requests tr
    JOIN users u ON u.id = tr.creator_id
    LEFT JOIN team_members tm ON tm.team_request_id = tr.id
    WHERE tr.is_open = TRUE
  `;
  const params = [userId];
  if (filter != null) {
    sql += ' AND tr.course_code = ?';
    params.push(filter);
  }
  sql += ' GROUP BY tr.id ORDER BY tr.created_at DESC';

  const [rows] = await pool.query(sql, params);
  sendOk(res, { teamRequests: rows.map(mapListItem) });
});

export const getTeamRequest = asyncHandler(async (req, res) => {
  const teamId = req.params.id;

  const [trRows] = await pool.query(
    `SELECT tr.*, u.email AS creator_email, u.first_name AS creator_first_name,
            u.last_name AS creator_last_name
     FROM team_requests tr
     JOIN users u ON u.id = tr.creator_id
     WHERE tr.id = ?`,
    [teamId]
  );
  if (!trRows.length) {
    return res.status(404).json({ success: false, message: 'Team request not found' });
  }
  const tr = trRows[0];
  const creatorRow = {
    id: tr.creator_id,
    email: tr.creator_email,
    first_name: tr.creator_first_name,
    last_name: tr.creator_last_name,
  };

  const [memberRows] = await pool.query(
    `SELECT tm.user_id, tm.joined_at, u.email, u.first_name, u.last_name
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_request_id = ?
     ORDER BY tm.joined_at ASC`,
    [teamId]
  );

  sendOk(res, { teamRequest: mapDetail(tr, memberRows, creatorRow) });
});

export const joinTeamRequest = asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const teamId = req.params.id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [trLock] = await connection.query(
      `SELECT tr.id, tr.creator_id, tr.course_code, tr.team_name, tr.max_members, tr.is_open,
              uc.email AS creator_email
       FROM team_requests tr
       JOIN users uc ON uc.id = tr.creator_id
       WHERE tr.id = ? FOR UPDATE`,
      [teamId]
    );
    if (!trLock.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Team request not found' });
    }
    const tr = trLock[0];

    if (!tr.is_open) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'This team is not accepting members' });
    }

    const [countBefore] = await connection.query(
      'SELECT COUNT(*) AS cnt FROM team_members WHERE team_request_id = ?',
      [teamId]
    );
    const memberCount = Number(countBefore[0].cnt);
    if (memberCount >= tr.max_members) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Team is full' });
    }

    try {
      await connection.query(
        `INSERT INTO team_members (team_request_id, user_id) VALUES (?, ?)`,
        [teamId, userId]
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        await connection.rollback();
        return res.status(409).json({ success: false, message: 'Already a member of this team' });
      }
      throw e;
    }

    const [countAfter] = await connection.query(
      'SELECT COUNT(*) AS cnt FROM team_members WHERE team_request_id = ?',
      [teamId]
    );
    if (Number(countAfter[0].cnt) >= tr.max_members) {
      await connection.query('UPDATE team_requests SET is_open = FALSE WHERE id = ?', [teamId]);
    }

    await connection.commit();

    const joiner = await pool.query(
      'SELECT first_name, last_name, email FROM users WHERE id = ?',
      [userId]
    );
    const j = joiner[0][0];
    const joinerLabel = j
      ? `${j.first_name} ${j.last_name} (${j.email})`
      : `User #${userId}`;

    const mailto = buildMailtoUri(
      tr.creator_email,
      `TeamFinder: new member — ${tr.team_name}`,
      `${joinerLabel} joined your team "${tr.team_name}" for ${tr.course_code}.`
    );

    sendOk(res, { mailto }, 200, 'Joined team');
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
});

export const leaveTeamRequest = asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const teamId = req.params.id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [trRows] = await connection.query(
      `SELECT tr.id, tr.creator_id, tr.course_code, tr.team_name, tr.max_members,
              uc.email AS creator_email
       FROM team_requests tr
       JOIN users uc ON uc.id = tr.creator_id
       WHERE tr.id = ? FOR UPDATE`,
      [teamId]
    );
    if (!trRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Team request not found' });
    }
    const tr = trRows[0];

    if (tr.creator_id === userId) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: 'Team creator cannot leave their own team. Delete the team request instead.',
      });
    }

    const [del] = await connection.query(
      'DELETE FROM team_members WHERE team_request_id = ? AND user_id = ?',
      [teamId, userId]
    );
    if (del.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'You are not a member of this team' });
    }

    const [countRows] = await connection.query(
      'SELECT COUNT(*) AS cnt FROM team_members WHERE team_request_id = ?',
      [teamId]
    );
    if (Number(countRows[0].cnt) < tr.max_members) {
      await connection.query('UPDATE team_requests SET is_open = TRUE WHERE id = ?', [teamId]);
    }

    await connection.commit();

    const [selfRows] = await pool.query(
      'SELECT first_name, last_name, email FROM users WHERE id = ?',
      [userId]
    );
    const s = selfRows[0];
    const selfLabel = s ? `${s.first_name} ${s.last_name} (${s.email})` : `User #${userId}`;

    const mailto = buildMailtoUri(
      tr.creator_email,
      `TeamFinder: member left — ${tr.team_name}`,
      `${selfLabel} left your team "${tr.team_name}" for ${tr.course_code}.`
    );

    sendOk(res, { mailto }, 200, 'Left team');
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
});

export const removeTeamMember = asyncHandler(async (req, res) => {
  const teamId = req.params.id;
  const targetUserId = parseInt(req.params.userId, 10);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [teamRows] = await connection.query(
      'SELECT id, creator_id, max_members FROM team_requests WHERE id = ? FOR UPDATE',
      [teamId]
    );
    if (!teamRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Team request not found' });
    }
    if (teamRows[0].creator_id === targetUserId) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: 'Cannot remove the team creator via this endpoint',
      });
    }

    const [result] = await connection.query(
      'DELETE FROM team_members WHERE team_request_id = ? AND user_id = ?',
      [teamId, targetUserId]
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Member not found on this team' });
    }

    const [countRows] = await connection.query(
      'SELECT COUNT(*) AS cnt FROM team_members WHERE team_request_id = ?',
      [teamId]
    );
    if (Number(countRows[0].cnt) < Number(teamRows[0].max_members)) {
      await connection.query('UPDATE team_requests SET is_open = TRUE WHERE id = ?', [teamId]);
    }

    await connection.commit();
    sendOk(res, { removedUserId: targetUserId }, 200, 'Member removed');
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
});

export const deleteTeamRequest = asyncHandler(async (req, res) => {
  const teamId = req.params.id;
  await pool.query('DELETE FROM team_requests WHERE id = ?', [teamId]);
  sendOk(res, { deleted: true }, 200, 'Team request deleted');
});
