# 156 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - Write the spec, the plan and the witness record.
  - Add the 156 row to M20 in `docs/features/README.md`.
  - MVP §15: the Security scan row's "Not yet for Docker installs" says 156 is planned.
  - Close 135's open question about a scanner image.
  - `docs/policies/dependencies.md`: SkillSpector's row says compose can build it on the server, still not shipped.
  - *Done when:* the docs say the same as the spec, and `pnpm witness:check` passes.

- [x] **2. The scan service and its image.** [risky]
  - `scripts/skill-scanner/scan-service.py`, standard library only: `GET /health` and `POST /scan`. It mirrors `command-scanner.ts`: the environment allowlist, the timeout and its process-group kill, the 4 MiB output cap, the path rules and the folder's removal. It also caps the body, runs one scan at a time (busy → 503) and logs nothing from a request.
  - Its tests use `unittest`, with a stand-in `skillspector` script.
  - `scripts/skill-scanner/Dockerfile`: SkillSpector fetched by BuildKit's git `ADD` at the pinned commit, a non-root user, and the service as entrypoint, with `skillspector` kept for the wrapper.
  - `scripts/skill-scanner/skillspector-sandbox` passes `--entrypoint skillspector`, and so do the knowledge note's manual `docker run` lines.
  - *Done when:*
    - the tests pass in the built image;
    - a real static scan of `packages/core/src/skill-scan/fixtures`' bad skill returns a report `parseSkillScan` accepts;
    - a second request while one runs, an oversized body, a timeout and a bad path are each refused;
    - a key sent with a semantic scan appears in no log;
    - `skillspector-sandbox` still scans with `--entrypoint skillspector`.

- [x] **3. Ronne's HTTP scanner.** [risky]
  - `apps/web/src/server/domains/scans/services/http-scanner.ts`: `httpSkillScanner`, with the same contract and errors as the command scanner, plus `unreachable` (no answer, or the proxy's 502 or 504) and `busy` (the service's 503 with the JSON body `{"error": "busy"}`), the scan key in a header, and the proxy's 403 for a wrong key worded as such.
  - `config.ts` reads `RONNE_SKILL_SCANNER_URL` and `RONNE_SKILL_SCANNER_SEMANTIC_URL`, and refuses an address with credentials, a path or another scheme.
  - `skill-scan-setup.ts`: an address wins over a command, and the tab learns where the scanner is.
  - `skill-scan-job.ts` picks the scanner: static to one address, semantic to the other. A busy scan goes back to the queue, counted against `MAX_SCAN_ATTEMPTS`, and the run stops, so it's tried again on the next run.
  - The Security scan tab shows ready or not reachable, from a short `/health` call, in en, pt and fr.
  - *Done when:*
    - the unit tests against a stand-in HTTP server cover ready, unreachable, busy, timeout, the cap, a bad report and the semantic route;
    - the setup's tests cover the precedence;
    - the command path's tests still pass;
    - the tab's messages are in the three languages.

- [x] **4. Compose and the installer.** [risky]
  - `compose.yaml`:
    - the `scanner` and `scanner-semantic` services, each behind its profile, built from the repository at the install's version, and hardened (read-only, tmpfs, no capabilities, limits, a healthcheck, `init: true` so the service isn't PID 1 and orphans are reaped);
    - the internal `scan` and `scan-semantic` networks, each shared with the proxy alone, and `scan-egress` for `scanner-semantic`;
    - the proxy's two internal ports (`:8081`, `:8082`) in its Caddyfile, never published, serving only requests with the scan key (`RONNE_SCAN_KEY`), which Caddy strips before forwarding, with no upload cap; with no key every request gets a worded 403 and the proxy still starts; a wrong key gets its own worded 403;
    - the comment on `RONNE_TRUSTED_PROXIES` says to name the front proxy, not every private range, with the scanner;
    - `web` passes on the two addresses from `.env`, empty by default.
  - `scripts/skill-scanner/scanner.compose.yaml` for host installs.
  - `install.sh` asks the question, on a fresh install and when it's run again to upgrade, and writes `COMPOSE_PROFILES` with the addresses and a new scan key (32 bytes, hex); `test-install.sh` covers both answers and the rerun.
  - *Done when:*
    - the proxy's refusals for the scan key are JSON, `{"error": "scan key"}` for a wrong key and `{"error": "not set up"}` for none, with status 403, which is what Ronne reads as "scan key refused" (a probe against the real proxy shows it for `/scan` and `/health`);
    - `pnpm test:install` passes under dash and bash;
    - `docker compose --profile scanner config` is valid;
    - a local run scans a skill end to end with no `.env` editing;
    - `scanner` can't open a connection outside or to `web`; `scanner-semantic` can't reach `web` or a database; neither can use `proxy:8081` or `proxy:8082` (no scan key, an empty one, a wrong one or a wildcard); with no key set the proxy starts and the ports refuse; Ronne still reaches both through the proxy.

- [ ] **5. CI.**
  - `ci-scope.js`: `scripts/skill-scanner/` in the `image` suite.
  - The image job:
    - builds the scanner;
    - runs the service's tests in it;
    - runs a fixture scan through `httpSkillScanner`;
    - checks `scanner` has no outbound network and can't reach `web`;
    - runs a compose probe with the profile;
    - runs Trivy as advice.
  - `.github/dependabot.yml` follows `scripts/skill-scanner/`.
  - `docs/knowledge/docker-hub-pulls.md` and `docs/knowledge/test-runs.md` get the new pulls and runs.
  - *Done when:* the jobs run on a pull request that changes `scripts/skill-scanner/`, are skipped on one that doesn't, and pass.

- [ ] **6. Documentation.** The spec's Documentation section, in ronne-web and here, including the trusted-proxies lines in `docs/runbooks/install.md` and the root `README.md`.
  - *Done when:* the docs render tests pass, and the new helper's link lands on a real section.
