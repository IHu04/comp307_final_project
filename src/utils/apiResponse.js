// thin helpers so responses share { success, message, data }

// 200 (or custom code) success response
export function sendOk(res, data, code = 200, message = 'OK') {
  return res.status(code).json({ success: true, message, data });
}

// 201 created, same shape as sendOk
export function sendCreated(res, data, message = 'Created') {
  return sendOk(res, data, 201, message);
}
