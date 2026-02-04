import { Database } from 'bun:sqlite';
import type { RateLimitStore, RateLimitStoreValue } from '../types';

export class SqliteRateLimitStore implements RateLimitStore<Database> {
  public client: Database;

  constructor(dbPath: string = ':memory:') {
    this.client = new Database(dbPath);
    this.client.run(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER,
        resetTime INTEGER
      )
    `);
  }

  async get(key: string): Promise<RateLimitStoreValue | undefined | null> {
    const row = this.client
      .query('SELECT count, resetTime FROM rate_limits WHERE key = ?')
      .get(key) as RateLimitStoreValue | undefined;

    if (!row) return null;

    if (Date.now() > row.resetTime) {
      this.client.run('DELETE FROM rate_limits WHERE key = ?', [key]);
      return null;
    }

    return row;
  }

  async set(key: string, value: RateLimitStoreValue, _ttlSeconds: number): Promise<void> {
    this.client.run('INSERT OR REPLACE INTO rate_limits (key, count, resetTime) VALUES (?, ?, ?)', [
      key,
      value.count,
      value.resetTime
    ]);
  }

  /**
   * Clears all rate limit data from the store
   */
  async reset(): Promise<void> {
    this.client.run('DELETE FROM rate_limits');
  }

  /**
   * Closes the database connection
   */
  async close(): Promise<void> {
    this.client.close();
  }
}
