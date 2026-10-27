import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';
import mongoose from 'mongoose';
import { config } from './config.js';
import { errorHandler } from './middleware/common.js';
import { requireAuth } from './middleware/auth.js';
import auth from './routes/auth.js';
import catalog from './routes/catalog.js';
import sales from './routes/sales.js';
import inventory from './routes/inventory.js';
import purchasing from './routes/purchasing.js';
import today from './routes/today.js';
import insights from './routes/insights.js';
import imports from './routes/imports.js';
import admin from './routes/admin.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
  }));
  if (config.env !== 'test') app.use(pinoHttp({ logger: pino({ level: 'info' }) }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down', time: new Date().toISOString() }));
  const limiter = rateLimit({ windowMs: 60_000, limit: config.env === 'test' ? 10_000 : 600, standardHeaders: true, legacyHeaders: false });
  const authLimiter = rateLimit({ windowMs: 60_000, limit: config.env === 'test' ? 10_000 : 30, standardHeaders: true, legacyHeaders: false });
  app.use('/api', limiter);
  app.use('/api/auth', authLimiter, auth);
  const guarded = [requireAuth];
  app.use('/api/catalog', guarded, catalog);
  app.use('/api/sales', guarded, sales);
  app.use('/api/inventory', guarded, inventory);
  app.use('/api/purchasing', guarded, purchasing);
  app.use('/api/today', guarded, today);
  app.use('/api/insights', guarded, insights);
  app.use('/api/imports', guarded, imports);
  app.use('/api/admin', guarded, admin);
  app.use((_req, res) => res.status(404).json({ error: 'not_found', message: 'No such endpoint.' }));
  app.use(errorHandler);
  return app;
}
