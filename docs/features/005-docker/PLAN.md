# 005 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [ ] **1. Config file location.** Load config from `RONNE_ENV_FILE` (default `./.env`), with environment variables taking precedence. Make 003's setup write to the same path.
  *Done when:* a test shows the app and setup both honour `RONNE_ENV_FILE`, and that env vars override the file.

- [ ] **2. Health endpoint and setup-required mode.** `GET /api/health`, the setup-required screen, and the `503 setup_required` API response.
  *Done when:* tests cover health with and without a database, and a page render in setup-required mode.

- [ ] **3. Compiled scripts.** Bundle setup, reset-root-password and migrate into plain JS (for example with `tsdown`), with `pnpm run` entries that point at them in production.
  *Done when:* `node dist/setup.js --yes` works from a production build with no dev dependencies installed.

- [ ] **4. Dockerfile.** Multi-stage build: install → build → a slim runtime with the standalone output, the compiled scripts, a non-root user, `/app/data`, `RONNE_ENV_FILE`, `HEALTHCHECK` and the start script.
  *Done when:* `docker build` succeeds locally, and the container shows the setup-required screen.

- [ ] **5. Start script.** Config detection, migrations before start, the writable-volume check, and exit on migration failure.
  *Done when:* manual checks for a fresh volume, a configured volume, and a read-only volume behave as in SPEC.md (recorded in Notes).

- [ ] **6. `compose.yaml`.** The web service, the volume, and the `mysql` and `postgres` profiles.
  *Done when:* acceptance criteria 1, 3 and 4 pass by hand (recorded in Notes).

- [ ] **7. CI image build and scan.** Buildx for both architectures, a run-and-probe step on amd64,
  Trivy with `--severity HIGH,CRITICAL --ignore-unfixed`, and the `docker` ecosystem added to Dependabot.
  *Done when:* a pull request shows the job passing, and an older base image with a known CVE makes the scan fail (recorded in Notes).

- [ ] **8. Docs.** The Docker section of the README, including reverse proxies and `TRUST_PROXY`.
  *Done when:* the README steps work as written.

## Notes
