import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import env from './config/env.js';
import { sessionMiddleware } from './config/session.js';
import apiRoutes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

// Parsing & shared security headers via CORS (credentials require explicit origin or reflected origin in dev)
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session (after cookie parser so signed cookies are available)
app.use(cookieParser(env.sessionSecret));
app.use(sessionMiddleware());

// Serve static frontend from project root (no index.html — use homepage for GET /)
const publicRoot = path.join(__dirname, '..');
app.use(
  express.static(publicRoot, {
    index: 'homepage.html',
  })
);

// API routes
app.use('/api', apiRoutes);

// 404 + global error handler (must be last)
app.use(notFound);
app.use(errorHandler);

export default app;
