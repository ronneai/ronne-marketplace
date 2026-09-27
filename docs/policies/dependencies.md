# Dependency policy

> Status: active · Applies to every change · Enforced in CI by [feature 001](../features/001-monorepo-scaffold/SPEC.md) and [005](../features/005-docker/SPEC.md)

Ronne is MIT-licensed, self-hosted and installs code on developers' machines. Everything it depends
on must be **free to use and to redistribute**, on a **current stable (LTS where one exists)**
version, and must not bring in **known vulnerabilities**.

**What it covers:** npm packages (runtime and dev), the Node.js runtime, databases we support,
Docker base images, GitHub Actions, and any tool that CI or the install process runs.

## 1. Licenses

| Status | Licenses | Rule |
|---|---|---|
| ✅ **Allowed** | MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, Unlicense, CC0-1.0, BlueOak-1.0.0, Zlib, Python-2.0 | Use freely. |
| ✅ **Allowed for data only** | CC-BY-4.0 | Only for data packages that ship no code (for example `caniuse-lite`). Credited in `THIRD_PARTY_NOTICES`. |
| ⚠️ **Exception needed** | MPL-2.0, LGPL (any version), EPL-2.0, anything else not listed | Only with a recorded exception (§5): why it's needed, why no permissive option works, and how its terms are met. |
| ❌ **Not allowed** | GPL, AGPL, SSPL, BUSL, Elastic License, Commons Clause, any non-commercial (`-NC`) or no-derivatives (`-ND`) license, `UNLICENSED`, no license, custom or proprietary terms | Never, including as a dev dependency. |

- **Dual licenses** (for example `MIT OR Apache-2.0`) are fine if at least one option is allowed.
- **"Free" means free for everyone.** A tool that needs a paid plan, or an account with a vendor, to
  build, test, run or self-host Ronne isn't allowed. Free services that come with GitHub for public
  repositories (Actions, Dependabot, CodeQL, secret scanning) are fine, as long as nobody needs them to self-host.
