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

// json body parsers and cors; credentials need a real origin or dev wildcard behavior
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// session after cookie parser so signed cookies parse first
app.use(cookieParser(env.sessionSecret));
app.use(sessionMiddleware());

// static site from repo root; default file is homepage.html not index.html
const publicRoot = path.join(__dirname, '..');
app.use(
  express.static(publicRoot, {
    index: 'homepage.html',
  })
);

// json api under /api
app.use('/api', apiRoutes);

// unmatched routes then centralized error json
app.use(notFound);
app.use(errorHandler);

export default app;
