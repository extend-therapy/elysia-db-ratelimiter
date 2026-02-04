# About the project

- This is a Bun project so ALWAYS use `bun` or `bunx` instead of `node`, `npm`, or `npx`!
- This is an [Elysia](https://elysiajs.com/) [plugin](https://elysiajs.com/essential/plugin.html).
- All Elysia methods (like `derive` or `macro` or `use`) should be chained and not separated into a declaration or assignment and then applied to the variable.
  For example:

  Do **NOT** do this:

  ```ts
  const elysiaplugin = new Elysia();
  elysiaplugin.use(someplugin);
  elysiaplugin.resolve((ctx) => {
    return { something: "abc" };
  });
  ```

  **DO THIS** instead:

  ```ts
  const elysiaplugin = new Elysia().use(someplugin).resolve((ctx) => {
    return { somethiong: "abc" };
  });
  ```

## Commands

- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```
