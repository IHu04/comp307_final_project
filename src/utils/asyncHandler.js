// Wraps an async route so errors go to errorHandler (no try/catch in every file)
export function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
