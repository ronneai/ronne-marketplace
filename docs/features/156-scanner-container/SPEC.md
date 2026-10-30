# 156 — The security scanner as a ready-to-run container

> Milestone: M20 · Depends on: 135, 136, 137, 005, 081 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Security scan"), [135 SPEC](../135-skill-scanner/SPEC.md) Out and open questions · Contracts: none changed

## Goal

Setting up NVIDIA's SkillSpector takes many manual steps today:
1. clone it at the pin and build its image;
2. install the `skillspector-sandbox` wrapper, which needs rootless Docker or Podman and `loginctl enable-linger` for a service user;
3. add `RONNE_SKILL_SCANNER` lines to `.env`.

A Docker install of Ronne can't use it at all: its container would need a Docker socket, and that's root on the host (135, Out).

The owner wants the scanner as easy to start as the databases: a compose service, ready to use, with as few manual steps as possible and no `.env` editing (owner, 2026-10-29).

So the scanner becomes its own small **service container**. Ronne reaches it through the proxy, on private compose networks the scanner never shares with Ronne, so no socket, command or path is involved. Ronne needs only the service's address, and `compose.yaml` supplies it. Everything else is in the database already (136, 137): on or off, the types, the analysis, the provider, model, endpoint and key, the timeout and the threshold.

A Docker install then gets the scanner by answering one question in the installer, and root turns it on in Admin › Settings. A host install (`.deb`, `.rpm`, the bundle) can run the same container instead of the wrapper.

## Scope

