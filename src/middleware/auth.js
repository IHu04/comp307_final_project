import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Tables where "ownership" means this column equals the logged-in user's id
const RESOURCE_OWNER_COLUMN = {
  booking_slots: 'owner_id',
  recurrence_patterns: 'owner_id',
  group_meetings: 'owner_id',
  meeting_requests: 'owner_id',
  team_requests: 'creator_id',
};

export function isAuthenticated(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  next();
}

export const isOwner = asyncHandler(async (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  const [rows] = await pool.query(
    'SELECT is_owner FROM users WHERE id = ? LIMIT 1',
    [req.session.userId]
  );
  if (!rows.length || !rows[0].is_owner) {
    return res.status(403).json({ success: false, message: 'Owner access required' });
  }
  next();
});

export function isResourceOwner(tableName, idParam) {
  const ownerColumn = RESOURCE_OWNER_COLUMN[tableName];
  if (!ownerColumn) {
    throw new Error(`isResourceOwner: unknown table "${tableName}"`);
  }

  return asyncHandler(async (req, res, next) => {
    if (!req.session?.userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const resourceId = req.params[idParam];
    if (resourceId === undefined || resourceId === '') {
      return res.status(400).json({ success: false, message: 'Missing resource id' });
    }

    const [rows] = await pool.query(
      `SELECT id FROM \`${tableName}\` WHERE id = ? AND \`${ownerColumn}\` = ? LIMIT 1`,
      [resourceId, req.session.userId]
    );
    if (!rows.length) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  });
}
