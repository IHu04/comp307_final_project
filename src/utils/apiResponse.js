export function sendOk(res, data, code = 200, message = 'OK') {
  return res.status(code).json({ success: true, message, data });
}

export function sendCreated(res, data, message = 'Created') {
  return sendOk(res, data, 201, message);
}
