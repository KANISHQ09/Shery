import IORedis from 'ioredis';
import dotenv from 'dotenv';

// Immediately bootstrap environment to prevent any import order race conditions
dotenv.config();

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is missing. Production systems require REDIS_URL to be set.');
}

export const redisConnection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: false,
  tls: process.env.REDIS_URL.startsWith('rediss://')
    ? { rejectUnauthorized: false }
    : undefined,
});

redisConnection.on('error', (err) => {
  console.error('Redis Connection Error:', err);
});

export const redis = redisConnection;

export default redisConnection;
