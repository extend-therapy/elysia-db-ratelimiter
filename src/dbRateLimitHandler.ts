import type { Context } from "elysia";
import { InternalServerError } from "elysia";
import { getIP } from "elysia-ip";
import type { Logger } from "pino";
import { dbRateLimitDecrypt, dbRateLimitEncrypt } from "./dbRateLimitEncrypt";
import type { DBRLOptions } from "./types";

export const dbRateLimitHandler = (options: DBRLOptions) => {
  return async ({
    cookie,
    log,
    path,
    request,
    set,
    query,
    ..._rest
  }: Context & { log: Logger }) => {
    let currentLimit = options.limit;
    let currentWindow = options.window;
    let currentPattern = options.pattern;
    let shouldLimit = true;

    if (options.routes) {
      const match = options.routes.find((r) =>
        typeof r === "string" ? r === path : r.path === path,
      );
      if (!match) {
        if (options.whitelistMode) {
          shouldLimit = false;
        }
      } else if (typeof match !== "string") {
        currentLimit = match.limit;
        currentWindow = match.window;
        if (match.pattern) currentPattern = match.pattern;
      }
    }

    if (!shouldLimit) {
      return;
    }

    // pathConfigs takes final precedence if present
    if (options.pathConfigs) {
      const pathConfig = options.pathConfigs.find((c) => c.path === path);
      if (pathConfig) {
        currentLimit = pathConfig.limit;
        currentWindow = pathConfig.window;
        if (pathConfig.pattern) currentPattern = pathConfig.pattern;
      }
    }

    let baseId = cookie.rateLimitCookie?.value as string | undefined;
    let baseIdEnc: string | undefined;

    if (!baseId) {
      const ip = getIP(request.headers);
      if (!ip) {
        // In test environment, use a default IP address to avoid log noise
        const isTest = process.env.NODE_ENV === "test" || process.env.isTest === "true";

        if (isTest) {
          baseId = "127.0.0.1";
          log.debug("Using default test IP for rate limiting");
        } else {
          const errorMsg = "Could not get IP address for rate limiting";
          log.error(errorMsg);
          if (options.failOpen === false) {
            throw new InternalServerError(errorMsg);
          }
          // create a random id for their cookie and we'll try to use that if it's there
          baseId = Bun.randomUUIDv7("base64url");
        }
      } else {
        baseId = ip;
      }
    } else {
      try {
        baseId = await dbRateLimitDecrypt(baseId);
      } catch (err) {
        // If decryption fails, we'll try to get IP as a fallback
        const ip = getIP(request.headers);
        log.warn(`Failed to decrypt baseId from cookie from ${baseId} for ${ip}`);
        baseId = ip || baseId; // Fallback to raw cookie value if IP unavailable
      }
    }

    if (cookie.rateLimitCookie && baseId) {
      cookie.rateLimitCookie.value = await dbRateLimitEncrypt(baseId);
    }

    let finalRateLimitId: string;
    switch (currentPattern) {
      case "IP":
        finalRateLimitId = baseId;
        break;
      case "Route":
        finalRateLimitId = path;
        break;
      case "IPRouteNoParams":
        finalRateLimitId = `${baseId}:${path}`;
        break;
      case "IPFullRoute":
      default: {
        const queryStr = new URLSearchParams(query as Record<string, string>).toString();
        finalRateLimitId = `${baseId}:${path}${queryStr ? "?" + queryStr : ""}`;
        break;
      }
    }

    if (!options.rateLimitStore) {
      const errorMsg = "No rate limit store provided";
      log.error(errorMsg);
      if (options.failOpen === false) {
        throw new InternalServerError(errorMsg);
      }
      return;
    }

    let rateLimit;
    try {
      rateLimit = await options.rateLimitStore.get(finalRateLimitId);
    } catch (e) {
      log.error(`Rate limit store get error: ${e}`);
      if (options.failOpen === false) {
        throw new InternalServerError("Rate limit service unavailable");
      }
      return;
    }

    const now = Date.now();
    const count = rateLimit?.count ?? 0;
    const resetTime = rateLimit?.resetTime ?? now + currentWindow;

    if (count >= currentLimit) {
      log.warn(`Rate limit exceeded for ${finalRateLimitId}`);
      set.status = options.status || 429;
      return options.message || "Too many requests";
    }

    try {
      await options.rateLimitStore.set(
        finalRateLimitId,
        {
          count: count + 1,
          resetTime: resetTime,
        },
        Math.ceil((resetTime - now) / 1000),
      );
    } catch (e) {
      log.error(`Rate limit store set error: ${e}`);
      if (options.failOpen === false) {
        throw new InternalServerError("Rate limit service unavailable");
      }
      return;
    }

    return;
  };
};
