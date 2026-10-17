# Objects kept across hot reloads go stale

The server keeps some objects on `globalThis` so `pnpm dev`'s hot reloads reuse them instead of
opening new ones each time: the database pools, the Better Auth instances and the login limiter
(`domains/identity/repositories/auth-instance.ts`). A hot reload re-runs a changed module, but the
object on `globalThis` was made by the old one, and keeps the old code.

It bit once (105, 2026-10-16): task 3 added `check` to `LoginRateLimiter`, and a `pnpm dev` started
before it crashed on `/account/security` with "deps.limiter.check is not a function", while every
test and the production build passed (they start fresh). A Better Auth instance made before the
two-factor plugin was added would likewise have lacked it.

## What to do

- **Check what a kept object was made by** before reusing it: `instanceof` the current class, or
  remember the factory that made it and compare (`dropStale` in `auth-instance.ts` does both).
- **Database pools** are configuration, not code: they don't need it.
- **When a dev server misbehaves right after a change to such a class**, restart `pnpm dev` before
  looking further.
