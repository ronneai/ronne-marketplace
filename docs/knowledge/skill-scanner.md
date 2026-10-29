# The skill scanner (SkillSpector)

Feature [135](../features/135-skill-scanner/SPEC.md) runs NVIDIA's SkillSpector
([github.com/NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector); NVIDIA's guide:
[Scanning agent skills](https://docs.nvidia.com/skills/scanning-agent-skills)) on each submission
revision and shows what it finds on the review page. Ronne doesn't ship it. The operator installs
it and names its command in `RONNE_SKILL_SCANNER`. This note covers what we checked, the rules that
make running it safe, how to install it, and how to move the pin.

## What we checked (2026-10-28, v2.13.2)

- **Licence:** SkillSpector itself is Apache-2.0. Its `THIRD_PARTY_NOTICES.md` lists only
  Apache-2.0, MIT and BSD-3-Clause, but that file covers what it vendors, not the Python packages
  it installs: its `uv.lock` describes 158, and 63 of them end up installed on Linux. Listed in the built image (`scripts/skill-scanner/licences.py`),
  most are MIT, BSD, ISC or Apache-2.0, and five aren't on §1's allowed list:
  - `certifi` (MPL-2.0), and `orjson` and `tqdm` (MPL-2.0 together with MIT or Apache-2.0);
  - `regex` (Apache-2.0 and CNRI-Python);
  - `typing_extensions` (PSF-2.0).

  They need an exception in `docs/policies/dependencies.md` §5 (E-11). Its `pyproject.toml` mentions
  semgrep (LGPL) only in a comment about click versions, and semgrep isn't in `uv.lock`.
- **What it runs:** it parses the skill's files (Python's `ast`, regular expressions, YARA) and
  doesn't execute them. It starts processes only to `git clone` a URL and for the CLI-based LLM
  providers. Ronne gives it a local folder, never a URL, and passes `SKILLSPECTOR_PROVIDER` only when
  it is one of the six HTTP providers, so neither happens, static or semantic.
- **Network with `--no-llm`:** only OSV.dev, with the dependency names and versions the skill
  declares (not its files). If OSV.dev can't be reached, it uses a list built into the tool.
  LangSmith tracing exists but is off unless `LANGCHAIN_TRACING_V2` is set, and Ronne sets it to `false`.
- **Limits of its own:** 100 MiB per input, 10,000 zip members, 1 MB read per file, and a deadline per
  scan (`SKILLSPECTOR_MAX_WORKFLOW_SECONDS`, 600 by default; Ronne passes its own timeout).
- **Contract:** `scan <dir> --format json` prints a report whose shape and exit codes (0: score ≤ 50,
  1: score > 50, 2: error) its README calls stable. Exit 1 is a finished scan, not a failure.
- **Not used:** its MCP server's HTTP transport, which has no authentication, and `baseline`.

## The rules Ronne follows (don't loosen them)

1. `--no-llm` unless root chose semantic analysis *and* a provider is set up: by the operator in
   `RONNE_SKILL_SCANNER_ENV_*` variables (which win), or by root in Admin › Settings since 136, its
   key sealed in the database (below). The command is never set from the web: root picks one of the
   operator's.
2. Only a local folder that Ronne wrote: a fresh `0700` temporary directory with the revision's files,
   checked like `checkPackage` (no `..`, no absolute paths, no symbolic links). Never a URL or a git remote.
3. An argument array, never a shell. The command is a JSON array from the environment or the
   settings file, never from the web: whoever sets it can run anything as the server's user. Its
   first part must be an absolute path: a relative one would be looked up from the scan's folder,
   beside the submitted files.
4. An environment built from an allowlist, not filtered from `process.env`: `PATH`, `HOME` and
   `TMPDIR` (both a `home/` folder beside the files, in the private temporary directory), `LANG`, `SKILLSPECTOR_MAX_WORKFLOW_SECONDS`, `SKILLSPECTOR_LOG_LEVEL=ERROR`,
   `LANGCHAIN_TRACING_V2=false`, and for a semantic scan `SKILLSPECTOR_PROVIDER`, `SKILLSPECTOR_MODEL`,
   `SKILLSPECTOR_REASONING_EFFORT` and the chosen provider's own variables only (the spec's table),
   read from `RONNE_SKILL_SCANNER_ENV_<NAME>`. Tests prove `DATABASE_URL`, `AUTH_SECRET`, an
   unprefixed `OPENAI_API_KEY`, a prefixed name off the list (`RONNE_SKILL_SCANNER_ENV_ANTHROPIC_BASE_URL`)
   and another provider's variables (`OPENAI_API_KEY` with `SKILLSPECTOR_PROVIDER=anthropic`) never
   reach it, and that a static scan gets none of the provider's variables even with one set up.