**In:**
- **The scan service.** `scripts/skill-scanner/scan-service.py`, a small HTTP server written with Python's standard library only, so the image gains no packages. It runs inside the scanner image.
  - `GET /health` answers `{scanner: "skillspector", version}`.
  - `POST /scan` takes a JSON body:
    - `files`: each file's path, its content in base64, and whether it's executable;
    - `semantic`;
    - for a semantic scan only, the provider's variables (the key among them).

    It writes the files to a fresh 0700 folder under `/tmp`, runs `skillspector scan <folder> [--no-llm] --format json`, and answers with the exit code and the report.
  - It does what `command-scanner.ts` does for a command:
    - the same short environment allowlist, with the provider's variables only for a semantic scan;
    - `SKILLSPECTOR_MAX_WORKFLOW_SECONDS` from the timeout Ronne sends;
    - a 4 MiB cap on the output, and the process group killed on a timeout;
    - the folder deleted whatever happens;
    - the same path rules.
  - One scan at a time: a second one is refused as busy (503). The body has a size cap (Ronne's own file limits, plus encoding). Nothing from a request is logged: no file, no key, no report.
- **The scanner image.** `scripts/skill-scanner/Dockerfile` keeps its pins: uv 0.13.0 and Python 3.12 by digest, and SkillSpector at commit `abd82935…` (v2.13.2). It changes in three ways:
  - It fetches SkillSpector itself at the pinned commit (BuildKit's `ADD` from git), so the build context is our folder alone.
  - It runs as a non-root user.
  - Its entrypoint is the service.

  The `skillspector` command is still there. `skillspector-sandbox` passes `--entrypoint skillspector`, so the wrapper keeps working with the new image.
- **Compose.** `compose.yaml` gains two services, each behind its own profile:
  - **`scanner`** (profile `scanner`): static scans. Its only network is `scan`, which is `internal: true` and shared with the proxy alone. So it has no outbound network: it reaches only the proxy, never `web`, the databases or `scanner-semantic`.
  - **`scanner-semantic`** (profile `scanner-semantic`): semantic scans. It's on `scan-semantic` (internal, shared with the proxy alone) and on `scan-egress`, a network of its own that reaches the internet, so it can call the provider. It never shares a network with `web` or the databases. It can reach the proxy's public ports as any client on the internet can.

  Both are built on the server from the repository at the install's version (a git build context ending in `:scripts/skill-scanner`), and tagged locally with the repository ref (`ronne-skillspector:v0.4.0`, or `main`), so an upgrade builds the new scanner. `RONNE_SCANNER_REF` names the ref and `RONNE_SCANNER_REPO` the repository (GitHub unless mirrored); the installer sets the ref to the version. Each has:
  - `read_only`, a `tmpfs` at `/tmp`, `cap_drop: [ALL]` and `no-new-privileges`;
  - limits on memory, CPU and processes;
  - a healthcheck on `/health`;
  - no published ports.

  **Ronne reaches the scanners through the proxy** (owner, 2026-10-29: a scanner must never reach Ronne past the proxy). `web` stays on the default network alone. The proxy, Caddy, also joins `scan` and `scan-semantic`, and listens on two internal ports that compose never publishes:
  - `:8081` proxies to `scanner:8080`;
  - `:8082` proxies to `scanner-semantic:8080`.

  Caddy listens on these ports on every network it joins, so they serve only requests that carry the **scan key**. The installer generates the key (`RONNE_SCAN_KEY`: 32 random bytes in hex, so it can't contain Caddy's `*` wildcard) with the profiles, and gives it to `web` and the proxy. Ronne sends it as a header, and Caddy strips it before forwarding, so a scanner never sees it. The ports fail closed:
  - **with no key set**, every request gets a 403 saying the scanner isn't set up, and the proxy still starts, so an install without the scanner is unaffected;
  - **with the wrong key**, for example a proxy not recreated after a rerun wrote a new one, the request gets a 403 saying so. Ronne shows it as "The proxy refused Ronne's scan key", not as unreachable. Without the key, the static scanner can't use the semantic one to reach the internet, and neither can call the other.

  So a scanner can reach Ronne only through Caddy's public route, which sets the forwarded address from the real connection, and a scanner can't fake its address. `web`'s `TRUST_PROXY` stays as it is. This holds while `RONNE_TRUSTED_PROXIES` names the real front proxy. Set to every private range, it would trust the scanners' addresses too, so the runbook says so. The scanner ports don't copy the public site's 28 MiB upload cap: the files are sent in base64, which is larger.

  `web` passes on `RONNE_SKILL_SCANNER_URL` and `RONNE_SKILL_SCANNER_SEMANTIC_URL` from `.env`, empty when they aren't set. The installer writes them with the profiles (`http://proxy:8081`, `http://proxy:8082`), so an install without the scanner has no address and never shows it as unreachable.
- **For a host install.** `scripts/skill-scanner/scanner.compose.yaml` runs the same service on `127.0.0.1:7670`, outside the ports the installer picks for Ronne (7650–7661), and `RONNE_SKILL_SCANNER_URL=http://127.0.0.1:7670` points Ronne at it. That's one line in the settings file, in place of the wrapper's setup.
- **Ronne's side.**
  - `httpSkillScanner`, a second `SkillScanner` next to `commandSkillScanner`, with the same contract and the same errors. It adds two of its own: **unreachable** (no answer, or the proxy's 502 or 504) and **busy** (it's scanning something else: the service's 503 with the JSON body `{"error": "busy"}`, told apart from any other 503 by that body). A busy scan goes back to the queue, counted against the scan's attempts (`MAX_SCAN_ATTEMPTS`, which today only gives a stuck scan its one more try), and the job's run stops there, so the scan waits for the next run, a minute later. Once its attempts are used up, it fails as busy. The proxy's 403 for the scan key is **scan key refused**, and the service refusing the request itself (too large, malformed, its own fault) is **refused**; the service's other errors keep their names (timeout, output too large, bad file path, …). Every error but busy fails the scan, as today. It reads the report with `parseSkillScan`, as now.
  - **Which scanner a scan uses:**
    - With a service address set, scans go to it, whatever command is set: the address is the newer way, and compose sets it.
    - A static scan goes to `RONNE_SKILL_SCANNER_URL`. A semantic one goes to `RONNE_SKILL_SCANNER_SEMANTIC_URL`, or fails as not set up when it isn't set.
    - The web-set endpoint is checked again before a semantic scan, as today.
  - **The addresses** come from the environment or the settings file, never from the web: like the command, they're the operator's choice (135, decision 3).
  - **Admin › Settings › Security scan** shows where the scanner is:
    - "The scanner container: ready, SkillSpector 2.13.2", from one `/health` call with a short timeout, the way Test connection works;
    - or "not reachable", with the command that starts it (for compose's proxy only: an address of the operator's own gets no command);
    - or that the proxy refused the scan key, with the command that recreates the proxy;
    - and the same for the semantic service when it's set.

    The command field doesn't show when a service is set.
- **The installer.** `install.sh` asks "Add the security scanner?". It says the image is about 500 MB and built on the first start, which takes a few minutes. On yes:
  - it writes `COMPOSE_PROFILES=scanner` to `.env`, or `scanner,scanner-semantic` when semantic analysis is wanted too, with the matching addresses;
  - it ends by saying that root turns scanning on in Admin › Settings › Security scan.

  `--scanner no|yes|semantic` answers the question without a terminal; with `--yes` alone the answer in `.env` stays. A person's own `COMPOSE_PROFILES` entries and their own `RONNE_SKILL_SCANNER_URL` are kept, `.env` values with quotes or Windows line endings are read as Compose reads them, and the scan key is kept on a rerun when it is 64 hex characters. A copy of the script that isn't a release builds with `--build`, since `main` moves.

  An existing install gets the question by running the install command again, as for an upgrade. It keeps its version and settings, and on yes writes the same lines, so later upgrades rebuild the scanner too.
- **CI.**
  - `scripts/skill-scanner/` joins the `image` suite (`ci-scope.js`).
  - The image job builds the scanner image, runs the service's tests in it, scans a fixture through Ronne's `httpSkillScanner`, and checks that `scanner` can't reach the internet. It also runs a compose probe with the `scanner` profile.
  - Trivy scans the image as advice, since it isn't shipped.
  - Dependabot follows `scripts/skill-scanner/`.
  - The Docker Hub pull counts and the test-run tables are updated.

**Out:**
- **Publishing the scanner image** (owner, 2026-10-29): it's built on the server, so Ronne still doesn't ship SkillSpector or its Python packages. E-11 still allows them, reworded in task 1: Ronne's compose file and installer now build the image on the operator's server, but nothing is distributed by Ronne.
- **A model server (Ollama) in compose.**
- **Setting the addresses, the command or `RONNE_SKILL_SCANNER_HTTP_HOSTS` from the web.** The host list is the guard against the server being made to call internal addresses (136); it stays the operator's.
- **Changing 147.** When 147 lands, it picks the provider for both services, as it says.

## Behaviour

- **A fresh Docker install, with yes to the scanner.**
  1. `docker compose up -d` starts `web` and the proxy, and builds and starts `scanner`.
  2. Setup runs as now.
  3. In Admin › Settings › Security scan, root sees "The scanner container: ready", turns scanning on and picks the types.
  4. The next submission of a scanned type is scanned.

  No `.env` line is typed.
- **The first start.** The scanner's image builds while Ronne is already usable. Until `scanner` is healthy, the tab says it isn't reachable yet, and a scan queued meanwhile fails as unreachable. Root can use Scan again once it's ready, and the 137 gate fails closed meanwhile.
- **Upgrading Ronne.** The new `compose.yaml` builds the scanner at the new version, and the pin moves with Ronne's releases. `docker compose up -d` rebuilds it once.
- **Turning it off.** Removing the profile from `COMPOSE_PROFILES`, or stopping the container, leaves Ronne working. The tab says unreachable, and with scanning on, scans fail and the gate blocks, as for a broken command today.

## Edge cases

- **A command and an address both set:** the address wins, and the tab says so.
- **A semantic scan without the semantic service:** it fails as not set up. Static scans go on.
- **The service is busy:** the scan goes back to the queue and is tried again on the job's next run, up to its attempts. Ronne's replicas share one scan lease, so they normally never scan at the same time. The service is busy when another Ronne instance uses it too, when it's still finishing a scan Ronne gave up on (Ronne's timeout, or a restart), or when a replica lost the 15-minute lease during a long scan and another one took it.
- **A report that doesn't parse, or one over the cap:** the same errors as the command path.
- **Files Ronne would refuse:** the service checks the paths again, with Ronne's rules (`pathProblemOf`, `caseClash`), and refuses the request whole. One difference, on purpose: it also refuses a path with a lone surrogate, which no file can be named after (Node would write it as U+FFFD). Ronne's stored paths are UTF-8, so they never hold one.
- **An address with credentials, a path, a query, or an unknown scheme:** it isn't used, as a bad command isn't: Ronne starts, and nothing is scanned. A command set beside it doesn't run in its place, since the operator chose the service. The tab says which address is invalid. A semantic address that isn't one makes semantic scans fail as not set up, and one set without a static address is used for nothing; the tab says so in both cases.
- **A service that stalls or drips its answer:** Ronne stops waiting at the scan's timeout plus 30 seconds, whatever the answer does, and the scan fails as unreachable. The tab's `/health` call stops after 3 seconds.

## Data

None. No migration. The addresses are read from the environment or the settings file.

## Documentation

- **Security scan** topic (`security-scan`), in en, pt and fr:
  - a new section, **The scanner container** (`container`): with Docker, the installer's question, one command for an existing install, the two services and what each can reach, and the first start's build; for a host install, `scanner.compose.yaml`;
  - **Installing SkillSpector** names the container first and the wrapper as the other way.
- `topics.ts` gains `container`, in the app and on the website.
- **Helpers:** the tab's scanner line gets "How do I add the scanner?" → `security-scan#container`.
- **Runbook** (`docs/runbooks/install.md`): the scanner paragraph says how a Docker install gets it, in place of "Installs without Docker only, for now".
- **Trusted proxies:** `install.md` (the settings table and case 4), the comment in `compose.yaml` and the root `README.md` recommend `RONNE_TRUSTED_PROXIES=private_ranges` behind your own web server. They gain "with the scanner, name your web server's address instead", since every private range covers the scanners too.
- **Knowledge note** (`docs/knowledge/skill-scanner.md`): the service, its limits and how to move the pin.

## Acceptance criteria

- [ ] A fresh `install.sh`, answered yes, scans a skill once root turns scanning on, with no `.env` editing.
- [ ] `scanner` has no outbound network: CI tries a connection to the internet from it, and to `web:3000`, and both fail.
- [ ] A semantic scan finishes through `scanner-semantic` with a provider set in the web.
- [ ] A host install scans through `scanner.compose.yaml` with one line in the settings file.
- [ ] The tab shows the scanner as ready or not reachable, and every failure has a worded error in en, pt and fr.
- [ ] The command and the wrapper work as before when no address is set.
- [ ] The Documentation and the helper above say what the feature does.

## Decisions

1. **The scanner is a service on an internal network, not a child process** (Claude, from the owner's goal). Ronne's container never gets a socket, and the static scanner can't reach the internet.
2. **Built on the server, not published** (owner, 2026-10-29). The image is built from our pinned Dockerfile by compose. Ronne still doesn't ship SkillSpector or its Python packages, so the dependency policy's class for it and E-11 stand. The price is a first start of a few minutes, with network access to GitHub and PyPI.
3. **Two services, one per kind of scan** (owner, 2026-10-29). The static one has no outbound network, only an internal one with the proxy; the semantic one can reach the provider. Ronne sends each scan to the right one.
4. **The installer asks** (owner, 2026-10-29). It isn't always on: it's an extra image and container that many instances never use.
5. **The addresses are the operator's, like the command** (Claude, from 135's decision 3). Compose sets them, so Docker installs type nothing. `RONNE_SKILL_SCANNER_HTTP_HOSTS` stays the operator's too (owner, 2026-10-29).
6. **Through the proxy, never beside Ronne** (owner, 2026-10-29). A scanner runs untrusted content, so it never shares a network with `web`: Ronne reaches it through Caddy's internal ports, and it can reach Ronne only the way any client does, at its real address. The scanner ports need the scan key, so a scanner can't call the other.

## Open questions

- None.
