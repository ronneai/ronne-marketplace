# 189 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-21 02:25 EST, by a fresh agent (blind). Commit: 8a591c14 + working-tree diff (docs/MVP/MVP.md, docs/features/README.md, 189 SPEC.md, PLAN.md, new WITNESS.md). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §15's "Web sign-in" row no longer says "no email" | no | confirmed | `git diff docs/MVP/MVP.md` → "points to a root reset until a reset by email is built (194). Outgoing email is planned in 189, for security notices and sign-in codes only", as SPEC Goal and Decision 11 |
| 2 | A new §15 "Email" row covers SMTP and the four web APIs | no | confirmed | "SMTP (nodemailer, with presets) or the web API of Amazon SES, Mailgun, Postmark or Resend (plain `fetch` to fixed hosts, no vendor SDKs)" = SPEC Scope and Decisions 1, 2 |
| 3 | The row says the environment wins, all or nothing | no | confirmed | = SPEC Scope and Decision 3 |
| 4 | TLS always; plain SMTP only where the operator allows it | no | confirmed | "TLS always, certificates always verified", `RONNE_MAIL_HOSTS` and never with credentials, a private address refused unless listed = SPEC Scope, Decision 5 |
| 5 | Sealed credentials and a sealed outbox | no | confirmed | Each part in SPEC (Settings, Outbox, `body_enc`, the job, retries, Decisions 4 and 8, the cap) |
| 6 | Notices can't be turned off, and the other rules | no | confirmed | Decisions 6, 7, 9, 10, 11 and the Out list; the reason column matches Goal and Decision 4 (a wording remark: "keeps codes out of the database and backups" broader than "can't be read … after it's sent") |
| 7 | Nothing is described as built, and the code has no email today | no | confirmed | The Email row starts "Planned (189)", the Web sign-in row "planned in 189", §8's Auth row "(189, planned, …)"; no `nodemailer`, `smtp`, `outbox` or `RONNE_MAIL` in apps/web/src or packages/; no `mail` domain |
| 8 | `docs/features/README.md` lists 189 in M32 | no | confirmed | README.md:527 `### M32 — Open sign-up and email`, the 189 row, status now `in progress`, Depends on matching SPEC.md:3 |
| 9 | The SPEC line on the per-address cap matches the merged 109 limiter | no | confirmed | "counted by 109's limiter in the database", the cap counting outbox rows; `apps/web/src/server/rate-limit/`, `auth-instance.ts:72`; no `LoginRateLimiter` left |
| 10 | `pnpm witness:check` and `pnpm docs:check` pass | no | confirmed | both exit 0 |

**Overall:** met. The wording remark in row 6 was taken: the row now says "out of the database and backups in clear".

## Task 2 — The dependency

Witnessed: 2026-11-21 02:35 EST, by a fresh agent (blind; it read the task's Notes first, as they are the deliverable). Commit: 87056dcf + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MIT-0 is in dependency policy §1 and in `license-policy.json`, in the same change | yes | confirmed | `dependencies.md:17` "MIT, MIT-0, …" with the owner's note; `license-policy.json:5` `"MIT-0"`; one diff |
| 2 | nodemailer is added to apps/web with an exact version | no | confirmed | `apps/web/package.json:68` `"nodemailer": "10.6.0"`; lockfile `specifier: 10.6.0`, integrity matching `npm view nodemailer@10.6.0 dist.integrity` |
| 3 | The version is the newest `minimumReleaseAge` allows; 10.6.1 is held back | yes | confirmed | `minimumReleaseAge: 4320`; 10.6.0 2026-11-15T20:09Z, 10.6.1 2026-11-20T09:28Z, nothing between; `latest` = 10.6.1 |
| 4 | 10.6.1's changes are DKIM signing and the `fetch` helper's cookies | yes | confirmed | `npm diff 10.6.0..10.6.1`: dkim/sign, fetch/cookies, package-info and well-known/services (a new "Sendora" preset the note didn't mention) |
| 5 | `pnpm install --frozen-lockfile` passes | yes | confirmed | exit 0, "Lockfile passes supply-chain policies" |
| 6 | `pnpm licenses:check` passes (351 packages), and needs MIT-0 allowed | yes | confirmed | "✓ 351 packages checked"; with MIT-0 removed in a scratch copy → "✗ 1 of 351 … nodemailer@10.6.0: MIT-0" |
| 7 | MIT-0 and no dependencies | yes | confirmed | `npm view` → MIT-0, no dependencies, peers or optional ones; lockfile snapshot `nodemailer@10.6.0: {}` |
| 8 | `pnpm audit --audit-level high` passes, no advisory for nodemailer | yes | confirmed | exit 0, 3 low and 10 moderate, all elsewhere; nodemailer 0 in the JSON |
| 9 | Health: 342 versions since 2011, latest 2026-11-20, frequent November releases, one maintainer, widely used | yes | confirmed | 342 versions, created 2011-01-21, releases on Nov 7, 10, 10, 15, 20; maintainer andris only; 40,478,920 downloads in the week to 2026-11-19 |
| 10 | Published with npm provenance, which `trustPolicy` checks | yes | confirmed | `dist.attestations` SLSA v1; `trustPolicy: no-downgrade`; the frozen install passed |
| 11 | No install scripts for consumers; `allowBuilds` unchanged | yes | confirmed | No install/preinstall/postinstall (`prepare` isn't run for registry packages); `strictDepBuilds` install passed; `pnpm-workspace.yaml` unchanged |
| 12 | Its own types, so no `@types/nodemailer` | yes | confirmed | `probe.ts` with tsc 7.0.2 resolves the types; the note named `dist/cjs/nodemailer.d.ts`, where TypeScript finds `dist/esm/nodemailer.d.ts` beside the ESM entry |
| 13 | Need, matching SPEC Decision 2 | yes | confirmed | `SPEC.md:285-289`; Node has no SMTP module |
| 14 | The §3 checklist answers are in Notes | yes | confirmed | Items 1-6 and the version note; the single maintainer is named as the Health caveat |

**Overall:** met. The two wording points (the types path, the new well-known service) are fixed in the note.
