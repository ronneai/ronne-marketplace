# Outside the milestones

> [All milestones](README.md) · [Features index](../README.md)

Work on the repository itself rather than the product.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [187](../platform/187-contributor-docs/SPEC.md) | Documentation for new contributors: `CONTRIBUTING.md` for people, with the one commands table (a test keeps it complete); outside pull requests leave tasks unticked and the owner witnesses them; the owner updates the private website; the README for people using Ronne; issue forms, a pull request template and a code of conduct; an index of `docs/knowledge/` | — | done |
| [188](../platform/188-node-26-target/SPEC.md) | Node.js 26 as the target LTS (`.nvmrc`, the Docker image, the bundles, the feed workflow `rmk` writes), the minimum 22.14.0 after #315; each version tested once per risk: the target runs everything, the minimum (`MIN_NODE` exactly) `pnpm test:runtime` (shipped code, no component tests or repo tooling), 24 nothing (the native modules are N-API, and a guard keeps them so); role-named CI jobs and a guard against the target drifting | 001, 005, 034, 082, 084, 112 | done (the Documentation in ronne-web `docs/marketplace-315-188-node`) |
| [195](../platform/195-fork-friendly-ci/SPEC.md) | Forks and private copies: publishing and version-bump jobs run only in `ronneai/ronne-marketplace`, CodeQL skips private copies, a check refuses `pull_request_target`; `CONTRIBUTING.md` explains running Ronne privately and contributing back from a public fork, with a DCO sign-off on outside pull requests; outside contributors' workflows wait for approval | 187 | specified |
| [199](../platform/199-features-by-domain/SPEC.md) | Features by domain: every feature folder under its main domain (`docs/features/<domain>/`, from `domains.json`), one file per milestone in `docs/features/milestones/`, a short index; `pnpm witness:check` and `pnpm docs:check` follow the layout and check every relative link | 187 | done |
