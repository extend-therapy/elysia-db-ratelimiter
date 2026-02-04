import type { DBRLOptions } from "./types";

export const defaultOptions: Partial<DBRLOptions> = {
  as: "scoped",
  status: 429,
  message: "Too many requests",
  methods: ["POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
  pattern: "IPFullRoute", // IP + Full Route (includes query params) - if PII or other sensitive data is in the query params, use IPRouteNoParams
  shouldLog: Bun.env.NODE_ENV === "production", // logging is done by pino
  backingDb: "sqlite",
  dbPath: ":memory:", // only use dbPath for sqlite
  limit: 10, // 10 requests per minute
  window: 60 * 1000, // 1 minute
  failOpen: true,
};
