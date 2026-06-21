import { ConnectionOptions } from 'bullmq';

const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');

export const redisConnection: ConnectionOptions = {
  host: url.hostname,
  port: Number(url.port || 6379),
  password: url.password || undefined,
};
