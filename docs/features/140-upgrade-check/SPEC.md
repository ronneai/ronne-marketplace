# 140 — Upgrade check: root learns a new version is out

> Milestone: M21 · Depends on: 139, 122, 102, 005, 035, 082, 085 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Upgrade check"), [the release runbook](../../runbooks/release.md) · Contracts: none changed

## Goal

Root finds out, in the app, that a newer Ronne AI Marketplace is released, and how to update this
instance the way it was installed (owner, 2026-10-29). Only root: nobody else can update the server.
It can be turned off, and an instance with no internet keeps working as if it were.

## Scope

**In:**
- **Once a day**, the server asks GitHub for the latest release of `ronneai/ronne-marketplace`:
  - `GET https://api.github.com/repos/ronneai/ronne-marketplace/releases/latest` (drafts and
    pre-releases are left out by GitHub), 10 seconds' timeout, no credentials, no redirects to another
    host, the answer at most 1 MiB;
  - the request says nothing about the instance: the `User-Agent` is `ronne-marketplace`, with no
    version, address or id;
  - run by the in-process scheduler (102) under a lease, so one replica checks (111); the first
    check 10 minutes after the server starts, then every 24 hours.
- **Why GitHub's release:** the release workflow creates it last, once every artefact of the version
  exists (npm, Docker Hub, bundles, `.deb` and `.rpm`, Homebrew), so it never announces a version
  that one install method doesn't have yet.
- **When it's newer** (semver, against the running version from `apps/web/package.json`, the one the
  sidebar shows): every active root gets one notification of kind `instance.update_available` (139),
  once per version, linking to Admin › Settings › Updates.
- **The sidebar's version** shows "Update available" beside it, for root only, while the running
  version is older than the last one seen.
- **Admin › Settings › Updates**, a new tab (122):
  - the running version, the latest one seen with its release notes' link, when it was last checked
    and how it went ("Couldn't reach GitHub", "Up to date");
  - **Check now** (once a minute at most);
  - **How to update this instance**, from how it runs (`server/runtime.ts`): Docker
    (`docker compose pull` then `docker compose up -d`), the npm package
    (`npm install --global @ronneai/marketplace@latest`, then `sudo rmk-server service restart` for a
    service), apt or dnf, Homebrew, or a clone; always "back up first" with the backup command
    (`hostCommand("backup")`), and a link to the `update` topic;
  - **the switch**, "Check for updates", on by default.
- **The operator's override:** `RONNE_UPDATE_CHECK=off` turns it off and greys the switch out ("Set
  on the server"), for instances with no internet or a policy against calls out.
- **Audit:** `settings.update_check` when the switch changes; nothing for each check.

**Out** (and where it goes instead):
- **Updating from the web** (a button that pulls the image or runs npm): no; that's code execution on
  the server, and the operator's job.
- **Telling users other than root**, or `rmk` and the MCP server's own versions: not here; `rmk`
  checks against its instance's API version already.
- **Security advisories** (a release that fixes a vulnerability marked urgent): later, if the release
  notes grow a field for it.
- **An HTTP proxy for the check** (`HTTPS_PROXY`): see Open questions.

## Behaviour

**From root's side.** Version 0.9.0 is released. Within a day, every root sees the bell's count go
up: "Ronne AI Marketplace 0.9.0 is out (you run 0.8.2)". The link opens Settings › Updates with the
release notes' link and, because this instance runs in Docker, the two compose commands to run after
a backup. After the update, the sidebar's "Update available" goes, and the next check says "Up to
date".

**The check, in order.** Skipped when the switch is off, `RONNE_UPDATE_CHECK=off`, or the instance
isn't set up. Otherwise: fetch, parse `tag_name` (`vX.Y.Z`; anything else is ignored), store the
result and the time, compare, and notify the roots who weren't told about that version. A failure
stores the short reason, logs one `warn` line without the response body, and never notifies.

**Pre-releases.** An instance running a pre-release (`1.0.0-rc.1`) is told about the stable release
that follows it, as semver orders them.

## Edge cases

- **No internet, a firewall, GitHub down or rate-limiting (403, 429):** "Couldn't reach GitHub" in the
  tab, the last good answer kept, no notification, no error anywhere else. Rate limits can't be hit:
  one request a day per instance, against GitHub's 60 an hour per address.
- **A strange answer** (no `tag_name`, not semver, too large): treated as a failed check.
- **The latest release is older than the running version** (a clone on `main`): "Up to date".
- **A root added after the notification went out:** sees the sidebar's mark and the tab; no
  notification for a version already announced.
- **Root turns the switch off:** no more checks; the last result stays shown, marked as from before.
- **A version is yanked from GitHub** (the release deleted): the next check sees the older one as
  latest; a notification already sent stays.

## Data

- `instance_settings` rows (no migration): `update_check_enabled`, `update_check_at`,
  `update_check_latest`, `update_check_url` (the release notes), `update_check_error`,
  `update_check_notified` (the last version announced).
- A notification kind, `instance.update_available` (139), with the two versions as parameters.

## Documentation

- **Updating Ronne** (`update`): a new section, `checking` ("How Ronne tells you"): the daily check,
  what it sends (nothing about the instance), the switch, `RONNE_UPDATE_CHECK=off`.
- **Settings** (`settings`): the Updates tab in the list of tabs.
- **Install guide** (`docs/runbooks/install.md`) and the website's install topics: `RONNE_UPDATE_CHECK`
  beside the other variables.
- **Privacy** (`privacy`): the one request the server makes on its own, and how to stop it.
- **Helpers:** the tab's "What does the check send?" → `update#checking`.

## Acceptance criteria

- [ ] The job checks GitHub once a day under a lease, first 10 minutes after start, with the timeout,
  size limit, no redirects to another host and a `User-Agent` without a version; tests use a fake
  fetch.
- [ ] A newer stable release notifies every active root once per version; older, equal or bad
  answers don't; a failure stores its reason and notifies nobody.
- [ ] Settings › Updates shows the versions, last check, Check now (rate-limited) and the update
  commands for Docker, npm (with and without the service), apt/dnf, Homebrew and a clone.
- [ ] The switch and `RONNE_UPDATE_CHECK=off` stop every request (a test asserts fetch isn't
  called); the environment wins and is shown read-only.
- [ ] The sidebar's "Update available" shows for root only.
- [ ] Every new text is a message in English, Portuguese and French; the tab passes the phone sweep.
- [ ] The Documentation and inline helpers listed above say what the feature does.

## Decisions

1. **Root only, through the notification center, with an off switch, safe offline** (owner,
   2026-10-29).
2. **GitHub's release, not npm or Docker Hub** (Claude): it's published last, when every install
   method has the version.
3. **On by default, and anonymous** (Claude): the request carries nothing about the instance, so
   leaving it on costs nothing; the operator's variable turns it off for good.
4. **No update from the web** (Claude): the same reason as 136's decision on commands.

## Open questions

- Should the check honour `HTTPS_PROXY` (instances behind a corporate proxy)? Node's `fetch` doesn't
  by default; it would need an agent, and a dependency check.
- Should a release marked as a security fix notify every day until updated?
