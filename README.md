# @extend-therapy/elysia-db-ratelimiter

A robust, database-backed rate limiting plugin for [Elysia](https://elysiajs.com/). Support for Redis and SQLite, with automatic fallback and highly configurable identification strategies.

## Features

- 🔄 **Multiple Backends**: Native support for Redis and SQLite.
- ⚡ **Auto-fallback**: Can automatically use SQLite if Redis is unavailable.
- 🎯 **Granular Targeting**: Rate limit by IP, Path, Query Params, or any combination.
- 🛠️ **Per-Route Configuration**: Apply different limits to specific routes within a single plugin instance.
- 🛡️ **Fail-Safe**: Configurable `failOpen` behavior to ensure your app stays available if the DB is down. It will log errors but allow requests to proceed.

## Installation

```bash
bun add @extend-therapy/elysia-db-ratelimiter
```

## Quick Start

### Basic Usage (SQLite)

By default, the plugin uses an in-memory SQLite database.

```typescript
import { Elysia } from 'elysia';
import { dbRateLimiter } from '@extend-therapy/elysia-db-ratelimiter';

const app = new Elysia()
    .use(dbRateLimiter({
        limit: 20,
        window: 60 * 1000 // 20 requests per minute
    }))
    .get('/', () => 'Hello Elysia')
    .listen(3000);
```

### Using Redis

Inject your Redis client directly into the options.

```typescript
import { Elysia } from 'elysia';
import { dbRateLimiter } from '@extend-therapy/elysia-db-ratelimiter';

const redis = Bun.redis();

const app = new Elysia()
    .use(dbRateLimiter({
        backingDb: 'redis',
        redisClient: redis,
        limit: 100,
        window: 60 * 1000
    }))
    .listen(3000);
```

## Configuration

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `limit` | `number` | `10` | Max requests allowed per window. |
| `window` | `number` | `60000` | Window duration in milliseconds. |
| `backingDb` | `'redis' \| 'sqlite' \| 'auto'` | `'sqlite'` | Storage backend. `'auto'` prefers Redis if client is provided. |
| `redisClient` | `Bun.RedisClient` | `undefined` | Required if `backingDb` is `'redis'`. |
| `dbPath` | `string` | `':memory:'` | Path for SQLite file (ignored for Redis). |
| `methods` | `DBRLMethod[]` | `['POST', 'PUT', ...]` | HTTP methods to rate limit. **Note: GET is excluded by default.** |
| `pattern` | `DBRLPattern` | `'IPFullRoute'` | Strategy for identifying unique request buckets. |
| `whitelistMode` | `boolean` | `false` | If `true`, only routes in `routes` are limited. If `false`, all routes are limited (even if no `limit`, no `window`, and no `routes` are specified). |
| `as` | `'scoped' \| 'global'` | `'scoped'` | Plugin scope. |
| `routes` | `(string \| PathConfig)[]` | `undefined` | Whitelist of routes to limit. Supports per-route overrides. |
| `failOpen` | `boolean` | `true` | If `true`, allows requests if the database fails. |
| `shouldLog` | `boolean` | `true` (prod) | Whether to log rate limit events via Pino. |
| `status` | `number` | `429` | HTTP status code on limit exceed. |
| `message` | `string` | `'Too many requests'` | Response body on limit exceed. |
| `seed` | `string` | `undefined` | Optional seed for ID generation. |
| `loggerOptions` | `LoggerOptions` | `undefined` | Custom Pino logger configuration. |

## Identification Patterns (`pattern`)

The `pattern` option determines how the plugin tracks uniqueness:

- `IPFullRoute` (Default): Unique per IP + Path + Query Parameters.
- `IPRouteNoParams`: Unique per IP + Path (ignores query strings).
- `IP`: Unique per IP address (applies site-wide to that user).
- `Route`: Unique per Path (applies to all users for that specific route).

## Advanced Usage

### Route Whitelisting & Overrides

By default, all routes are rate-limited using the global settings. You can use the `routes` parameter to provide specific overrides. If you want to **only** rate limit the routes listed in `routes`, set `whitelistMode: true`.

```typescript
app.use(dbRateLimiter({
    limit: 10,
    whitelistMode: true, // Only limit the routes below
    routes: [
        '/public-api',                   // Uses global 10 req/min
        { 
            path: '/sensitive-data', 
            limit: 2, 
            window: 5000, 
            pattern: 'IP' 
        } // Strict limit
    ]
}));
```

### Global vs Scoped

- **Scoped (Default)**: Limits apply to the group/instance where the plugin is registered.
- **Global**: Limits apply to the entire application regardless of where the plugin is mounted.

## License

[MIT](LICENSE) © 2025-2026 Eli Selkin
