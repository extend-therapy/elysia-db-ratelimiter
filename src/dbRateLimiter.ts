import type { Context } from "elysia";
import Elysia from "elysia";
import type { Logger } from "pino";
import pino from "pino";
import { dbRateLimitHandler } from "./dbRateLimitHandler";
import { defaultOptions } from "./defaults";
import { RedisRateLimitStore } from "./helpers/redisStore";
import { SqliteRateLimitStore } from "./helpers/sqliteStore";
import { setRateLimitStore } from "./storeRegistry";
import type { DBRLOptions } from "./types";

export const dbRateLimiter = function dbRateLimiter(
  options?: Partial<DBRLOptions>,
  ignore?: boolean,
) {
  if (ignore) return;
  const mergedOptions = {
    ...defaultOptions,
    ...options,
  } as DBRLOptions;

  if (!mergedOptions.rateLimitStore) {
    const backingDb = mergedOptions.backingDb || "auto";

    if (backingDb === "sqlite") {
      mergedOptions.rateLimitStore = new SqliteRateLimitStore(mergedOptions.dbPath || ":memory:");
    } else if (backingDb === "redis") {
      const redisClient = mergedOptions.redisClient;
      if (!redisClient) {
        throw new Error('Redis client is required when backingDb is "redis"');
      }
      mergedOptions.rateLimitStore = new RedisRateLimitStore(redisClient);
    } else {
      const redisClient = mergedOptions.redisClient;
      if (redisClient) {
        // try Redis first
        mergedOptions.rateLimitStore = new RedisRateLimitStore(redisClient);
      } else {
        // fallback to sqlite
        mergedOptions.rateLimitStore = new SqliteRateLimitStore(mergedOptions.dbPath || ":memory:");
      }
    }
  }

  // Register store in global registry for test access
  setRateLimitStore(mergedOptions.rateLimitStore);

  const logger = pino(mergedOptions.loggerOptions ?? {});
  const plugin = new Elysia({
    name: "redisRateLimit",
    seed: mergedOptions.seed || undefined,
  }).onBeforeHandle({ as: mergedOptions.as }, (ctx) =>
    dbRateLimitHandler(mergedOptions)({
      ...(ctx as unknown as Context),
      log: (ctx as { log?: Logger }).log ?? logger,
    }),
  );

  return plugin;
};
