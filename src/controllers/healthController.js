import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';

/** Liveness + DB connectivity (same process as the API; use for monitoring). */
export const health = asyncHandler(async (_req, res) => {
  await pool.query('SELECT 1');
  sendOk(res, { ok: true, database: true }, 200, 'Healthy');
});
