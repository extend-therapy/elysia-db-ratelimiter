import type { Context } from 'elysia';
import { InternalServerError } from 'elysia';
import { getIP } from 'elysia-ip';
import type { Logger } from 'pino';
import type { DBRLOptions } from './types';

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
      const match = options.routes.find(r =>
        typeof r === 'string' ? r === path : r.path === path
      );
      if (!match) {
        shouldLimit = false;
      } else if (typeof match !== 'string') {
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
      const pathConfig = options.pathConfigs.find(c => c.path === path);
      if (pathConfig) {
        currentLimit = pathConfig.limit;
        currentWindow = pathConfig.window;
        if (pathConfig.pattern) currentPattern = pathConfig.pattern;
      }
    }

    let baseId = cookie.rateLimitCookie?.value;

    if (!baseId) {
      const ip = getIP(request.headers);
      if (!ip) {
        // In test environment, use a default IP address to avoid log noise
        const isTest = process.env.NODE_ENV === 'test' || process.env.isTest === 'true';

        if (isTest) {
          baseId = '127.0.0.1';
          log.debug('Using default test IP for rate limiting');
        } else {
          const errorMsg = 'Could not get IP address for rate limiting';
          log.error(errorMsg);
          return true;
        }
      } else {
        baseId = ip;
      }

      if (cookie.rateLimitCookie && baseId) {
        cookie.rateLimitCookie.value = baseId;
      }
    }

    let finalRateLimitId: string;
    const safeBaseId = baseId as string;
    switch (currentPattern) {
      case 'IP':
        finalRateLimitId = safeBaseId;
        break;
      case 'Route':
        finalRateLimitId = path;
        break;
      case 'IPRouteNoParams':
        finalRateLimitId = `${safeBaseId}:${path}`;
        break;
      case 'IPFullRoute':
      default: {
        const queryStr = new URLSearchParams(query as Record<string, string>).toString();
        finalRateLimitId = `${safeBaseId}:${path}${queryStr ? '?' + queryStr : ''}`;
        break;
      }
    }

    if (!options.rateLimitStore) {
      const errorMsg = 'No rate limit store provided';
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
        throw new InternalServerError('Rate limit service unavailable');
      }
      return;
    }

    const now = Date.now();
    const count = rateLimit?.count ?? 0;
    const resetTime = rateLimit?.resetTime ?? now + currentWindow;

    if (count >= currentLimit) {
      log.warn(`Rate limit exceeded for ${finalRateLimitId}`);
      set.status = options.status || 429;
      return options.message || 'Too many requests';
    }

    try {
      await options.rateLimitStore.set(
        finalRateLimitId,
        {
          count: count + 1,
          resetTime: resetTime
        },
        Math.ceil((resetTime - now) / 1000)
      );
    } catch (e) {
      log.error(`Rate limit store set error: ${e}`);
      if (options.failOpen === false) {
        throw new InternalServerError('Rate limit service unavailable');
      }
      return;
    }

    return;
  };
};