5. A timeout, and at most 4 MiB of output read: then SIGTERM to the scanner's process group and
   SIGKILL 5 seconds later. Whatever it leaves running in its group when it exits is killed too, and
   the folder is removed in a `finally` (and, if Ronne itself died, by the next job run). The
   wrapper removes its container on SIGTERM (`rm -f`, which also catches one still being created):
   killing the `docker run` client alone would leave the container running. The sweep skips
   symbolic links and folders another user owns, so a link planted in a shared `/tmp` is never
   followed. Accepted limit: on macOS a scanner could set the immutable flag (`chflags uchg`) on a
   file in its folder, which Ronne doesn't clear, so that folder stays; SkillSpector doesn't, and an
   item can't make it.
6. Its report is untrusted: `parseSkillScan` keeps known fields only, cuts strings and the list of
   findings, and the panel renders text, never HTML. Its stdout and stderr are never stored or
   logged as they are, since they can echo item content.
7. Advisory: nothing waits for a scan or reads its score to decide.

## Installing it

Both ways install the reviewed commit, `abd82935b67f765a9541013c0866c6349251dcdf` (v2.13.2), with
exactly the packages in its `uv.lock` (`uv sync --frozen`). Don't use `uv tool install` or
SkillSpector's own Dockerfile. They resolve the packages again (`pip install .`), so what gets
installed isn't what was reviewed. Check out the commit, not the tag: a tag can be moved.

```sh
git clone https://github.com/NVIDIA/SkillSpector.git /opt/skillspector/src
cd /opt/skillspector/src
git checkout --detach abd82935b67f765a9541013c0866c6349251dcdf
git rev-parse HEAD   # must print the commit above
```

**A. As the user Ronne runs as** (the simplest; the scanner then has the same access to the
machine as Ronne itself, and may reach OSV.dev). The environment allowlist keeps Ronne's secrets
out of the scanner's environment, but not out of its reach: run this way, it could read Ronne's
settings file (and, on Linux, `/proc/<pid>/environ` of Ronne's process). SkillSpector doesn't, and
doesn't run the code it scans; for isolation that doesn't rest on that, use B.

```sh
UV_PROJECT_ENVIRONMENT=/opt/skillspector/venv uv sync --frozen --no-dev --no-editable
export RONNE_SKILL_SCANNER='["/opt/skillspector/venv/bin/skillspector"]'
```

**B. In a container, with no network** (stronger: it gets a read-only copy of the files, no network,
no capabilities and limited memory). Build the image with Ronne's
[`scripts/skill-scanner/Dockerfile`](../../scripts/skill-scanner/Dockerfile): `uv sync --frozen`
on base images pinned by digest, and no `git` in the image. Then install
[`scripts/skill-scanner/skillspector-sandbox`](../../scripts/skill-scanner/skillspector-sandbox)
(owned by root, mode 0755), which mounts the folder Ronne gives it read-only:

```sh
docker build -f /path/to/ronne-marketplace/scripts/skill-scanner/Dockerfile -t skillspector:2.13.2 .
install -m 0755 /path/to/ronne-marketplace/scripts/skill-scanner/skillspector-sandbox /usr/local/bin/
export RONNE_SKILL_SCANNER='["/usr/local/bin/skillspector-sandbox"]'
```

Edit the three settings at the top of the installed wrapper for Ronne's user: `RUNTIME` (`docker`
or `podman`), `RUNTIME_HOME` (that user's home) and `RUNTIME_SOCKET` (rootless Docker's socket, such
as `unix:///run/user/1001/docker.sock`; empty for Podman). Ronne gives the scanner a `HOME` of its
own and none of its environment (rule 4). Without these settings, `docker` would fall back to
`/var/run/docker.sock`, the rootful daemon, and Podman wouldn't find its storage. The container
itself gets `HOME=/tmp`, the `SKILLSPECTOR_*` and `LANGCHAIN_TRACING_V2` variables, and for a semantic
scan the provider's variables (its key among them), which Ronne passes only then.

