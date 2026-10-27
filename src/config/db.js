import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDb = async () => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log(`[db] connected to ${mongoose.connection.name}`);

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err.message);
  });

  return mongoose.connection;
};

export const disconnectDb = async () => {
  await mongoose.disconnect();
};
