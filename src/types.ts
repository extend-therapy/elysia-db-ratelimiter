import type { LoggerOptions } from "pino";

/**
 * Defines the scope of the rate limiter plugin.
 * 'global' applies to the entire app, 'scoped' applies to the current route group.
 */
export type DBRLScope = "global" | "scoped";

/**
 * HTTP methods that the rate limiter will monitor.
 */
export type DBRLMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";

/**
 * Strategy for generating the rate limit tracking ID.
 * - 'IPFullRoute': Unique per IP, Path, and Query parameters.
 * - 'IPRouteNoParams': Unique per IP and Path (ignores query).
 * - 'IP': Unique per IP (applies site-wide for that user).
 * - 'Route': Unique per Path (applies to all users for that route).
 */
export type DBRLPattern = "IPFullRoute" | "IPRouteNoParams" | "IP" | "Route";

/**
 * The type of database used for persistence.
 * - 'redis': Use Redis (fails if unavailable)
 * - 'sqlite': Use SQLite (in-memory with :memory: path)
 * - 'auto': Try Redis first, fallback to SQLite (default behavior)
 */
export type DBRLBackingDb = "redis" | "sqlite" | "auto";

/**
 * Data structure stored in the rate limit store.
 */
export type RateLimitStoreValue = {
  /** Number of requests made in the current window */
  count: number;
  /** Timestamp (ms) when the rate limit will reset */
  resetTime: number;
};

/**
 * Interface for implementing custom rate limit storage backends.
 */
export interface RateLimitStore<T = any> {
  /** Retrieves the current count and reset time for a key */
  get(key: string): Promise<RateLimitStoreValue | undefined | null>;
  /** Sets/Updates the count and reset time for a key with a TTL in seconds */
  set(key: string, value: RateLimitStoreValue, ttlSeconds: number): Promise<void>;
  /** Optional reference to the underlying database client */
  client?: T;
  /** Clears all rate limit data from the store */
  reset?(): Promise<void>;
  /** Closes the database connection (if applicable) */
  close?(): Promise<void>;
}

/**
 * Configuration for path-specific rate limit overrides.
 */
export type PathRateLimitConfig = {
  /** The specific route path to apply this config to */
  path: string;
  /** Maximum number of requests allowed for this path */
  limit: number;
  /** The window duration in milliseconds for this path */
  window: number;
  /** Optional override for the ID generation strategy for this specific path */
  pattern?: DBRLPattern;
};

/**
 * Configuration options for the DB-backed rate limiter plugin.
 */
export type DBRLOptions = {
  redisClient?: Bun.RedisClient;
  /** Plugin scope: 'global' or 'scoped' (Default: 'scoped') */
  as: DBRLScope;
  /** HTTP methods to rate limit (Default: all except GET) */
  methods: DBRLMethod[];
  /** The pattern used to identify unique buckets (Default: 'IPFullRoute') */
  pattern: DBRLPattern;
  /** The database type for storage (Default: 'redis') */
  backingDb: DBRLBackingDb;
  /** File path for SQLite database. Use ':memory:' for in-memory storage. */
  dbPath?: string;
  /** Global default limit for number of requests (Default: 10) */
  limit: number;
  /** Global default window duration in milliseconds (Default: 60000) */
  window: number;
  /** Optional seed/salt for ID generation */
  seed?: string;
  /** HTTP status code returned when limit is exceeded (Default: 429) */
  status?: number;
  /** Response message returned when limit is exceeded (Default: 'Too many requests') */
  message?: string;
  /** Whether to log rate limit events via Pino (Default: true in production) */
  shouldLog?: boolean;
  /** Custom store implementation. Defaults to RedisRateLimitStore if Redis is available. */
  rateLimitStore?: RateLimitStore;
  /** Pino logger options */
  loggerOptions?: LoggerOptions;
  /** Optional array of specific path overrides. (Legacy; prefer 'routes') */
  pathConfigs?: PathRateLimitConfig[];
  /**
   * Whitelist of routes to rate limit.
   * Can be simple strings (using global defaults) or PathRateLimitConfig objects for per-route overrides.
   * If undefined, rate limiting applies to all routes according to 'methods'.
   */
  routes?: (string | PathRateLimitConfig)[];
  /**
   * Whether to allow the request if the rate limiter encounters an internal error (Default: true).
   * Set to false for a more strict security posture.
   */
  failOpen?: boolean;
};
