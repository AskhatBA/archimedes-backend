import IORedis from 'ioredis';

import { config } from '@/config';

export const redisConnection = new IORedis({
  host: config.redis.host || 'localhost',
  port: 6379,
  maxRetriesPerRequest: null,
});
