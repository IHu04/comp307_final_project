import env from '../config/env.js';

// No route matched
export function notFound(req, res, next) {
  const e = new Error('Not found: ' + req.originalUrl);
  e.statusCode = 404;
  next(e);
}

// Last middleware: turns thrown errors into JSON responses
export function errorHandler(err, _req, res, _next) {
  const code = err.statusCode || err.status || 500;
  const body = {
    success: false,
    message: err.message || 'Something went wrong',
  };
  if (env.nodeEnv === 'development') {
    body.stack = err.stack;
  }
  res.status(code).json(body);
}