- **Operating-system packages in Docker base images** (for example Debian's) follow their
  distribution's licensing. They aren't linked into our code, and their sources are published by
  the distribution. The rules above apply to everything we add on top.
- **The check runs on every install tree, not just direct dependencies.** A permissive package that pulls in a GPL one fails.

## 2. Versions

- **Latest stable.** New dependencies start on the latest stable release. No `alpha`, `beta`, `rc`,
  `canary` or `next` versions on `main`, except through a recorded exception.
- **LTS where there is one:**

  | Component | Target | Minimum supported |
  |---|---|---|
  | Node.js | Newest **Active LTS**: 24 today (development, CI, Docker image) | Oldest LTS still receiving security fixes: 22 until its end of life in April 2027. Then the minimum moves to 24. |
  | Databases | The versions in [feature 004](../features/004-ci-db-matrix/SPEC.md), all still maintained upstream | — |
  | Docker base | `node:<target LTS>-slim` on the current Debian stable | — |
  | pnpm | Latest stable, pinned in `packageManager` | — |

- **When a new Node.js LTS arrives** (every October), the target moves in its own pull request once CI passes on it.
- **Pinning.** `apps/web` and all dev dependencies use exact versions. Packages published to npm
  (`core`, `rmk`, `mcp`) use `^` ranges for their runtime dependencies, so users can dedupe and get
  fixes. The lockfile is always committed, and CI installs with `--frozen-lockfile`.
- **Updates.** Dependabot opens grouped update pull requests weekly. Major versions get their own pull request and a read of the changelog.

## 3. Security

**Before adding a dependency**, the pull request answers these questions in its description:

1. **Need.** Can Node.js, the platform or a dependency we already have do this?
2. **License.** Is it, and its whole install tree, allowed by §1?
3. **Health.** Has it had a release in the last 12 months? Is it maintained by an organisation or more than one person? Is it widely used?
4. **Advisories.** Does it have open advisories on [osv.dev](https://osv.dev) or GitHub?
5. **Install scripts.** Does it run code on install? If so, why, and is it added to the allowlist below?
6. **Weight.** How many packages does it bring in?

**Install-time protections** in `pnpm-workspace.yaml`. Names were checked against the pnpm 12 docs in September 2026.

| Setting | Value | Why |
|---|---|---|
| `minimumReleaseAge` | `4320` (3 days; pnpm's default is 1 day) | Most malicious releases are caught and pulled within days. We don't install a version until it has been public that long. |
| `strictDepBuilds` | `true` (pnpm's default; set explicitly so it can't drift) | Installs fail if a package tries to run a build script nobody has ruled on. |
| `allowBuilds` | Explicit map (`better-sqlite3: true`, …) | The only packages allowed to run install scripts. Each entry is justified in the pull request that adds it. |
| `trustPolicy` | `no-downgrade` | Fails the install if a package's publishing trust drops (for example, it used to be published with provenance and now isn't), which is a common sign of a hijacked account. |
| `trustPolicyExclude` | Exact versions only (`pkg@1.2.3`), each with an exception in §5 | For old releases that fail the trust check for a known, harmless reason. Never a name pattern, and never to get a new release through. |
| `trustPolicyExcludePrune` | `true` | Removes an exclusion automatically once the lockfile no longer uses that version. |
| `blockExoticSubdeps` | `true` | Transitive dependencies can only come from the registry, not from git URLs or tarball links. |
| `ignoredOptionalDependencies` | `[sharp]` | See exception E-1. |

Vulnerability scanners and SBOM tools must understand pnpm's two-document lockfile. A tool that
reads only the first document reports no dependencies and no vulnerabilities without failing, so
each tool is checked against a known-vulnerable fixture when it's added.

**In CI** (every pull request):
- **License check:** fails on anything not allowed by §1 and not listed in §5.
- **`pnpm audit --audit-level high`:** fails on high or critical advisories in the install tree.
- **Container scan (Trivy)** of the Docker image: fails on high or critical vulnerabilities that have a fix available.
- **GitHub Actions** are pinned to full commit SHAs (Dependabot updates them), and each workflow sets the smallest `permissions:` it needs. No `pull_request_target` job checks out pull request code.
- **CodeQL, Dependabot alerts, secret scanning and push protection** are turned on for the repository.

**When a vulnerability is found:**
- Critical or high: fixed, or the dependency replaced or removed, within 7 days.
- Medium or low: fixed in the next weekly update.
- If no fix exists, record an exception (§5) with the reason it doesn't affect Ronne, or the workaround, and an expiry date no later than 90 days out.

**Reporting.** `SECURITY.md` explains how to report a vulnerability privately, through GitHub's
private vulnerability reporting.

**Publishing (from M4).** npm packages are published from CI with provenance, by accounts that use 2FA.
Each release includes a CycloneDX SBOM and an up-to-date `THIRD_PARTY_NOTICES`.

## 4. Enforcement summary

| Rule | Where it's checked |
|---|---|
| Licenses | `pnpm licenses list` + allowlist script, in CI (001) |
| Known vulnerabilities | `pnpm audit` in CI (001); Dependabot alerts; Trivy on the image (005) |
| Fresh-release protection | `minimumReleaseAge` in `pnpm-workspace.yaml` (001) |
| Install scripts | `strictDepBuilds` + `allowBuilds` (001) |
| Trust and sources | `trustPolicy` + `blockExoticSubdeps` (001) |
| Versions current | Dependabot weekly, with a 3-day cooldown (001) |
| Actions pinned | Dependabot for `github-actions` (001) |
| Everything else in §3 | Pull request review, using the checklist |

## 5. Exceptions

Every exception has an ID, a reason and, for vulnerabilities, an expiry date. The license-check
script reads the same list from `license-policy.json` at the repo root.

| ID | Package | Issue | Decision | Review by |
|---|---|---|---|---|
| E-1 | `sharp` (optional dependency of `next`) | Its bundled `@img/sharp-libvips-*` binaries are LGPL-3.0-or-later. | **Not installed.** Excluded with `ignoredOptionalDependencies`. `next.config` sets `images.unoptimized: true`, since the UI doesn't need server-side image optimization. | — |
| E-2 | `caniuse-lite` (dependency of `next`) | CC-BY-4.0 | **Allowed** as a data-only package (§1). Credited in `THIRD_PARTY_NOTICES`. | — |
| E-3 | `undici-types@6.21.0` (pinned `~6.21.0` by `@types/node@22`) | Fails `trustPolicy: no-downgrade`: 6.13.0–6.19.2 were published with provenance, and 6.19.3–7.0.0 (July–November 2024) were published by hand, without it, by the same long-time maintainer. Later releases use trusted publishing again. | **Allowed**, for this exact version only, through `trustPolicyExclude`. Same publisher as the releases before and after it, public for nearly two years, and type definitions only (no runtime code). | When `@types/node` for our minimum Node.js moves off `~6.21.0` (pruned automatically) |
