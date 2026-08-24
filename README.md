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

Inject your Redis client directly into the options. Or use a global redis client for all instances of dbRateLimiter.

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
| `as` | `'plugin' \| 'global'` | `'plugin'` | Plugin scope. |
| `routes` | `(string \| PathConfig)[]` | `undefined` | Whitelist of routes to limit. Supports per-route overrides. |
| `failOpen` | `boolean` | `true` | If `true`, allows requests if the database fails. |
| `shouldLog` | `boolean` | `true` (prod) | Whether to log rate limit events via Pino. |
| `status` | `number` | `429` | HTTP status code on limit exceed. |
| `message` | `string` | `'Too many requests'` | Response body on limit exceed. |
| `seed` | `string` | `undefined` | Optional seed for ID generation. |
| `loggerOptions` | `LoggerOptions` | `undefined` | Custom Pino logger configuration. |
| `cookieObfuscation` | `'aes-gcm' \| 'hash' \| 'none'` | `'aes-gcm'` | Cookie value obfuscation strategy. |
| `alwaysCheckCookieValue` | `boolean` | `false` (except `none`) | Verifies cookie matches IP. Transfers count if mismatch. |

## IP Privacy & Cookie Obfuscation

The plugin uses a cookie-based identification system to track rate limits. To protect user privacy, the `rateLimitCookie` value is obfuscated using one of three strategies:

### Obfuscation Strategies

| Strategy | Description | Use Case |
| :--- | :--- | :--- |
| `aes-gcm` (Default) | AES-256-GCM encryption. Reversible and most secure. | Production (recommended) |
| `hash` | SHA-256 hashing. One-way function, cannot retrieve original value. | When you don't need to recover the original IP |
| `none` | No obfuscation. Plaintext storage. | Development/testing only |

### Configuration of Cookie Obfuscation

```typescript
app.use(dbRateLimiter({
    cookieObfuscation: 'hash', // Use hashing instead of encryption
    limit: 100,
    window: 60 * 1000
}));
```

### Cookie Verification (`alwaysCheckCookieValue`)

When enabled, the plugin verifies that the cookie value matches the current IP address. This is especially important for the `none` strategy (where it defaults to `true`) to prevent users from tampering with their cookies since it is easy to know the value and meaning of their cookie.

**Behavior when cookie doesn't match IP (and `alwaysCheckCookieValue` is true):**

1. The rate limit count is transferred from the old cookie to a new one
2. A new cookie is set with the current IP's processed value
3. The user continues with their existing count (not reset to zero)

```typescript
app.use(dbRateLimiter({
    cookieObfuscation: 'none',
    alwaysCheckCookieValue: true, // Defaults to true for 'none' strategy
    limit: 100,
    window: 60 * 1000
}));
```

### Environment Variables

When using `hash` strategy, you should set environment variable to ensure cookies remain valid across server restarts:

- **`DB_RATE_LIMIT_HASH_PADDING`** (for `hash`): Set to any string value used as padding before hashing. If not provided, a random 16-byte to 32-byte padding is generated and cookies will be invalidated on restart.

**Security Note**: If this environment variable is not set, the plugin generates random transient values. This ensures security but means all existing rate limit cookies will be invalidated whenever the server restarts.

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

### Global vs Plugin scope

- **Plugin (Default)**: Limits apply to the group/instance where the plugin is registered.
- **Global**: Limits apply to the entire application regardless of where the plugin is mounted.

## Versions

Two supported lines, mirroring how the Elysia ecosystem itself ships. The 2.0 line is
published as a **prerelease** because the Elysia it targets is itself a beta -- a plain `2.0.1`
would resolve as stable for `@2` and misrepresent that:

| dist-tag | version | Elysia |
|---|---|---|
| `latest` | `0.1.x` | 1.4.x |
| `next` | `2.0.x-beta.N` | 2.0.0-beta.x |

`npm i @extend-therapy/elysia-db-ratelimiter` gets the 1.4-compatible build;
`@next` gets the 2.0 one.

**Breaking on the 2.0 line:** the `as` option value `'scoped'` is now `'plugin'`, following
Elysia 2.0, which dropped the `'scoped'` literal and replaced the `{ as }` object form with a
bare string scope. The `elysia-ip` peer moves to `^2.0.0`.

## License

[MIT](LICENSE) © 2025-2026 Eli Selkin
