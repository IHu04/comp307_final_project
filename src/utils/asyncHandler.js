// wraps async route handlers so any thrown error goes to the error handler
export function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
