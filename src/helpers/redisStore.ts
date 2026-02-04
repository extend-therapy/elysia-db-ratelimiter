import { RedisClientType } from '@/db';
import { RateLimitStore, RateLimitStoreValue } from '../types';

export class RedisRateLimitStore implements RateLimitStore<RedisClientType> {
  constructor(public client: RedisClientType) {}

  async get(key: string): Promise<RateLimitStoreValue | undefined | null> {
    const val = await this.client?.get(`rl:${key}`);
    if (!val) return null;
    try {
      return JSON.parse(val) as RateLimitStoreValue;
    } catch (e) {
      return null;
    }
  }

  async set(key: string, value: RateLimitStoreValue, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    await this.client.set(`rl:${key}`, JSON.stringify(value), 'EX', ttlSeconds);
  }

  /**
   * Clears all rate limit data from Redis by deleting keys with rl: prefix
   */
  async reset(): Promise<void> {
    if (!this.client) return;
    const keys = await this.client.keys('rl:*');
    if (keys && keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}
