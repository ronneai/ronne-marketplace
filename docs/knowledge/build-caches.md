# Build caches that grow without end

Turborepo's local cache, `.turbo/cache` at the repository root, reached **more than 250 GB** on the
owner's machine (2026-10-04). Read this before changing a task's `outputs` in `turbo.json`, or
adding a tool that writes a cache.

## What happened

Turborepo stores each task's `outputs` as a new `<hash>.tar.zst` entry whenever the task's
inputs change, and **never removes an old one**. The build task's outputs were
`.next/**` minus `.next/cache/**`, and `.next/**` also matches **`.next/dev/`**: since Next.js 16,
`next dev` keeps its Turbopack cache and compiled pages there, 3–4 GB after a few days of work.

So every `pnpm build` after a `pnpm dev` session stored a copy of the dev server's cache: one
entry measured **2,252 MB** compressed, of which 3.8 GB (uncompressed) was `.next/dev` and only
about 54 MB was the build. The pre-commit hook runs `pnpm build` on every code commit, so about a
hundred commits were enough to fill 250 GB.

## The rules now

- **A task's `outputs` hold what the task builds, never a cache.** `turbo.json`'s build task excludes
  `.next/cache/**` and `.next/dev/**`. After the fix the same web build's entry is 12.5 MB.
- **Check an entry's size after changing `outputs`:** `ls -lS .turbo/cache/*.tar.zst | head`. An
  entry over ~100 MB means a cache or a stray folder got in. To see what's inside:
  `zstd -dc <entry>.tar.zst | tar tvf - | sort -k3 -n | tail`.
- **Every cache has a limit.** `packages/repo-tools/src/caches.js` lists them, and
  `trim-caches.js` runs before `pnpm build` and `pnpm dev`:
  - over 5 GB, Turborepo's cache loses its oldest entries until it's under 2 GB;
  - over 2 GB, Turbopack's dev cache (`apps/web/.next/dev/cache`) and build cache
    (`apps/web/.next/cache`) are deleted whole.

  A new tool that writes a cache gets an entry there.
- **Deleting any cache is safe.** The next run rebuilds it, once and more slowly.
  `pnpm clean:cache` empties every cache; `pnpm clean` also removes every build output.
