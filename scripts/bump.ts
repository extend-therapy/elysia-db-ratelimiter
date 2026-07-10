#!/usr/bin/env bun
import { $ } from "bun";

const arg = (process.argv[2] ?? "patch").toLowerCase();
const kind = arg === "micro" ? "patch" : arg;

if (!["major", "minor", "patch"].includes(kind)) {
  console.error(
    `Invalid argument: ${arg}. Use major | minor | patch (alias: micro).`
  );
  process.exit(1);
}

// The tag this creates is what CI publishes from, so it has to point at a
// commit that is on main.
const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();
if (branch !== "main") {
  console.error(
    `Releases are cut from main; currently on ${branch === "HEAD" ? "a detached HEAD" : branch}.`
  );
  process.exit(1);
}

const status = (await $`git status --porcelain`.text())
  .split("\n")
  .filter((line) => line && line.slice(3) !== "package.json");
if (status.length > 0) {
  console.error(
    "Working tree is not clean (besides package.json). Commit or stash first."
  );
  console.error(status.join("\n"));
  process.exit(1);
}

type Semver = [number, number, number];

const parse = (value: string): Semver | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : null;
};

const compare = (a: Semver, b: Semver) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const pkgPath = new URL("../package.json", import.meta.url).pathname;
const pkg = (await Bun.file(pkgPath).json()) as { version: string };

const pkgVersion = parse(pkg.version);
if (!pkgVersion) {
  console.error(`package.json version is not a plain semver: ${pkg.version}`);
  process.exit(1);
}

// The publish workflow refuses to run when the tag and package.json disagree,
// so bump from whichever is higher. Tags have drifted ahead of package.json
// before (a tag pushed without a version bump), and bumping from package.json
// alone would then re-create a tag that already exists.
await $`git fetch --tags --force`.quiet().nothrow();
const tagVersions = (await $`git tag --list ${"v*"}`.text())
  .split("\n")
  .map((tag) => parse(tag.trim().slice(1)))
  .filter((version): version is Semver => version !== null);

let base = pkgVersion;
for (const tag of tagVersions) if (compare(tag, base) > 0) base = tag;

if (compare(base, pkgVersion) !== 0) {
  console.warn(
    `package.json (${pkg.version}) is behind tag v${base.join(".")}; bumping from the tag.`
  );
}

const [major, minor, patch] = base;
const next =
  kind === "major"
    ? `${major + 1}.0.0`
    : kind === "minor"
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

const tagExists =
  (await $`git rev-parse -q --verify ${`refs/tags/v${next}`}`.quiet().nothrow())
    .exitCode === 0;
if (tagExists) {
  console.error(`Tag v${next} already exists.`);
  process.exit(1);
}

pkg.version = next;
await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

await $`git add package.json`;
await $`git commit -m ${"chore: bump version to v" + next}`;
await $`git tag ${"v" + next}`;

console.log(`Bumped to ${next}, committed, and tagged v${next}.`);

try {
  await $`git push`;
  await $`git push origin ${"v" + next}`;
  console.log(`Pushed commit and tag v${next} to origin.`);
} catch (e) {
  console.error(
    `Tag v${next} created locally but the push failed. Push manually with:\n` +
      `  git push && git push origin v${next}`
  );
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
