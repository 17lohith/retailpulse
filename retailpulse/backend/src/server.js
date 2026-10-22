import { createApp } from './app.js';
import { connectDb } from './db.js';
import { config } from './config.js';
import { ensureIndexes } from './indexes.js';

await connectDb();
await ensureIndexes();
createApp().listen(config.port, () => console.log(`RetailPulse API on :${config.port} (db=${config.dbName})`));
