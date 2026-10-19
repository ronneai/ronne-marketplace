# 104 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. The export service.** [risky] `identity/services/user-data-export.ts`: each section of
  the shape from the domains' repositories (identity, workspaces, items, submissions, audit), the
  row and comment limits with `truncated`, other people's emails replaced in the audit events, the
  `user.data_exported` event with the counts, and the 10-minute limit counted in the database.
  *Done when:* a db test seeds a person with rows of every kind (and another person's events that
  name them), exports, and checks each section, the order, the limits, `[other]`, the event, the
  second export within 10 minutes refused, and that the output holds no hash, secret, backup code
  or provider token (a search of the JSON text for every seeded secret), on SQLite and the three
  servers.

- [x] **2. The routes and the pages.** [risky] `GET /account/data` (web session, not the two-factor
  hold, no bearer token) and `GET /admin/users/[id]/data` (`users.manage`), the file name and
  headers, 404 for an erased account, 429 with the time left; the Account section with the helper
  `your-data` and the last download's date; the Admin › Users row action (greyed "erased") with the
  helper `download-user-data`; 103's dialog links root's download.
  *Done when:* route tests cover each refusal and the headers; component tests cover the section
  and the action; an e2e test downloads the file as a user and as root, parses it, and finds the
  seeded item and comment; the phone sweep passes.

- [ ] **3. Documentation.** In `../ronne-web`: **Your data** in Privacy (both `topics.ts`), the
  Account and Users lines, in English, Portuguese and French; here, the two helpers and this
  feature's index row set to done, which ends M15.
  *Done when:* the docs render tests pass in both repositories; `pnpm witness:check` passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- Task 1: the 10-minute limit is counted from the audit log, not a new table; retention keeps
  events at least a day (102). Past the item rule, an address is scrubbed whole with the text next
  to it (a URL holding one becomes `[other]`).
- Task 2: the download is a `GET` that records an event and uses the person's window, so only a
  plain GET from the app counts: any other method is 405 (a HEAD is not a download), and a
  `Sec-Fetch-Site: cross-site` request is 403. A same-site page or a browser without Fetch Metadata
  isn't covered (accepted). `/account/data` is the route, so the Account section sits on the
  Password tab rather than a tab of its own.
