import type { Context } from "elysia";
import { InternalServerError } from "elysia";
import { getIP } from "elysia-ip";
import type { Logger } from "pino";
import { isValidBase64, processCookieValue, verifyCookieValue } from "./dbRateLimitEncrypt";
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
    const cookieObfuscation = options.cookieObfuscation || "hash";
    // Default to true for 'none' strategy, false for others if alwaysCheckCookieValue is not explicitly set
    const alwaysCheckCookieValue = options.alwaysCheckCookieValue ?? cookieObfuscation === "none";
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

    let cookieValue = cookie.rateLimitCookie?.value as string | undefined;
    let oldCookieValue: string | undefined;

    // Helper function to get IP lazily
    const getClientIP = (): string => {
      const ip = getIP(request.headers);
      if (ip) return ip;

      // In test environment, use a default IP address to avoid log noise
      const isTest = Bun.env.NODE_ENV === "test" || Bun.env.isTest === "true";
      if (isTest) {
        log.warn("Using default test IP for rate limiting");
        return "127.0.0.1";
      }

      const errorMsg = "Could not get IP address for rate limiting";
      log.error(errorMsg);
      if (options.failOpen === false) {
        throw new InternalServerError(errorMsg);
      }
      // create a random id for their cookie and we'll try to use that if it's there
      return Bun.randomUUIDv7("base64url").replaceAll("-", "");
    };

    // The rate limit identifier is always the cookie value itself
    // For 'hash': the cookie contains the hash, which IS the identifier
    // For 'none': the cookie contains base64(IP), which IS the identifier
    let rateLimitIdentifier: string;

    if (!cookieValue) {
      // No cookie exists - get IP and create new identifier
      const ip = getClientIP();
      rateLimitIdentifier = await processCookieValue(ip, cookieObfuscation);
    } else {
      // Cookie exists - validate it and use it directly as the identifier
      let isValid = false;

      if (cookieObfuscation === "hash") {
        // For hash, verify by hashing current IP and comparing (if alwaysCheckCookieValue)
        // Otherwise trust the cookie value
        if (alwaysCheckCookieValue) {
          const ip = getClientIP();
          isValid = await verifyCookieValue(cookieValue, ip, cookieObfuscation);
          if (!isValid) {
            oldCookieValue = cookieValue;
            rateLimitIdentifier = await processCookieValue(ip, cookieObfuscation);
          } else {
            rateLimitIdentifier = cookieValue;
          }
        } else {
          isValid = true;
          rateLimitIdentifier = cookieValue;
        }
      } else {
        // For 'none' obfuscation
        // First validate it's valid base64
        isValid = isValidBase64(cookieValue);

        if (isValid) {
          if (alwaysCheckCookieValue) {
            const ip = getClientIP();
            const expectedValue = await processCookieValue(ip, cookieObfuscation);
            if (cookieValue !== expectedValue) {
              oldCookieValue = cookieValue;
              rateLimitIdentifier = expectedValue;
            } else {
              rateLimitIdentifier = cookieValue;
            }
          } else {
            rateLimitIdentifier = cookieValue;
          }
        } else {
          // Invalid base64 - treat as new cookie
          oldCookieValue = cookieValue;
          const ip = getClientIP();
          rateLimitIdentifier = await processCookieValue(ip, cookieObfuscation);
        }
      }
    }

    // Set the new cookie value (which is the rate limit identifier)
    if (cookie.rateLimitCookie) {
      cookie.rateLimitCookie.value = rateLimitIdentifier;
    }

    // If we have an old cookie value, transfer the rate limit to the new identifier
    if (oldCookieValue && options.rateLimitStore) {
      try {
        const queryStr = new URLSearchParams(query as Record<string, string>).toString();

        // Build the old rate limit ID (using old identifier)
        const oldRateLimitId = `${oldCookieValue}:${path}${queryStr ? "?" + queryStr : ""}`;

        const oldRateLimit = await options.rateLimitStore.get(oldRateLimitId);

        if (oldRateLimit) {
          // Build the new rate limit ID
          let newRateLimitId: string;
          switch (currentPattern) {
            case "IP":
              newRateLimitId = rateLimitIdentifier;
              break;
            case "Route":
              newRateLimitId = path;
              break;
            case "IPRouteNoParams":
              newRateLimitId = `${rateLimitIdentifier}:${path}`;
              break;
            case "IPFullRoute":
            default:
              newRateLimitId = `${rateLimitIdentifier}:${path}${queryStr ? "?" + queryStr : ""}`;
          }

          // Transfer the rate limit count and reset time
          const now = Date.now();
          await options.rateLimitStore.set(
            newRateLimitId,
            {
              count: oldRateLimit.count,
              resetTime: oldRateLimit.resetTime,
            },
            Math.ceil((oldRateLimit.resetTime - now) / 1000),
          );
          log.debug(`Transferred rate limit from ${oldCookieValue} to new identifier`);
        }
      } catch (e) {
        log.warn(`Failed to transfer rate limit from old cookie: ${e}`);
      }
    }

    // Build the final rate limit ID using the consistent identifier
    let finalRateLimitId: string;
    switch (currentPattern) {
      case "IP":
        finalRateLimitId = rateLimitIdentifier;
        break;
      case "Route":
        finalRateLimitId = path;
        break;
      case "IPRouteNoParams":
        finalRateLimitId = `${rateLimitIdentifier}:${path}`;
        break;
      case "IPFullRoute":
      default: {
        const queryStr = new URLSearchParams(query as Record<string, string>).toString();
        finalRateLimitId = `${rateLimitIdentifier}:${path}${queryStr ? "?" + queryStr : ""}`;
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
