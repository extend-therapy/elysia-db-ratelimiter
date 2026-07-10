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
const pkg = (await Bun.file(pkgPath).json()) as { name: string; version: string };

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

// Bumping past a release that never shipped orphans it: the tag stays, but no
// registry ever serves that version. Confirm the current release landed first.
//
// Only npmjs is checked, and that is sufficient rather than partial: the publish
// workflow pushes to GitHub Packages first and npmjs last, so a version on npmjs
// means both registries have it. GitHub Packages cannot be checked here anyway --
// its npm endpoint 401s without a token, and `bun run up` needs none.
const baseVersion = base.join(".");
const registry = "https://registry.npmjs.org";
const encodedName = pkg.name.replace("/", "%2F");

if (process.env.ALLOW_UNPUBLISHED === "1") {
  console.warn(
    `ALLOW_UNPUBLISHED=1: not checking whether ${pkg.name}@${baseVersion} was published.`
  );
} else {
  let published: boolean;
  try {
    const response = await fetch(`${registry}/${encodedName}/${baseVersion}`, {
      method: "HEAD",
    });
    if (response.status === 200) {
      published = true;
    } else if (response.status === 404) {
      // Distinguish "this version never shipped" from "this package has never
      // shipped anything", which is a legitimate first release.
      const pkgResponse = await fetch(`${registry}/${encodedName}`, {
        method: "HEAD",
      });
      if (pkgResponse.status === 404) {
        console.warn(
          `${pkg.name} has never been published; treating ${baseVersion} as a first release.`
        );
        published = true;
      } else {
        published = false;
      }
    } else {
      throw new Error(`registry returned ${response.status}`);
    }
  } catch (e) {
    console.error(
      `Could not reach ${registry} to confirm ${pkg.name}@${baseVersion} was published.`
    );
    console.error(e instanceof Error ? e.message : String(e));
    console.error("Re-run with ALLOW_UNPUBLISHED=1 to bump without checking.");
    process.exit(1);
  }

  if (!published) {
    console.error(
      `${pkg.name}@${baseVersion} is tagged but was never published; bumping now would orphan it.\n` +
        `Publish it from main, then re-run this:\n` +
        `  gh workflow run publish.yml --ref main\n` +
        `To abandon ${baseVersion} and bump anyway, re-run with ALLOW_UNPUBLISHED=1.`
    );
    process.exit(1);
  }
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
