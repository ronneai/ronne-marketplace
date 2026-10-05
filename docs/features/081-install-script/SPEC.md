# 081 — Install script

> Milestone: M12 · Depends on: 080, 035 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap) · Guide: [`docs/runbooks/install.md`](../../runbooks/install.md)

## Goal

One command, copied from the website, installs Ronne with Docker and opens it in the browser, on
macOS, Linux and Windows. The person answers two questions and never edits a file or reads
`compose.yaml`.

## Scope

**In:**
- `install.sh` (macOS and Linux, POSIX `sh`) and `install.ps1` (Windows PowerShell 5.1 and 7),
  published as assets of every GitHub release, with their SHA-256 checksums.
- The Docker path only: checks, two questions, the folder with `compose.yaml` and `.env`, start,
  wait, open the browser.
- Running it again on an installed folder: upgrade, keeping the answers.
- A non-interactive mode for scripts and CI.
- Tests of both scripts in CI.
- Short commands from the website: `https://www.ronne.ai/install.sh` and `/install.ps1` redirect
  (307) to the same files in the latest GitHub release (owner, 2026-10-04). The release stays the
  only copy, with `checksums.txt`, and its URL keeps working. This repository's tests and CI use
  the release and local files only, never the website.

**Out** (and where it goes instead):
- Installing Docker itself: the script links to the right download and stops. Installing a
  container runtime needs admin rights and choices (Docker Desktop's licence) the person should make.
- Installing without Docker: [085](../085-unix-packages/SPEC.md) adds it on Debian, Ubuntu,
  Fedora and RHEL (the script offers this release's `.deb` or `.rpm`; macOS waits for the Homebrew
  tap, on hold), [087](../087-windows-package/SPEC.md) on Windows.
- Hosting the scripts on the website: www.ronne.ai only redirects to the release (below; site
  feature 008 in `ronneai/ronne-web`).

## Behaviour

**The commands** (shown on the website and in the README):

```sh
curl -fsSL https://www.ronne.ai/install.sh | sh
```
```powershell
irm https://www.ronne.ai/install.ps1 | iex
```

Both redirect to the latest release's assets, which also work directly:
`https://github.com/ronneai/ronne-marketplace/releases/latest/download/install.sh` (and `.ps1`).

**Steps**, the same in both scripts:

1. **Check** that `docker` exists, that the daemon answers (`docker info`) and that Compose 2.23.1 or
   later is there (`docker compose version`; 080 needs inline `configs`). Each failure prints one
   sentence and the link for this system (Docker Desktop, Rancher Desktop or Podman Desktop for
   macOS and Windows; Docker Engine for Linux), then exits 1.
2. **Ask** "Where will Ronne run? 1) This computer  2) A server with a domain". For 2: the domain,
   checked against the shape of a host name; an optional email for the certificate authority; and,
   if the domain's DNS doesn't resolve to one of this machine's network addresses, a warning
   (not a stop: DNS may still be propagating, or the server is behind NAT). The script compares
   with the machine's own interfaces and asks no outside service for its public address.
3. **Check ports**: for 1, that 7650 and 7651 are free, else offer the next free pair from
   7650–7662 (7652 and 7653, …). A port counts as free when nothing accepts a connection on it,
   and ports this install already publishes count as free on a rerun. For 2,
   that 80 and 443 are free, else explain the *Behind your own web server* option and stop.
4. **Write** `~/ronne-marketplace/` (Windows: `%USERPROFILE%\ronne-marketplace`): `compose.yaml`
   from the same release as the script (not `main`), and `.env` with only the answers given. An
   existing `.env` is kept and its values are the defaults of the questions.
5. **Start** `docker compose up -d`, wait up to 120 s for `/api/health` through the proxy (any
   answer, as `503 setup_required` is expected), print the address, and open it in the browser
   (`open`, `xdg-open` if present, `Start-Process`). It reminds the person to finish the setup now.

**Pinning the version.** The script installs the release it came from: `compose.yaml` and
`RONNE_IMAGE=ronneai/marketplace:X.Y.Z` in `.env`. Rerunning a newer script moves both to its
version (an upgrade), after showing "0.3.0 → 0.4.0" and asking. Downgrades are refused.

**Non-interactive.** `sh -s -- --yes --mode local|server --domain … --email … --dir …` and the same
as PowerShell parameters (`& ([scriptblock]::Create((irm …))) -Yes -Mode server …`). With `--yes`
every question takes its default or its flag, and nothing opens a browser.

**Safety.**
- The script body is a function called on its last line, so a download cut short runs nothing.
- It never uses `sudo` and never changes anything outside its folder. On Linux, if the user can't
  reach Docker (`permission denied` on the socket), it says to add them to the `docker` group or
  rerun with `sudo`, and stops.
- The checksums file sits next to the scripts; the README shows how to download, check and run.

## Edge cases

- **Podman** with `podman compose`, or `docker` aliased to Podman: supported when `docker compose
  version` works; otherwise the message names Podman Desktop's Docker compatibility setting.
- **Colima or Rancher Desktop** on macOS: they provide `docker`; no special case.
- **Windows without WSL 2**: Docker Desktop's own message; the script repeats its link.
- **The folder exists but isn't ours** (no `compose.yaml` with our project name): stop and ask for
  `--dir`.
- **Ronne already installed in another folder:** every install uses the Compose project name
  `ronne-marketplace`, so a second folder would take over the first one's containers and volumes.
  The script reads `docker compose ls` and stops, naming the other folder.
- **`./certs`:** the script creates it, so it belongs to the user and not to root (080).
- **Questions with `curl … | sh`:** stdin is the script, so questions read `/dev/tty`. With no
  terminal and no `--yes`, the script stops and says to add `--yes`.
- **A legacy install on port 3000** (an old `compose.yaml` there): the rerun keeps
  `RONNE_PORT=3000` in `.env` so the address doesn't change, and says so.
- **No browser** (a server over SSH): print the address only. On Linux, `xdg-open` runs only when
  `DISPLAY` or `WAYLAND_DISPLAY` is set.
- **Testing a script from the repository:** without a release version written in, it installs
  `compose.yaml` from `main` and follows `latest`. `RONNE_INSTALL_COMPOSE_URL` (`file://` works)
  and `RONNE_INSTALL_IMAGE` override both, for CI.
- **arm64 Linux and Apple silicon**: the image is multi-architecture (035); nothing to choose.

## Documentation

- **README**, *With Docker*: the one-line command first; `compose.yaml` by hand stays as "by hand".
- **Documentation › Installing Ronne › With Docker** (`content.tsx`): the command per system,
  what it asks, the port check, where the folder is, and rerunning to upgrade; `compose.yaml` by
  hand follows. The Documentation has no search, so there are no `topics.ts` keywords to add.
- **`docs/runbooks/install.md`:** how to check the download against `checksums.txt`, and rerunning
  to upgrade.
- The guide's *Quick start with Docker* section is published on the website when this is released.
- No inline helper: nothing in the app changes.

## Acceptance criteria

- [ ] On macOS, Ubuntu and Windows 11, the command from a clean state ends with Ronne's setup open
      in the browser, after the two questions only.
- [ ] Answer 2 with a domain writes the three `.env` lines of 080 (plus the email when given).
- [ ] A busy 7650 is detected and the next free port offered; a busy 80/443 stops with the advice.
- [ ] Rerunning keeps the answers; a newer script upgrades after asking; an older one refuses.
- [ ] `--yes` runs with no prompt and no browser, in CI, for both scripts.
- [ ] Missing Docker, a stopped daemon and an old Compose each print their own message and exit 1.
- [ ] Both scripts and `checksums.txt` are attached to every release by `release.yml`.
- [ ] `shfmt -p` (POSIX parse, BSD-3-Clause) passes and the tests run under `dash` and `bash`;
      PSScriptAnalyzer (MIT) passes. Not ShellCheck: it's GPL-3.0, which the dependency policy forbids.
- [ ] The README and the Documentation say what the feature does now.

## Open questions

- None.
