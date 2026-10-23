import path from 'node:path';
import os from 'node:os';

const env = process.env;
export const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT || 4000),
  mongoUri: env.MONGO_URI || 'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true',
  dbName: env.MONGO_DB || (env.NODE_ENV === 'test' ? 'retailpulse_test' : 'retailpulse'),
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpires: env.JWT_EXPIRES || '12h',
  uploadDir: env.UPLOAD_DIR || path.join(os.tmpdir(), 'retailpulse-uploads'),
  maxUploadBytes: Number(env.MAX_UPLOAD_BYTES || 200 * 1024 * 1024),
  maxRowsPerFile: Number(env.MAX_ROWS || 2_000_000),
  corsOrigin: env.CORS_ORIGIN || 'http://localhost:5173',
};
if (config.env === 'production' && (config.jwtSecret === 'dev-only-secret-change-me' || /change-me/i.test(config.jwtSecret) || config.jwtSecret.length < 32)) {
  throw new Error('JWT_SECRET must be a random value of at least 32 characters in production (openssl rand -hex 32)');
}