Ronne's folder is `0700` and owned by Ronne's user, so the container must run as that user on the
host. Never loosen the folder's mode instead.
- **Rootless Docker** maps container root (`0`) to the host user who runs it, and every other container
  user to a subordinate uid (`100000` and up) that can't read the folder. So the wrapper runs as
  `--user 0:0`: root inside, Ronne's user outside, with `--cap-drop ALL` and `no-new-privileges`.
- **Podman** gets `--userns=keep-id --user "$(id -u):$(id -g)"`, which maps Ronne's uid to itself.
- **Rootful Docker** isn't supported: the socket is as good as root on the host. Docker Desktop
  on macOS, used to test the wrapper, remaps ownership on mounts and hides all of this.

Both rootless runtimes need the user's runtime directory, `/run/user/<uid>`. A service user
(`rmk-server service install`) has one only with lingering on: `loginctl enable-linger <user>`.

Don't give a socket to Ronne's own
container: that's why Docker installs of Ronne don't get the scanner yet (135, Out).

## Semantic analysis (optional)

Static scans keep item content on the server (at most the declared dependency names and versions go
to OSV.dev, and nothing with the wrapper's `--network none`). Semantic analysis also asks an LLM whether what a skill
says matches what its code does. It catches more, but every scanned revision's files go to the
provider, scans take minutes and cost money, and two runs can disagree. Ronne runs it only when both
of these hold:

1. **A provider is set up**: by root in the web ([below](#set-up-from-the-web-136)), or by the
   operator in Ronne's environment or its settings file (which, like
   `DATABASE_URL` and `AUTH_SECRET` there, is in Ronne's backups), with the prefix
   `RONNE_SKILL_SCANNER_ENV_`. Ronne strips the prefix and passes on only the chosen provider's own
   variables (the spec's table), only to semantic scans: SkillSpector would otherwise fall back to
   `OPENAI_API_KEY` and `OPENAI_BASE_URL` for a provider whose key is unset. A hosted provider without
   its key, or Azure and compatible without their endpoint, counts as none. SkillSpector's other
   variables aren't passed, even prefixed: `ANTHROPIC_BASE_URL` and `OPENAI_PROJECT_ID` are ignored, so
   `anthropic` always sends to `api.anthropic.com`. For a model on your own network:

   ```sh
   RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER=ollama
   RONNE_SKILL_SCANNER_ENV_OLLAMA_BASE_URL=http://10.0.0.5:11434/v1
   RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_MODEL=qwen3-coder:30b
   ```

   or a hosted one (`openai`, `anthropic`, `nv_build`, `azure_openai`, `openai_compatible`), with its
   key in `RONNE_SKILL_SCANNER_ENV_<KEY NAME>`. `bedrock`, `anthropic_proxy` and the CLI
   providers aren't supported (135, Out).
2. **Root chooses Static and semantic** in Admin › Settings › Security scan, after a warning naming the
   provider and the host the files go to.

In the container, `localhost` is the container itself: give `OLLAMA_BASE_URL` (or the compatible
endpoint) an address the container can reach. With the container wrapper, set `SEMANTIC_NETWORK` in it to a network that reaches the provider:
a Docker network of its own that holds the provider (best for a local model), or `bridge` for a
hosted one. Static scans keep `--network none`, and with `SEMANTIC_NETWORK` empty the wrapper
refuses semantic scans rather than open the network. With network access, SkillSpector's OSV.dev
lookups also run.

Instead of `export`, the same lines (without `export`) can go in Ronne's settings file (`.env` next to
the app, or the file `RONNE_ENV_FILE` names); the environment wins over it. Then restart Ronne, and turn scanning on in **Admin › Settings › Security scan**. With more than one
replica (M17), install it on each one.

## Set up from the web (136)

Root can set the provider, model, endpoint, timeout and API key in Admin › Settings › Security
scan, and choose the command from the operator's list. What the environment sets wins, and the tab
shows it read-only.

- **The command list**: `RONNE_SKILL_SCANNERS`, a JSON array of commands, each one as
  `RONNE_SKILL_SCANNER` is (an absolute path and its arguments, no shell):

  ```sh
  export RONNE_SKILL_SCANNERS='[["/usr/local/bin/skillspector-sandbox"],["/opt/skillspector/venv/bin/skillspector"]]'
  ```

  The tab names each by its position and file name, never its arguments. With one command it's
  chosen by itself. If the list drops the chosen one, nothing is scanned until root picks another.
- **The key** is write-only. It's sealed with AES-256-GCM under a key HKDF derives from
  `AUTH_SECRET` (`crypto/sealed.ts`, as identity providers' secrets are), together with the
  provider and endpoint origin it was typed for (`settings/models/scan-key.ts`): it opens only for
  that pair, so a save that raced another or a hand edit can't send it elsewhere. It's never
  shown, audited or logged, and it's opened only on the server, never sent to the browser: for a
  scan's run, for Test connection, and whenever the tab loads or saves (`scanSetupNow` reads
  whether it still opens).
  `rotate-secret` re-seals it. A key that no longer opens (an `AUTH_SECRET` edited by hand, a
  restore with another one) reads as "enter it again", and semantic scans run static.
- **Endpoints** must be `https://`, with no user name or password, on a host whose every address is
  public (no private, loopback, link-local, metadata or other reserved range, IPv4 or IPv6, mapped
  forms included). Backslashes, spaces and control characters are refused: other URL parsers read
  them differently. The operator can allow hosts in `RONNE_SKILL_SCANNER_HTTP_HOSTS`, bare names or
  addresses separated by commas or spaces (any port; an entry with a port, a scheme or a wildcard
  never matches); those may use `http://`, for a local Ollama:

  ```sh
  export RONNE_SKILL_SCANNER_HTTP_HOSTS='ollama.lan, 10.0.0.5'
  ```

  The endpoint is checked on save and again before each run of semantic scans; a refused one fails
  them `endpoint refused`. **The limit:** SkillSpector looks the host up again itself, so a DNS
  answer that changes between Ronne's check and that lookup isn't covered. If that matters, run the
  scanner behind an egress firewall or proxy that allows only the provider.
- **Test connection** makes one GET to the provider's list of models with the key, to the addresses
  the check resolved only, following no redirect, and says reached, refused or unreachable.
- **Backups**: a full backup holds `AUTH_SECRET` and the database, so it can open the key, as it
  can identity providers' secrets. Encrypt copies that leave the machine.

## The gate and the marks (137)

- **The gate.** With scanning on and root's threshold set (`skill_scan_block_score`, 1–100;
  empty means no gate), the latest revision of a scanned type can't be approved while its newest
  scan scored at or above it, waits or runs, failed, or doesn't exist. It fails closed, so a scan
  made to fail isn't a way past it. `scanGate` (`submissions/models/scan-gate.ts`) reads no
  database. The review page, the queue, Approve many and `decide` all ask it. Root's **scan
  override** (a decision of its own, with a reason, audited as
  `submission.scan_override_approved`) is the only way past. The author's own submission in their
  personal workspace isn't gated, because it's approved as it's sent. Releases aren't gated.
- **Marks.** A reviewer marks a finding a false positive or an accepted risk, with a reason
  (`scan_dismissals`, migrations 0039 and 0040). There's one mark per finding per scan, and the
  scan row is locked while it's written. Marking and restoring are audited
  (`scan.finding_dismissed` and `scan.finding_restored`, with the kind) and appear in the user's
  data download. A mark never moves the score or the gate: the score is SkillSpector's, and
  overriding is root's decision. Authors can't mark their own submission's findings.
- **One screen.** The review page and the author's submission page share `SubmissionScreen`, so
  the scan's card and tab are the same on both. Only the actions differ, by what the server
  allows (`reviewScan`'s `canDismiss` and `canRequest`).

## Moving the pin

1. Read the new release's changelog, `pyproject.toml` and `uv.lock`: new network calls, and anything
   that executes input.
2. Build the image, and list what it installed with `scripts/skill-scanner/licences.py` (its header
   says how). Every licence must be allowed by `docs/policies/dependencies.md` §1 or covered by an
   exception in §5. A new one stops the upgrade until the owner decides.
3. Check its advisories, and those of the packages it installs, on osv.dev and GitHub.
4. Re-record the fixtures in `packages/core/src/skill-scan/fixtures/reports/` (their README says
   how), and run `pnpm --filter @ronneai/core test`. A change in the JSON shape breaks
   `parseSkillScan` there, never in production.
5. Update the commit and version here, in the dependencies policy's table, in the Dockerfile's
   header, in `licences.py`'s header, and in the wrapper's image tag, in the same change.
