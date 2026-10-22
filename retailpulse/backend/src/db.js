import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDb() {
  // strictQuery MUST be false: several collections are shared with the Python engine (strict:false) and unknown filter
  // fields (importId, status...) would otherwise be silently dropped, turning deleteMany({tenantId, importId}) into deleteMany({tenantId}).
  mongoose.set('strictQuery', false);
  await mongoose.connect(config.mongoUri, { dbName: config.dbName, serverSelectionTimeoutMS: 8000 });
  return mongoose.connection;
}
export const disconnectDb = () => mongoose.disconnect();
