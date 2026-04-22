// lightweight health check: returns 200 when the db pool can run select 1
import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';

// same process as the api, useful for uptime checks
export const health = asyncHandler(async (_req, res) => {
  await pool.query('SELECT 1');
  sendOk(res, { ok: true, database: true }, 200, 'Healthy');
});
