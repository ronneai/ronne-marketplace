# 093 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The viewer

Witnessed: 2026-10-07 14:43 EDT, by a fresh agent (blind). Commit: 6afecdf (plus the uncommitted working tree: `workspaces/{models,repositories,actions}/viewer*.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `Viewer` holds the user id, a root flag, the visible workspace ids (sorted) and the private ones among them (sorted) | yes | confirmed | `models/viewer.ts:9-21` has `userId`, `root`, `workspaceIds`, `privateWorkspaceIds`. Breaking the sort in a scratch copy (`[...ids]` instead of `.sort()`) → 2 of 6 unit tests failed |
| 2 | `visibleWorkspaces` returns every public workspace plus the private ones the user is a member of, in any role | no | confirmed | `models/viewer.ts:38-40` (`Object.hasOwn(user.workspaces, w.id)`). The unit test loops over user, moderator and admin. Removing the membership check → 2 failed; making every workspace count as public → 4 failed |
| 3 | Root sees every workspace, private ones included, without being a member; `seesWorkspace` is true for root | no | confirmed | `viewer.ts:37,52`. Removing `root \|\|` from the filter → 1 failed; removing it from `seesWorkspace` → 1 failed |
| 4 | A non-member doesn't see a private workspace, even when they moderate or administer other workspaces | no | confirmed | Unit test "non-member … whatever they moderate elsewhere" checks `["g","pub"]` and `seesWorkspace(acme)=false`. The same holds on a real DB (`viewer.db.test.ts` outsider case) |
| 5 | Someone who isn't signed in sees nothing (no anonymous access) | yes | confirmed | `viewer.ts:36` and `repositories/viewer.ts:15` return empty lists for a null user. Making a null user see the public workspaces → 1 failed |
| 6 | The visibility key is the sorted ids of the private workspaces the caller sees, and it's empty for anyone who sees only public ones | yes | confirmed | `viewer.ts:55-56`. The tests expect `"acme,beta"`, and `""` for two different public-only users. Keying on all private workspaces instead of the visible ones → 3 failed |
| 7 | The Viewer is loaded from the database with the user's memberships (091); a visibility value that isn't recognised counts as private | yes | confirmed | `repositories/viewer.ts:16-23`. Session and token users both carry `loadMemberships`. `npx vitest run --project db …viewer.db.test.ts` → 3 passed on SQLite; `scripts/test-db.mjs postgres\|mysql\|mariadb` → 3 passed on each |
| 8 | Built once per request: `viewerFor(headers)` and `viewerOf(user)` are the request entry points | yes | confirmed | `actions/viewer.ts:7-16`. Each call runs one `SELECT id, visibility FROM workspaces`. Nothing memoises it per request, and nothing calls it yet, so using it once per request is up to the reads in tasks 2–3. These two wrappers have no test of their own |
| 9 | Done when: unit tests cover root, a member, a non-member and a public-only user | no | confirmed | `npx vitest run …models/viewer.test.ts` → 6 passed: root, a member (3 roles), a non-member and public-only users, plus signed-out and stale-membership cases. All 7 mutations tried made at least one test fail |
| 10 | The new code passes lint and typecheck | no | confirmed | `pnpm exec biome check apps/web/src/server/domains/workspaces` → 17 files, no issues; `npx tsc --noEmit -p apps/web` → exit 0 |

**Overall:** met: the Viewer and `visibleWorkspaces` behave as the spec says for root, a member in any role, a non-member, a public-only user and someone signed out, the tests catch each mutation tried, and the loader passes on SQLite, PostgreSQL, MySQL and MariaDB.

### Adversarial pass

Witnessed: 2026-10-07 14:46 EDT, by a fresh agent (adversarial). Commit: 6afecdf + working tree (untracked `workspaces/{models,repositories,actions}/viewer*.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Done when: unit tests cover root, a member, a non-member and a public-only user | no | confirmed | `vitest run models/viewer.test.ts` → 6 passed; root, a member in each of user/moderator/admin, a non-member who moderates elsewhere, two public-only users |
| 2 | Viewer holds user id, root, and the visible **workspace and scope ids** (PLAN task 1 line) | yes | partly | `models/viewer.ts:9-21` has `userId`, `root`, `workspaceIds` and `privateWorkspaceIds`, but no scope ids. SPEC Behaviour still said "a `scope_id IN (…visible scopes)` join" |
| 3 | Every public workspace, plus the private ones the user is a member of in any role; nothing else | no | confirmed | sqlite plus `test-db.mjs postgres/mysql/mariadb` with a scratch probe: a member sees acme, a non-member doesn't. A membership row whose role is unknown (`"Admin"`) gives no access (fail-closed, from `loadMemberships`). Mutation "a member with role `user` excluded" was caught by 3 tests |
| 4 | Root sees every workspace without being a member; `seesWorkspace` is true for root on any id | no | confirmed | Probe with 10 odd-visibility workspaces: root got all 11. Mutations "drop `root \|\|`" in the filter (2 tests failed) and in `seesWorkspace` (1 failed) were caught |
| 5 | Signed out or disabled sees nothing | yes | confirmed | Probe through `viewerFor(headers, app)`: no cookie, a bogus cookie, a disabled user's session and a DB role `"Root"` → empty; `loadViewer(null)` ran 0 queries. Both signed-out mutations were caught |
| 6 | An unexpected visibility value hides the workspace instead of showing it | yes | confirmed | Probe stored `Public`, `PUBLIC`, `public `, ` public`, `private `, `Private`, `""`, `public\n`, fullwidth `ｐｕｂｌｉｃ` on all four databases: an outsider saw only global (key `""`). `repositories/viewer.ts:21` uses strict `=== "public"`. Test gap: no test kept a close value hidden (fixed; see the re-check) |
| 7 | A non-member can't get a private workspace through odd memberships (case or whitespace in ids, deleted workspace, demoted root) | no | confirmed | Lowercase membership id: accepted by the FK on MySQL/MariaDB but ignored by the case-sensitive `Object.hasOwn`; refused by the FK on PostgreSQL and SQLite. Trailing space: cut to the real id on PostgreSQL, a duplicate on MySQL/MariaDB; leading space too long everywhere. A deleted workspace's membership cascades away; a demoted root sees only global |
| 8 | The visibility key is the sorted private ids the viewer sees; empty for public-only users; stable whatever order the inputs come in | yes | partly | Behaviour holds (40 workspaces, 13 private memberships, reversed order → same key on all four databases), but deleting `sorted()` from `privateWorkspaceIds` left all tests green |
| 9 | Two different sets can't produce the same key (no id contains `,`) | no | confirmed | Ids come only from `newId()` (ULID, `db/ids.ts:12`) and the fixed `GLOBAL_WORKSPACE_ID`; neither can contain a comma. Mutation "separator `""`" was caught |
| 10 | Built once per request: one query, then a plain value whose readers don't query again | yes | confirmed | A Kysely plugin counted the queries: `loadViewer` ran 1 query (0 signed out). `seesWorkspace` and `visibilityKey` are pure. `viewerFor` isn't memoised per request: "once" depends on callers passing the value along |
| 11 | The tests catch mistakes (mutation run) | no | partly | 15 mutants: 10 killed; 5 survived. M1 (key not sorted) and M7 (lenient `.trim().toLowerCase() === "public"`) matter; M5, M11 and M12 behave as the original for real ULID ids and valid roles |
| 12 | Lint and typecheck clean; existing tests pass on four databases | no | confirmed | `biome check` on 5 files → no fixes. `tsc --noEmit -p apps/web` → exit 0. `viewer.db.test.ts` → 3/3 on sqlite, postgres, mysql and mariadb |

**Overall:** not met: the access rules hold under every attack tried on all four databases, but the task line and SPEC still said the Viewer holds scope ids, and the tests didn't check that the key is sorted or that odd visibility values stay hidden. Fixed: tests for both; SPEC and PLAN say the viewer lists workspaces, and reads filter on the scope's workspace. Remarks recorded in PLAN's notes: membership is decided in the viewer, never by a SQL join (MySQL matches ids ignoring case); build the viewer once per request.

### Re-check — rows 2, 8 and 11

Witnessed: 2026-10-07 14:48 EDT, by a fresh agent (adversarial). Commit: 6afecdf + working tree (SPEC.md, PLAN.md and the viewer tests changed; `models/viewer.ts`, `repositories/viewer.ts` and `actions/viewer.ts` byte-identical to the first pass's copy, `cmp`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | The Viewer holds what the task says: user id, root, the visible workspace ids and the private ones among them; no scope ids, with the spec saying how reads filter instead | yes | confirmed | `models/viewer.ts:9-21` has exactly those four fields. PLAN task 1 line: "visible workspace ids, the private ones among them … no scope ids are listed". SPEC Visible paragraph: "the scope's workspace among the visible ones: a join, or a `scope_id IN (select … where workspace_id IN (…))` subquery; the viewer lists workspaces, not scopes" |
| 8 | The visibility key is the sorted private ids the viewer sees, whatever order the workspaces come in, and a test proves it | yes | confirmed | `viewer.test.ts:67-71` reverses the workspace list and asserts `["acme","beta"]`, sorted `workspaceIds` and key `"acme,beta"`. Mutant M1 (drop `sorted()`) → 1 failed / 8 passed |
| 11 | The tests catch mistakes (mutation run) | no | confirmed | 15 mutants → 12 killed, M1 and M7 among them. Two extra repository mutants, `.toLowerCase() === "public"` and `.trim() === "public"`, each → 1 failed. Survivors M5, M11 and M12 behave as the code for real ULID ids and valid roles. `viewer.test.ts` → 6 passed; `viewer.db.test.ts` → 3/3 on sqlite, postgres, mysql and mariadb; `biome check` → no fixes |

**Overall:** met: the key is sorted and tested, close-to-"public" values are tested hidden on all four databases, and the spec, the plan and the Viewer agree on workspace ids instead of scope ids.

## Task 2 — Items reads

Witnessed: 2026-10-07 15:14 EDT, by a fresh agent (blind). Commit: 01d565c plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The catalogue repository takes a `Viewer`, and every read filters on it (list, byNames, typeCounts, scopes, workspaces, mostUsed) | yes | confirmed | `kysely-catalogue-repository.ts:57-66`: `listed()` filters by `inVisibleWorkspace(viewer, "workspaces.id")`, and every read except `workspaces` is built on it. `workspaces()` filters at `:233`. The guard probes all 6 reads |
| 2 | The item repository (item, versions, tags, version detail, "Used by", approval) takes a `Viewer` and filters every read | yes | confirmed | `kysely-item-repository.ts`: findByName `:75`, versions `:150`, tags `:269`, versionDetail `:317`, dependents `:346-347`, approval `:366`. `transaction` passes the same viewer (`:67`) |
| 3 | Downloads go through the filtered reads | no | confirmed | There is no separate download repository: `services/downloads.ts:29-31` uses `findByName` and `versions`. Probe: `downloadArtifactAs(outsider, @acme-infra/deploy)` gave the same `ItemNotFoundError` as an unknown name, and `download_count` stayed at 3 |
| 4 | The actions and pages pass the request's viewer (catalogue, home, item page, versions, contents, the API's `…As` functions, resolve) | yes | confirmed | `actions/catalogue.ts` and `actions/versions.ts` build it with `viewerOf(user)` for each request. Pages call these actions. No other non-test caller builds these repositories without a viewer (grep). `pnpm typecheck` → 7/7 successful |
| 5 | To a non-member, a private item answers exactly as an unknown name does (page, versions, contents, API item, download, resolve, the write actions) | no | confirmed | `private-items.db.test.ts` compares the outcome with an unknown name's. Probe: moveTag, yank, deprecate, removeTag, downloadArtifactAs and an unknown version all gave `ItemNotFoundError: @acme-infra/X isn't a published item.` for both. `@ACME-INFRA/DEPLOY` gave not found on SQLite, MySQL and PostgreSQL |
| 6 | Not in a non-member's catalogue, search, counts, scope list, Workspace filter or home page; members and root do see it | no | confirmed | private-items tests 1-2 pass. Probe: `scope: "acme-infra"`, `workspace: "ACME"` and `q: "@acme-infra/"` all returned `[]` for the outsider |
| 7 | "Used by" and the canvas facts hide private dependents from non-members | yes | confirmed | private-items test 5 passes: outsider `usedBy` is `[]`, member sees `@acme-infra/deploy`; `dependencyFacts` doesn't contain `deploy` |
| 8 | Any role sees the items, and losing membership hides them | no | confirmed | Probe: an `admin` member sees the item page. After the `workspace_members` row was deleted, the next request got `ItemNotFoundError` |
| 9 | Items db tests pass with a private workspace on SQLite | no | confirmed | `vitest run --project db src/server/domains/items` → 7 files, 51 passed (includes private-items and visibility-guard) |
| 10 | The same on PostgreSQL, MySQL and MariaDB | no | confirmed | `node scripts/test-db.mjs postgres\|mysql\|mariadb src/server/domains/items` → 7 files, 51 passed on each |
| 11 | The guard test fails when a read drops the viewer filter | no | confirmed | Scratch copy, one mutation at a time, removing the filter from findByName, versions, tags, versionDetail, dependents (workspace filter), approval, catalogue `listed()` and catalogue `workspaces()`: each turned the guard red. Unmutated: 5 passed |
| 12 | The guard test fails when a read method is added without a viewer | yes | confirmed | An unfiltered `ownerOf` added to the item repository in the scratch copy → "knows every method" failed (17 keys vs 16 expected) |
| 13 | Nothing else regressed (callers changed in feeds, composer, http and the e2e seed) | no | confirmed | Full db suite on SQLite → 78 files, 623 passed, 8 skipped. `src/server/http`, `domains/feeds` and `composer.db.test.ts` on postgres, mysql and mariadb → 9 files, 117 passed each. `pnpm lint` → exit 0 (warnings only) |

**Overall:** met: every items read takes a `Viewer` and filters on it on all four databases, private items answer as unknown names, and the guard test catches a dropped filter or a new unfiltered method. Remarks taken: the guard missed the second filter in `dependents` (the item asked about); its probe now also asks for a private item's "Used by" (with old data: a public item depending on it), and removing that filter fails it. A public item that depends on a private one would show the private name in its versions and fail resolve: tasks 4 and 5 keep such data from being made.

### Adversarial pass

Witnessed: 2026-10-07 15:17 EDT, by a fresh agent (adversarial). Commit: 01d565c + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The items db tests pass with a private workspace on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | `vitest run --project db src/server/domains/items` → 7 files / 51 tests passed on SQLite; `node scripts/test-db.mjs postgres\|mysql\|mariadb src/server/domains/items` → 51/51 on each, including `private-items.db.test.ts` and `visibility-guard.db.test.ts` |
| 2 | The catalogue and item repositories take a `Viewer` at construction; their reads filter through `visible.ts` | yes | confirmed | `kysely-catalogue-repository.ts:58,66,233`; `kysely-item-repository.ts:63,75,150,269,317,346-347,366`. The writes and `userName` are not filtered and are named in the guard's exempt list |
| 3 | The guard test fails when any filter is removed | no | confirmed | Mutated a copy, one filter at a time: item lines 75, 150, 269, 317, 346 and 366, catalogue `listed()` and `workspaces()`. Each removal → 1–5 failing tests. One gap: removing line 347 (the second `dependents` filter) → all pass; that method still filters on line 346 |
| 4 | The guard test fails when a new read method is added, in either repository | yes | confirmed | `ownerOf` added to ItemRepository → "knows every method" fails. `allNames` added to CatalogueRepository → the same test fails, and `tsc` gives TS2741 on `CATALOGUE_READS` |
| 5 | A transaction opened from a filtered repository keeps the viewer | no | confirmed | `kysely-item-repository.ts:67`. Mutating it to `{...viewer, root:true}` → "filters inside a transaction too" fails |
| 6 | Catalogue, search, type counts, scope and workspace filter lists and the home page hide a private item and workspace from a non-member; a member and root see them | yes | confirmed | Probe as an outsider who moderates `global`, on 4 DBs: searches `acme`, `@acme`, `@acme-infra/`, `@acme-infra/dep`, `The deploy item`, `deploy`, `ACME`, `%`, `_` and `a`, each with sorts name, installs and recent: no "deploy" or "acme-infra" in any result, and the type counts sum to the visible entries. Filters `scope:acme-infra`, `workspace:acme`, `ACME` and `ACME-INFRA` give the same page as an unknown scope. A cursor pointing at `acme-infra/a` leaks nothing |
| 7 | Item page, versions, version contents, API item, download lookup and resolve answer a non-member exactly as for an unknown name | yes | confirmed | `private-items.db.test.ts` compares the errors with an unknown name. Probe on 4 DBs also tried `ACME-INFRA/DEPLOY`, `Deploy`, trailing spaces and `@acme-infra`: the outsider always got `ItemNotFoundError` with the same text as unknown |
| 8 | The canvas facts (`byNames`) and "Used by" hide a private item from a non-member | yes | confirmed | `dependencyFacts(outsider, ["@ACME-INFRA/DEPLOY","@acme-infra/deploy "])` → `{}`. A public item's `usedBy` is `[]` for the outsider and lists `@acme-infra/deploy` for a member |
| 9 | A non-member's download of a private item isn't counted and fails like an unknown name | no | confirmed | Probe: `downloadArtifactAs(outsider, deploy)` and `(…unknown)` gave the same error, and every `items.download_count` was unchanged |
| 10 | Version management by a moderator of another workspace treats a private item as unknown | no | confirmed | `moveTag(asOutsider, deploy, beta)` → `ItemNotFoundError … isn't a published item.`, the same as for an unknown name |
| 11 | Signed-out and root behave as the spec says | yes | confirmed | Signed out, `itemPage` for the private and the unknown name → the same `ForbiddenError (account.manage_own)`. Root sees the private item. The guard checks root's findByName and that nobody's list is `[]` |
| 12 | An empty `workspaceIds` doesn't produce invalid SQL | yes | confirmed | `visible.ts` gives `1 = 0` before any `IN (…)`. The guard's "nobody" `list` returns `[]` on all 4 DBs |
| 13 | Errors and timing don't differ between private and unknown | no | confirmed | Every read starts with the filtered `findByName`, so a private name and an unknown one take the same code path with the same number of queries. Error texts were equal in probes 7, 9 and 10. Timing was not measured; this rests on reading the code |
| 14 | The unfiltered viewer (`UNFILTERED`) is not used for anything a person or token reads in the items domain | yes | confirmed | Used only in `kysely-release-store.ts` (a release, already authorised), `kysely-registry-lookup.ts` (submissions checks, task 4), `e2e/seed.ts` and `scripts/feed-benchmark.ts`. The items actions build the viewer from the session or token |
| 15 | The feeds use the public-only viewer, so the shared cache can't hold private data. Members lose their private items in feeds until task 7 (expected) | yes | confirmed | `feeds.ts` uses `loadPublicViewer` for both repositories. Every feed read goes through the filtered `catalogue.list`, `items.findByName` or `items.versions` |
| 16 | Nothing else broke: typecheck, lint, the web tests and the changed http/feeds/composer/workspaces db tests | no | confirmed | `tsc --noEmit` → exit 0. `biome check apps/web` → no errors. `vitest run` (web) → 187 files, 1685 passed. http + feeds + composer + workspaces db tests → 161/161 on postgres, mysql and mariadb |

**Overall:** met: every items-domain read filters by the viewer on all four databases, hostile names and inputs answer like unknown names, and the guard catches removed filters and new methods. Remarks, recorded in PLAN's notes for later tasks: the composer's dependency reports read through the unfiltered registry lookup and can tell a private name from an unknown one (tasks 3 and 4); a public item depending on a private one shows its name (tasks 4 and 5); the scope repository isn't under the guard (task 6); long `IN (…)` lists are untested. The guard gap (row 3) is closed: its `dependents` probe also asks for a private item's "Used by", and removing the second filter now fails it (checked by the implementer, on SQLite; the guard and private-items tests pass on PostgreSQL, MySQL and MariaDB).

## Task 3 — Submissions reads

Witnessed: 2026-10-07 15:40 EDT, by a fresh agent (blind). Commit: f345efd + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The submissions and usage db tests pass with the private cases, on SQLite | no | confirmed | `vitest run --project db src/server/domains/submissions src/server/domains/usage src/server/http/drafts-api.db.test.ts` → 23 files, 240 passed (with `private-submissions.db.test.ts` and `visibility-guard.db.test.ts`) |
| 2 | The same tests pass on PostgreSQL, MySQL and MariaDB | no | confirmed | `node scripts/test-db.mjs postgres\|mysql\|mariadb <same files>` → each 23 files, 240 passed |
| 3 | The submission repository, the registry lookup and the usage repository take a `Viewer`, and every caller passes one | yes | confirmed | `kysely-submission-repository.ts` base query `isReadableSubmission`, findScope and each read; `kysely-registry-lookup.ts:22,55`; `kysely-usage-repository.ts:30,82,103`. Outside tests the only `UNFILTERED` is `kysely-release-store.ts` (release, by design). `tsc --noEmit` → clean |
| 4 | A test lists every read method and checks it filters (a member sees the private data, an outsider none) | yes | confirmed | `visibility-guard.db.test.ts`: the key-set test plus a probe per read. Making `isReadableSubmission` always true → 2 guard tests fail; dropping the findScope filter → guard and draft test fail; dropping the usage `publishedVersions` filter → guard and usage test fail |
| 5 | A non-member's draft in a private scope gets the same answer as an unknown scope: `scope_not_found` "There's no scope @… you can use" | yes | confirmed | `errors.ts:41-43`; test "refuse an outsider's draft…" compares the masked errors; dropping the findScope filter makes it fail |
| 6 | The name check works for members: a name taken in a private workspace is refused as "taken" | no | confirmed | Probe: a member's draft `@acme-infra/deploy` → `name_taken` "already a published item"; a second member's `@acme-infra/style` → `name_taken` "already proposed by another submission under review" |
| 7 | Dependency marks don't reveal private items or submissions to outsiders | yes | confirmed | Probe `dependencyMarks`: the outsider's draft depending on `@acme-infra/style` (submitted) and `/deploy` (released) → both `waits/not_submitted`, the same as unknown names; the member's → `waits/submitted` for style. No committed test covered marks (since added, see below) |
| 8 | Review queue: a moderator of `global` who isn't a member sees nothing of the private workspace; acme's moderator and root do | yes | confirmed | Test "aren't in an outsider's queue…" (outsider `[]`, acme moderator and root `[id]`, `acme` not in the workspaces list). Probe `countNeedsReview` → outsider 0, acme moderator 1, root 1. With the repository filter removed, 091's role check alone still hides them, so the filter is pinned by the guard test |
| 9 | The review page and the submission view answer an outsider as an unknown id does; acme's moderator sees the page | yes | confirmed | Test "answer an outsider's review page and view…" passes; as in row 8, 091's checks give the same answer without the filter |
| 10 | A removed member keeps reading and withdrawing their own drafts and submissions (091) | yes | confirmed | Test "stay readable and withdrawable…"; removing the own-author branch makes it fail. Probe after removal: `getDraft` ok, `listMySubmissions` → ["keep","style"], counts {draft:1, submitted:1}, `deleteDraft` ok, a new draft in the scope → `DraftScopeNotFoundError` |
| 11 | Usage ingest ignores reports for items the reporter can't see | yes | confirmed | Test: outsider → `{accepted:0, ignored:1}`, member → `{accepted:1, ignored:0}`; dropping the filter makes it fail |
| 12 | Usage on the item page is shown only to those who see the item | yes | confirmed | Test: the outsider's `itemUsage` equals an unknown id's. Probe `itemUsageByVersion` (50 runs seeded) → outsider `null`, member `{"1.0.0":{"runs":50,"installs":0}}` |
| 13 | The SPEC is updated for the changed non-member answer | yes | confirmed | `git diff SPEC.md` → it now gives "There's no scope @acme-infra you can use" (`scope_not_found`) instead of "That scope isn't available to you" |

**Overall:** met: every read in submissions, the registry lookup and usage filters by the viewer, the private cases pass on all four databases, and the guard test fails when any filter is removed. Remark taken: `private-submissions.db.test.ts` now marks an outsider's dependencies on a private submitted and a released name exactly as on unknown names, and fails when the registry lookup reads unfiltered (checked by the implementer).

### Adversarial pass

Witnessed: 2026-10-07 15:58 EDT, by a fresh agent (adversarial). Commit: f345efd + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Done when: the submissions and usage db tests pass with private cases, on all four databases | no | confirmed | `vitest run --project db src/server/domains/submissions src/server/domains/usage src/server/http` → 29 files, 291 passed on SQLite; `node scripts/test-db.mjs postgres\|mysql\|mariadb` (same files) → 291 passed on each |
| 2 | Draft scope check: a non-member's `createDraft` into a private scope gets exactly the unknown-scope answer, in any spelling; a member can create | yes | confirmed | Probe compared `acme-infra`, `"  @ACME-INFRA "`, `Acme-Infra` and `"@acme-infra\t"` against the same spellings of `nowhere`, names masked → all the same (`DraftScopeNotFoundError: There's no scope @X you can use…`). Member → created |
| 3 | Renaming a draft into a private scope, and uploading through the API, give the same answer as an unknown scope | no | confirmed | `renameDraft` from a non-member: the same. `postDraft` with `@acme-infra/x`, `@ACME-INFRA/x` and `@nowhere/x` → each `404 scope_not_found`, message and `details.scope` differ only by the name |
| 4 | Review queue: the 4 tabs, their counts, the nav count and the Workspace filter hide a private workspace from a moderator of `global`; acme's moderator and root see it | yes | confirmed | As the `global` moderator: needs, waiting, release and decided each gave 0 rows and total 0, with and without `workspace: "acme"`; the filter listed only `global`. `countNeedsReview`: outsider 0, acme moderator 1, root 1 |
| 5 | Review page, `viewSubmission`, `checkSubmission`, `countDependents` and `listDependents` answer a non-member's private id as they do an unknown id | yes | confirmed | All five → `SubmissionNotFoundError: That submission doesn't exist.` for both ids. The acme moderator's `getReview` → found |
| 6 | Bulk approve, bulk release (prepare) and bulk submit-check with a private id answer `not_found`, as for an unknown id | no | confirmed | `approveMany`, `prepareRelease` and `checkManyDrafts` with a private id and an unknown id, masked → `[{"result":"not_found"},{"result":"not_found"}]` in each |
| 7 | The withdraw warning's count and the dependents list don't reveal private dependents to outsiders, and still count them for the author and root | no | confirmed | `@acme-infra/uses` depends on `@team/base` (in review): `countDependents` gives member 1, outsider 0, root 1; `listDependents` gives outsider `[]`, root 1 row |
| 8 | Composer: `dependencyReports` and `findDependencies` treat a private name as unknown for a non-member, and offer it to a member | yes | confirmed | `private-submissions.db.test.ts`. Making the registry lookup UNFILTERED makes that test and the guard fail |
| 9 | A change proposal on a private item answers as for an unknown item | no | confirmed | `proposeChange` with `@acme-infra/deploy` vs `@acme-infra/nope`, and vs `@nowhere/deploy` → the same `ProposalBaseNotFoundError: X isn't a published item.` A member gets past the lookup |
| 10 | Usage reports: ignored for items the reporter can't see, with the same counts as an unknown item; counted for members and root | yes | confirmed | Outsider: private, unknown and wrong-version reports → each `{"accepted":0,"ignored":1}`. Member → `{1,0}`, root → `{1,0}` |
| 11 | The item page's usage and usage by version are shown only to those who see the item | yes | confirmed | `itemUsageByVersion`: outsider gets `null` for both the private and an unknown id; member gets `{"1.0.0":{"runs":2,…}}`. `itemUsage`: outsider equals an unknown id; root sees `shown:true` |
| 12 | A removed member keeps their own submissions: view, withdraw, list, counts, open and delete their draft | yes | confirmed | After deleting the acme membership row: list `dr:draft,style:submitted`; counts `{"draft":1,"submitted":1}`; `getDraft`, `deleteDraft` and `viewSubmission` → found. Removing the "own" clause from `isReadableSubmission` makes the repo test fail |
| 13 | Every read of the submission, registry-lookup and usage repositories filters by the `Viewer`, and the guard test fails when a filter is removed or a method is added | yes | confirmed | 20 mutations (the filters on findScope, base query, countByStatus, isNameProposed, revisions, revisionFiles, events, latestEvents, files, statusCounts, countDrafts and workspacesNamed; registry items UNFILTERED; submissionsNamed; usage publishedVersions, rowsBetween and hasAny; transaction UNFILTERED; an added `extraRead`; the own clause dropped): all 20 caught |
| 14 | A transaction opened from a filtered repository keeps the viewer | no | confirmed | `kysely-submission-repository.ts:147-150`. Changing it to UNFILTERED fails "filters inside a transaction too" |
| 15 | The release store's UNFILTERED use is justified: the release is found and authorised through the filtered repository first | yes | confirmed | `publish.ts:79-90` finds the submission through the viewer's repo and checks `view_submitted`/`publish` before any `store.transaction`; `bulk-release.ts:138` does the same |
| 16 | The results are the same on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | The probe passed 9/9 on each server; its outputs diff empty against SQLite's once ids are masked |
| 17 | SPEC.md states the behaviour as built (`scope_not_found`, "There's no scope @… you can use") | yes | confirmed | The SPEC Behaviour paragraph matches the API probe in row 3 |
| 18 | Types and lint hold | no | confirmed | `tsc --noEmit -p apps/web` → rc 0. `biome check` of submissions, usage and workspaces → 0 errors (2 warnings in files this change doesn't touch). `vitest run src/features/submissions` → 26 passed |

**Overall:** met: no way found for a non-member to learn of or read a private workspace's submissions, scopes or usage through these domains, and members, root, removed authors and draft authors kept their access, on all four databases. Remarks: the release transaction resolves dependencies unfiltered, which task 4's `dependency_not_visible` at release closes; `countDependents`' comments said "in every workspace" (fixed: they say what it counts now).

## Task 4 — The dependency rule

Witnessed: 2026-10-07 16:16 EDT, by a fresh agent (blind). Commit: b9ec3ae + working tree (21 files changed, `private-dependencies.db.test.ts` untracked). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | At submit, a dependency in another private workspace gives `dependency_not_visible` with the spec's message, even when the submitter sees it | yes | confirmed | `registry-checks.ts:210-216`. `private-dependencies.db.test.ts` passes on SQLite, PostgreSQL, MySQL and MariaDB. Mutation (`if (false)` on the check) → 2 unit and 2 db tests fail |
| 2 | A public item can't depend on a private one | no | confirmed | `private-dependencies.db.test.ts` and `registry-checks.test.ts` pass. Probe: root drafting in @team with `@acme-infra/deploy` → `dependency_not_visible` |
| 3 | An item may depend on its own workspace's items and on public ones (another public workspace included) | yes | confirmed | `private-dependencies.db.test.ts` → no dependency issues. Probe: `@beta-tools/onwip2` on its own pending `@beta-tools/wip` → only `dependency_pending` |
| 4 | Decision 5: the rule is named only to someone who sees the dependency; anyone else gets `dependency_not_found`, the same as an unknown name | yes | confirmed | `private-dependencies.db.test.ts` passes. Probe: a member of beta only, in @team, depending on `@beta-tools/lint` and `@acme-infra/deploy` → `not_visible` for lint, `not_found` for deploy. Outsider's canvas report for deploy → the same text as an unknown item |
| 5 | Refused at release too | yes | confirmed | `private-dependencies.db.test.ts` (the workspace turns private after approval → publish rejects `/private workspace/`) passes on all 4 dialects; fails under the mutation in row 1. Unit test loops over `release` false and true |
| 6 | Bulk submit and the canvas reports apply the rule as well | yes | confirmed | `bulk-submit.ts:236-241`, `composer.ts:71-93`. Probe: `checkManyDrafts` → `[["not_ready",["dependency_not_visible"]]]`. `dependencyReports` → only `@beta-tools/lint` has the message. No repository test covered the canvas reports' workspace (since added) |
| 7 | 089's pickers (form/`@` and canvas) offer only the draft's own workspace plus public ones; with no item name or an unknown scope, public only | yes | confirmed | `kysely-catalogue-repository.ts:113-121`, `dependency-search.ts:86-91`, `composer.ts:139-140`. `CataloguePicker.tsx`, `DraftEditor.tsx` and `DependencyField.tsx` pass `itemName`. The picker test passes, and dropping the catalogue filter makes it fail. Probe: a beta-only user with `itemName "@acme-infra/new"` → only public entries |
| 8 | The pickers also hide the person's own unreleased submissions in another private workspace | yes | confirmed | `dependency-search.ts:125-126`, `composer.ts:160-164`. Probe: the member's `@beta-tools/wip` and `@beta-tools/wipdraft` → missing for `@acme-infra/new`, present for `@beta-tools/new`, in both pickers. No test covered it (since added) |
| 9 | Resolve runs as the caller. A dependency the caller can't see → `item_not_found` naming the dependent | yes | confirmed | `resolve.ts:96-110,173-176`, `versions.ts:128-135`. Probe as an outsider: `resolveAs(@team/front → @acme-infra/deploy)` → `item_not_found "@acme-infra/deploy isn't a published item (asked for by @team/front@1.0.0)."`, `details.from=["@team/front@1.0.0"]`. A member resolves both. `resolve.test.ts` 14 pass |
| 10 | Done when: registry-check, resolve and picker tests cover own workspace, public, other private | yes | partly | Registry checks: unit and db tests cover all three, and a mutation fails them. Resolve: core covers the dependent's name; no db test of an outsider resolving a public item that depends on a private one. Pickers: with the unreleased-submission filters removed from both pickers, every test still passed |
| 11 | Lint, typecheck and the affected suites are green | no | confirmed | `pnpm typecheck` → 7/7. `pnpm lint` → no errors. draft-editor tests 120 passed. Submissions unit and db suites 360 and 206 passed |

**Overall:** not met: the rule works at submit, at release, in bulk, in the canvas reports, in the pickers and in resolve, but the pickers' own-unreleased filter and the canvas reports' workspace had no test that fails when they're removed. Fixed: `private-dependencies.db.test.ts` now tests the pickers leaving out the person's own unreleased item in another private workspace, the canvas reports' rule for the item's workspace, and an outsider resolving a public item that depends on a private one. Re-check below.

### Re-check — row 10

Witnessed: 2026-10-07 16:31 EDT, by a fresh agent (blind). Commit: b9ec3ae + working tree (24 files changed, `private-dependencies.db.test.ts` untracked, now 12 tests). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | Done when: registry-check, resolve and picker tests cover own workspace, public, other private | yes | confirmed | private-dependencies, private-submissions, registry, visibility-guard and private-items db tests → 37 passed on SQLite, PostgreSQL, MySQL and MariaDB. Submissions and draft-editor unit tests → 487 passed. `resolve.test.ts` → 14 passed. `pnpm typecheck` → 7/7; `pnpm lint` → no errors. Mutations, each against `private-dependencies.db.test.ts`: the `listOwnUnreleased` `dependableFrom` filter off → 2 fail; `ownDependencies` not passing `dependableFrom` → the same 2 fail; composer reports `workspaceId: "nope"` or `null` → "applies the rule in the canvas's reports" fails; core's "asked for by" reverted → "names the public item that asks an outsider for a private one" fails; `resolveAs` using `UNFILTERED` → the same test fails; `collate utf8mb4_bin` removed, run on MySQL → "a visibility that's only nearly public" fails |

**Overall:** met: picker, canvas-report and resolve tests now cover own workspace, public and other private, and each mutation of those paths fails at least one test.


### Adversarial pass

Witnessed: 2026-10-07 16:24 EDT, by a fresh agent (adversarial). Commit: b9ec3ae + uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0. (Before this pass it saw PLAN.md's Notes entries for tasks 1 and 2, not task 4's; it read task 4's entry only after the verdicts.)

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | At submit, a dependency in another private workspace is refused with `dependency_not_visible` and the spec's message, even when the submitter sees it (member of both, or root) | yes | confirmed | `registry-checks.ts:210-217`; `private-dependencies.db.test.ts` passes on SQLite, postgres, mysql and mariadb. Probe P3: the member's own submitted `@beta-tools/onway`, used from acme → `dependency_not_visible`. P5: root's `@team/r1` → `@acme-infra/deploy` gives the same code |
| 2 | A public item can't depend on a private one, whatever the route: new draft, proposal (017), skill frontmatter agent (097), bulk submit in-batch | yes | confirmed | P1: a proposal on public `@team/pubagent` adding `@acme-infra/deploy` → `dependency_not_visible`. P4: a skill in team with `agent: "@beta-tools/bot"` → `dependency_not_visible`. P2: `submitManyDrafts({ids:[top], dependencies:true})` → `@team/top` `not_ready [dependency_not_visible]`. Odd case can't get through: `names.ts:8` allows only `[a-z0-9-]` |
| 3 | The rule doesn't wrongly refuse an own workspace's items, public items, root, or a member of both depending within one workspace | yes | confirmed | The DB test "lets an item depend on its own workspace's items and public ones" passes. P2 acme → acme in one batch → both `submitted`. P5: root in acme → `[]`. Mutant `ruleRefusesOwn` → 2 fail |
| 4 | A non-member gets `dependency_not_found`, word for word the same as for an unknown name (decision 5) | yes | confirmed | The DB test passes. P1, P4 and P7 match the unknown-name answer once the name is swapped, on all 4 databases. A bulk release by a non-member → the unknown-name wording |
| 5 | Release refuses it too, by single publish and by bulk release (055), including a workspace that turned private after approval | yes | confirmed | The DB test passes; mutant `ruleNotAtRelease` → 2 fail. P6: `releaseMany` as root → `not_releasable`, "…is in a private workspace…". Remarks: `prepareRelease`'s preview still lists it; the check runs before the release store's UNFILTERED transaction, not inside it |
| 6 | When the dependent's workspace isn't known (no scope yet), every private dependency is refused | yes | confirmed | The unit test passes. P7: `itemName "@nosuch/x"` → the private-workspace problem; `@team/base` → none |
| 7 | The pickers offer only own-workspace and public items, leak nothing to outsiders, and don't wrongly exclude allowed items | yes | partly | No leaks (P9, paging 33 entries, 0 from beta). But P8: with 1 own draft in acme and 13 newer in beta, `@acme-infra/mineacme` was missing from both pickers. P10 (MySQL/MariaDB): a workspace set to `Public` was offered, and the check then refused it |
| 8 | The tests fail when the rule or the pickers' filter is removed | yes | partly | Rule and catalogue-filter mutants caught. Survived: removing the own-unreleased filter in either picker; `dependencyReports` with its workspace null; `submissionsNamed` returning `private: false` (a submit-time bypass, P2/P3); bulk-submit's incoming `private: false` |
| 9 | The resolver runs as the caller: a dependency the caller can't see is `item_not_found`, with "(asked for by …)"; nothing new revealed; CLI/MCP/API codes unchanged | yes | confirmed | R1: outsider → `item_not_found "@acme-infra/deploy isn't a published item (asked for by @team/front@1.0.0)."`; member resolves. `registry-api.ts:184` still maps it to 404. cli 227, mcp 40, core 328 pass |
| 10 | *Done when*: the resolve tests cover own workspace, public, other private | yes | partly | Only `resolve.test.ts` with a fake registry; no DB test resolved a visible item that depends on a private one |
| 11 | *Done when*: the registry-check and picker tests cover own workspace, public, other private | yes | confirmed | The `registry-checks.test.ts` 093 block and the picker DB test pass; submissions and items domains on SQLite → 421/421 |
| 12 | Works on the three server dialects; typecheck and lint are clean | no | confirmed | `test-db.mjs` → 30/30 each; `tsc --noEmit` → 0; `biome check` → no issues |

**Overall:** not met: the pickers hid allowed own drafts (P8), there was no DB resolve test, and some filters had no test that fails. Fixed: the own-unreleased filter moved into SQL before the limit; "public" matched byte for byte; tests for the pickers' own-items filters, the canvas reports' workspace, an own submission on its way at submit and in a bulk batch, a nearly-public visibility, and an outsider's resolve. Re-checks below.

### Re-check — rows 7, 8 and 10

Witnessed: 2026-10-07 16:34 EDT, by a fresh agent (adversarial). Commit: b9ec3ae + uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | The pickers offer only own-workspace and public items, leak nothing, and don't wrongly exclude allowed items | yes | partly | P8 on all 4 databases: both pickers include `@acme-infra/mineacme`, no beta entries. P11: own published `@beta-tools/ownedbeta` not offered for acme, offered for beta. `Public` no longer offered. Still: `public ` (trailing space) offered on MySQL and MariaDB, since `utf8mb4_bin` pads trailing spaces |
| 8 | The tests fail when the rule or the pickers' filter is removed | yes | partly | 15 of 16 mutants caught (including the own-unreleased SQL filter, `lookupSubNeverPrivate`, `bulkIncomingNeverPrivate`, `collateOff` on MySQL/MariaDB). Survived: `ownPublishedNotPassed` (dropping `dependableFrom` from the own published items' list) |
| 10 | *Done when*: the resolve tests cover own workspace, public, other private | yes | confirmed | The DB test "resolving as the caller (093)": outsider → "…(asked for by @team/front@1.0.0).", member → resolved; fails with the core message reverted and with `resolveAs` unfiltered. postgres, mysql, mariadb 62/62 each |

**Overall:** not met: `public ` was still offered on MySQL/MariaDB, and the own-published filter had no test. Fixed: a binary cast on MySQL and MariaDB; a test for the own published item in both pickers. Second re-check below.

### Re-check — rows 7 and 8 (second)

Witnessed: 2026-10-07 16:40 EDT, by a fresh agent (adversarial). Commit: b9ec3ae + uncommitted working tree (`isPublicWorkspace` uses `cast(... as binary)`; new own-published picker test). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | The pickers offer only own-workspace and public items, leak nothing to outsiders, and don't wrongly exclude allowed items | yes | confirmed | 24/24 on SQLite; with `private-submissions` and `private-items`, 36/36 on postgres, mysql and mariadb; probe output identical on all 4. P10: never offered for `"Public"`, `"public "`, `"PUBLIC"`, `" public"`, `"public\t"` or `"publiс"` (Cyrillic с), offered again once set back to `"public"`. P11, P8 and P9 as before |
| 8 | The tests fail when the rule or the pickers' filter is removed | yes | confirmed | `mutate.py` against 7 suites (81 tests): every applicable mutant fails ≥1 test, `ownPublishedNotPassed` included. `collateOff` and `collateBinOld` fail "offers nothing the check would refuse…" on MySQL and MariaDB. `tsc --noEmit` → 0; `biome check` → clean |

**Overall:** met: every row of the adversarial pass is now confirmed. Remarks that stand: `prepareRelease`'s preview lists a dependent whose dependency turned private (the release refuses it); the release check runs before the store transaction; the API answers `item_not_found` where the spec says `not_found` (task 6); the pickers take `itemName` from the client, so a member can be offered their private workspace's items for a public item, though submit refuses it.

## Task 5 — Visibility setting

Witnessed: 2026-10-07 17:01 EDT, by a fresh agent (blind). Commit: d996a64 + working tree (uncommitted diff, incl. untracked `visibility.db.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The service tests and the dialog test pass | no | confirmed | `pnpm exec vitest run src/server/domains/workspaces src/features/admin-workspaces src/features/admin-audit` → 10 files, 101 passed, including the 5 in `visibility.db.test.ts` and the 093 tests in `admin-workspaces.test.tsx` |
| 2 | The same visibility tests pass on PostgreSQL, MySQL and MariaDB | no | confirmed | `node scripts/test-db.mjs postgres\|mysql\|mariadb visibility.db.test.ts workspaces.db.test.ts` → 21/21 passed on each |
| 3 | New workspace asks Public or Private, with Public chosen by default; private is stored, and an unknown value is refused | yes | confirmed | `WorkspaceDialogs.tsx` radio fieldset; dialog test passes; `models/workspace.ts:53-56` accepts "private"; db test → stored as private, "secret" gives `InvalidWorkspaceVisibilityError` |
| 4 | Root's workspace page shows Make private or Make public; a workspace admin doesn't see it, and `global` doesn't have it | yes | confirmed | `[name]/page.tsx` behind `can(me,"workspaces.manage")`, which is `["root"]`; the page test passes |
| 5 | Only root can change visibility or read the impact; `global` stays public | yes | confirmed | Both service functions call `requirePermission(...,"workspaces.manage")`, and `changeable` refuses global; db test → admin `ForbiddenError`, global `GlobalWorkspaceError`. Removing `requirePermission` → that test fails |
| 6 | Turning private is refused while released items outside the workspace have a listed version that depends on its items; the dependents are listed and the inside dependents are ignored | yes | confirmed | `outsideDependents` joins on `dependent.listed_version_id` with `workspace_id !=`; db test → `["@team/back","@team/front"]`, inside excluded, the error reads "2 items outside acme depend on its items: @team/back, @team/front.", visibility stays public. Disabling the check → the test fails |
| 7 | In the dialog, when there are dependents, Save is disabled and the list is shown ("N items outside acme depend on its items") | yes | confirmed | Probe rendering `VisibilityForm` with a loaded impact → "3 items outside acme depend on its items", the items listed, `<button type="submit" disabled="">Make private`. The dialog test covered only the loading state (since added: a test renders it with dependents loaded) |
| 8 | Open submissions outside that depend on its items are listed as a warning, and turning private is still allowed | yes | confirmed | db test → `openDependents: ["@team/waiting"]`, then setting it private succeeds. Probe → a WARN notice "They'll fail at release" with the submit button enabled |
| 9 | Turning private bumps the catalogue revision and is audited as `workspace.updated` `{name, visibility:"private", from:"public"}` | yes | confirmed | `setVisibility` calls `bumpCatalogueRevision`; db test checks both. Removing the bump or the audit metadata → the test fails |
| 10 | The audit log reads "Made workspace acme private" (and "… public"); a description change still reads as before | yes | confirmed | Probe through `summarize`/`summaryText` → the three lines. No test asserted them (since added in `summary.test.ts`) |
| 11 | Turning public asks first with "Everyone on this instance will see its items and can depend on them", then bumps the revision | yes | confirmed | Dialog test "Make public asks first" passes; the db test checks the revision rises on private → public, with `from:"private"` |
| 12 | Lint and types are clean on the changed areas | no | confirmed | `biome check` on the 4 areas → no fixes; `tsc --noEmit -p apps/web` → no output |

**Overall:** met (row 6 was checked when only the listed version counted; the change to every non-yanked version is in the adversarial re-check): root-only private/public, the refusal while released items outside depend on it (with the list), the open-submission warning, the confirm, the revision bump and the audit all hold, and the tests catch each one breaking. Remarks taken: a dialog test with dependents loaded (Save disabled, the list) and one with only open ones (Save enabled, the warning); the audit lines in `summary.test.ts`; the dialog shows an error instead of staying on "Checking…" when the impact can't be read.

### Adversarial pass

Witnessed: 2026-10-07 17:05 EDT, by a fresh agent (adversarial). Commit: d996a64 (plus the uncommitted working tree as of 17:05). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Service and dialog tests pass on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | `vitest run src/server/domains/workspaces src/features/admin-workspaces src/features/admin-audit` → 102 passed; `node scripts/test-db.mjs postgres\|mysql\|mariadb src/server/domains/workspaces/actions` → 46 passed on each; `tsc --noEmit` clean; biome: no errors |
| 2 | Public → private is refused while released items outside depend on its items, and the list names them | yes | confirmed | `visibility.db.test.ts`; probe on all 4 databases: the list is distinct and sorted, covers dependents of several items, a dependent in another private workspace, deprecated and yanked-latest dependents, and leaves out a dependent inside the same workspace |
| 3 | No released outside item ends up depending on a now-private item (the refusal holds against a concurrent release) | yes | not met | Probe: Make private during the release's `storage.put` (after its checks, before its store transaction) → on all 4 databases the release succeeded, acme private, `version_dependencies` racer→deploy. The check ran outside the transaction; nothing locked the workspace row |
| 4 | Refused while outside released items depend on it, for every installable version | yes | partly | Only `items.listed_version_id` was checked: `@team/old` 1.0.0 (latest 2.0.0 without it) and `@team/nexty`'s `next` tag weren't listed |
| 5 | Open submissions outside that depend on it are listed as a warning (base64 manifest, proposal, latest revision only, drafts not counted) and don't block | yes | confirmed | Probe on all 4 databases: `@team/binary` (base64), `@team/plain`, `@team/base` (a proposal) listed; a draft and a submission whose resubmitted revision dropped the dependency left out; Make private then succeeds |
| 6 | Only root changes visibility or reads the impact (decision 6); there is no API route | yes | confirmed | A workspace admin, moderators of global and acme, a plain user and a signed-out caller all throw on both; nothing changes or is audited. `"workspaces.manage": ["root"]`; no route in `src/app` |
| 7 | `global` stays public | yes | confirmed | `global`, `GLOBAL` and ` global ` → GlobalWorkspaceError for both set and impact; the page hides the actions on global |
| 8 | An invalid visibility from the form is refused, with a correct message | yes | partly | `PRIVATE`, ` private`, `Private` and `1` refused, but the message was "Workspaces are public for now.", and `visibility: ""` made a private workspace public |
| 9 | Both directions bump the catalogue revision and record `workspace.updated` `{ name, visibility, from }`; the log reads "Made workspace acme private/public" | yes | confirmed | Probe event metadata `{"name":"acme","visibility":"private","from":"public"}`, target type workspace; the db test covers both directions; `summary.test.ts` |
| 10 | A no-op change and a refused change are neither audited nor bumped | yes | partly | In sequence, neither. Two roots at once: 1 event on SQLite and PostgreSQL, 2 events and 2 bumps on MySQL and MariaDB (no row lock). Removing the no-op guard left every test green |
| 11 | The tests fail when the outside-dependents check, the root-only checks, the revision bump, the audit or the summary are removed | no | confirmed | Each of those mutations fails a test; the no-op guard wasn't covered (row 10) |
| 12 | Dialog: Make private is disabled while there are released dependents, and lists them; open submissions are only a warning; Make public asks first; a load error shows | yes | confirmed | `admin-workspaces.test.tsx` "Make private lists…" passes and fails when `disabledReason` is forced to null; a render probe shows the error and warning notices and the disabled button; Make public's text |
| 13 | New workspace offers Public and Private radios, Public checked, and private is stored | yes | confirmed | The dialog test; `createWorkspaceFromForm` passes `visibility`; the db test stores private |
| 14 | The button shows only for root: not on global, not for a workspace admin; the page refreshes after the change | yes | confirmed | The page test; `setVisibilityFromForm` calls `revalidatePath("/", "layout")` and the workspace paths |

**Overall:** not met: a release checked before Make private and committed after it still added an outside dependent; older or `next` versions weren't counted; an empty value made a private workspace public; the invalid-value message was stale; two roots at once got duplicate events on MySQL and MariaDB. Fixed: row locks and a re-check inside the release; every non-yanked version counted; `visibilityChoice` takes exactly "public" or "private", with "A workspace is public or private."; tests for each. Re-checks below.

### Re-check — rows 3, 4, 8 and 10, and a new row 15

Witnessed: 2026-10-07 17:15 EDT, by a fresh agent (adversarial). Commit: d996a64 (plus the uncommitted working tree as of 17:15). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | No released outside item ends up depending on a now-private item when a release and Make private overlap | yes | confirmed | Race probe, 3 runs each on SQLite, PostgreSQL, MySQL and MariaDB → "refused: … @acme-infra/deploy is in a private workspace…", `version_dependencies` empty. Removing the re-check fails "refuses a release whose dependency's workspace turned private while it was packing" |
| 4 | Turning private is refused while any non-yanked outside version depends on its items, not only the listed one | yes | confirmed | The impact now includes `@team/old` and `@team/nexty`; switching back to `listed_version_id` fails "counts every version outside that isn't yanked"; SPEC updated |
| 8 | The setter takes exactly "public" or "private", with a correct message | yes | confirmed | `""`, `PRIVATE`, ` private`, `Private`, `1` → "A workspace is public or private."; a private acme stays private given `""`. Swapping `visibilityChoice` back fails "takes only public or private…" |
| 10 | A no-op is neither audited nor bumped, and two roots at once make one change | yes | confirmed | Concurrent probe, 3 runs each on PostgreSQL, MySQL and MariaDB → 1 event, 1 bump. Removing `lockWorkspace` fails the concurrency test on MySQL and MariaDB; removing the no-op guard fails "changes nothing, and records nothing, when it's already so" |
| 15 | No outside version that can become installable again depends on a now-private item | no | not met | `@team/yy` 1.0.0 depends on `@acme-infra/deploy` and is yanked; Make private succeeds; un-yanking `@team/yy@1.0.0` then succeeded with acme still private |

**Overall:** not met (row 15): un-yanking reopened an outside dependency. Fixed: `unyank` reads the version's dependencies' workspaces, locks them (the lock Make private takes) and refuses a private one outside its own (`VersionDependsOnPrivateError`). Second re-check below.

### Re-check — row 15 (second)

Witnessed: 2026-10-07 17:19 EDT, by a fresh agent (adversarial). Commit: d996a64 (plus the uncommitted working tree as of 17:19). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | No outside version that can become installable again depends on a now-private item | yes | confirmed | Un-yank probe on SQLite, PostgreSQL, MySQL and MariaDB: root and a moderator of only `global` both get VersionDependsOnPrivateError "1.0.0 depends on @acme-infra/deploy, which is in a private workspace now, so it stays yanked."; once acme is public again, root's un-yank succeeds. Race: 15 rounds per database of `Promise.allSettled([unyank, Make private])` never end with acme private and 1.0.0 un-yanked. Removing the check fails "keeps yanked a version outside that depends on it, once it's private"; `visibility.db.test.ts` + `src/server/domains/items` → 61 passed on each database |

**Overall:** met: every row of task 5 is now confirmed. Remarks: the release-time and un-yank refusals name the dependency's private workspace to someone who may not see it; the name was public when that version was released, so little is revealed. `openSubmissionsOutside` reads each open submission's manifest separately (N+1), only for root's dialog.

## Task 6 — API and MCP

Witnessed: 2026-10-07 17:40 EDT, by a fresh agent (blind). Commit: 732ee14 + working tree (11 modified files, new `apps/web/src/server/http/private-api.db.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A non-member asking for a private item's GET item, GET version, tarball and resolve gets 404 with the same code and message as an unknown name | yes | confirmed | `vitest run --project db private-api.db` → 4/4. Probe: hidden item → `404 item_not_found "@acme-infra/deploy isn't a published item."`, the same body as unknown `@nope/deploy` once masked; resolve the same with `details.item`. HEAD tarball and `If-None-Match: *` → 404. A plain user with no workspace role → 404 on all four. No token → 401 |
| 2 | A member gets the data: item, version, tarball and resolve | no | confirmed | `private-api.db.test.ts` "gives a member…" → 200 on all four. Probe: root's token → 200 on all four |
| 3 | The registry API reads through the viewer: `itemPageAs`, `findDownloadAs`, `downloadArtifactAs`, `resolveAs` and `searchCatalogueAs` | yes | confirmed | `versions.ts` `tokenContext` builds `viewerOf(user)`; `catalogue.ts:61`. Forcing `root: true` in `tokenContext` → 2 of the API tests fail |
| 4 | Search leaves the private item out for a non-member and shows it to a member | no | confirmed | The API test passes. Probe: `GET /items` with no `q` and `?type=skill` as outsider → `{"items":[]}` |
| 5 | `GET /api/v1/scopes` hides the private workspace's scope from a non-member and lists it for a member and for root | yes | confirmed | The API test passes. Probe: outsider `?q=acme` → `{"scopes":[]}`, member → `acme-infra` role `user`, root → role `root`. The API test still passed with the new repository filter removed, since `listScopes` limits the list to the caller's workspaces; row 6's guard test pins the filter |
| 6 | Every scope repository read takes a Viewer, and a test fails if a read method doesn't filter | yes | confirmed | `kysely-scope-repository.ts` requires `viewer`, filters `scopes()` and `findWorkspace`; the transaction passes it on. The guard checks the method list and probes each read; removing the `scopes()` filter fails it |
| 7 | Holds on all three server dialects | no | confirmed | `node scripts/test-db.mjs postgres\|mysql\|mariadb private-api.db registry-api.db drafts-api.db feeds-api.db visibility-guard.db actions/scopes.db` → 79 passed on each; SQLite the same |
| 8 | SPEC states the API's codes (`item_not_found` / `version_not_found` / `scope_not_found`, same message) instead of a generic `not_found` | yes | confirmed | `git diff SPEC.md`; the answers in row 1 match |
| 9 | The MCP read tools are unchanged in code | yes | confirmed | `git diff main --stat -- packages/mcp packages/cli` → empty. `read-tools.ts` reach the registry only through `connectRegistry(io).api` (HTTP `/items…`) |
| 10 | The MCP read tools are tested against a private item | yes | partly | No test called an MCP tool against a private item. The behaviour holds in a probe (`getItem` and `searchItems` from `packages/mcp/src/read-tools.ts`, `io.fetch` routed to the real handlers): outsider → `item_not_found` as for `@nope/deploy`, search "Nothing matches"; member → the item. Deferring to task 8 is reasonable only if task 8's text says so; it didn't |
| 11 | Nothing else broke: `findScope` action removed, new repository signature | yes | confirmed | `pnpm --filter @ronneai/web typecheck` → clean; `pnpm --filter @ronneai/web test` → 1733 passed, 8 skipped; `biome check` on the changed files → no issues |
| 12 | Note: the removed `findScope` action had no caller | yes | confirmed | `grep -rn "findScope\b" apps/web/src` → only the submissions repository's own `findScope`; typecheck clean |
| 13 | Note: SPEC's Out section records an outside item's yanked version that keeps naming its dependency | yes | confirmed | The new Out bullet in SPEC.md |

**Overall:** not met (row 10): no test runs the MCP read tools against a private item, and task 8's text didn't take that on. Fixed: task 8's text and *Done when* now run `rmk-mcp` end to end against a private item as a member and an outsider (the web app's tests can't load the MCP package); the scopes API test now also checks root (sees it) and a user with no roles (doesn't). Re-check below.

### Re-check — row 10

Witnessed: 2026-10-07 17:50 EDT, by a fresh agent (blind). Commit: 732ee14 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10a | The MCP test against a private item is deferred to task 8, in writing | yes | confirmed | Task 8 runs `rmk-mcp` against a private item as a member and an outsider, and its *Done when* requires it. `e2e/mcp.e2e.ts` runs the built `packages/mcp/dist/bin.js` |
| 10b | The stated reason: "the web app's tests can't load the MCP package" | yes | not met | A scratch db test imported `packages/mcp/src/read-tools` with `fakeIo` and passed (outsider `item_not_found`, member the item) |
| 10c | The scopes test now fails without the repository filter | yes | not met | With the `scopes()` filter removed, `private-api.db` still passed 4/4: `listScopes` already narrows to the caller's workspaces. Only the guard test catches it |
| 10d | The new assertions (root, a user with no roles, an unknown scope) pass on every dialect | yes | confirmed | SQLite 13 passed; PostgreSQL, MySQL, MariaDB `private-api.db` 4 each |

**Overall:** not met (10b, 10c). Fixed: the reason now says the web app doesn't depend on `@ronneai/mcp` and CI runs its tests before `rmk` is built; the note says the guard test, not the scopes API test, pins the filter.

### Re-check — row 10 (second)

Witnessed: 2026-10-07 17:51 EDT, by a fresh agent (blind). Commit: 732ee14 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10a | Task 6's text gives the MCP private-item test to task 8, end to end, and task 8 takes it with a *Done when* | yes | confirmed | Task 6: "their test against a private item is task 8's, end to end"; task 8's *Done when* requires the MCP end-to-end test |
| 10b | The stated reason holds | yes | confirmed | `apps/web/package.json` lists only `@ronneai/core`; `turbo.json` `test` dependsOn `^build`; `ci.yml` runs `pnpm test` before `pnpm build`. The scratch import worked only because `packages/cli/dist` was built locally |
| 10c | The note no longer says the scopes API test catches a missing filter; the guard test pins it | yes | confirmed | Removing the `scopes()` filter → the guard's scope-read test failed, `private-api.db` passed; removing only `findWorkspace`'s → the same guard test failed |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-07 17:48 EDT, by a fresh agent (adversarial). Commit: 732ee14 + uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A non-member's `GET /items/{scope}/{name}` for a private item gives the same answer as an unknown name; a member and root get the item | yes | confirmed | Probe compares status, every header except date, and body, name masked: `acme-infra/deploy`, `nosuch/deploy` and `team/nothing` all `404 \| cache-control=no-store;content-type=application/json \| item_not_found "@X isn't a published item."`. Member and root 200 |
| 2 | Version reads give the same answer as for an unknown name | yes | confirmed | `1.0.0`, `9.9.9`, `latest`, `next` and `%31.0.0` identical for the private item and `@nosuch/deploy` (no `version_not_found` reveals it). Member 200 for 1.0.0, 404 for 9.9.9 |
| 3 | Tarball GET, HEAD and `If-None-Match` don't reveal the item and aren't counted | yes | confirmed | GET, HEAD, `If-None-Match` with the real ETag, `W/` + ETag and `*`: each the same 404 as an unknown name (never 304), `download_count` 0. A member with the ETag gets 304 |
| 4 | Resolve gives the same answer for a private item as for an unknown one, direct, transitive and by dist-tag | yes | confirmed | `^1.0.0`, `latest`, `next`, `1.0.0`, `@ACME-INFRA/…`, and only in `locked`: identical to `@nosuch/deploy`. Through public `@team/front`: `404 item_not_found "…(asked for by @team/front@1.0.0)"`, the same shape as an unknown name. Member 200 |
| 5 | The items list never shows private items to a non-member | no | confirmed | `q=deploy`, `q=acme`, `scope=acme-infra`, `%40acme-infra`, `ACME-INFRA`, `workspace=acme`, `type`, `tool`, `sort`, `limit=100`: the outsider's body never contained "acme"; a member's `nextCursor` used by the outsider returned nothing private |
| 6 | `GET /api/v1/scopes` hides the private scope from non-members | yes | confirmed | `""`, `q=acme`, `q=Acme`, `cursor=acme`, `cursor=a`, `limit=1` gave the outsider only `team`; the member saw `acme-infra` |
| 7 | The drafts API doesn't reveal a private scope or item | no | confirmed | POST with `@acme-infra/newone`, `@acme-infra/deploy`, `@ACME-INFRA/deploy`, and `base: "1.0.0"` → the same `404 scope_not_found` as `@nosuch`; PUT with the private name → the same `draft_mismatch`; `GET /drafts?name=` identical; a dependency on `@acme-infra/deploy` → the same `dependency_not_found` in `submitIssues` and `/drafts/check` as `@nosuch/deploy` |
| 8 | Usage reports are ignored for items the reporter can't see | no | confirmed | The outsider got `202 {"accepted":0,"ignored":1}`, identical to an unknown item, `usage_daily` 0 rows; the member `{"accepted":1,"ignored":0}` |
| 9 | Feeds leak nothing private (task 7's scope) | no | confirmed | marketplace.json for outsider, member and root has no "acme"; the plugin zip (GET, HEAD) answers as an unknown name, not counted. Members lose their private items in feeds until task 7 |
| 10 | Revoked and disabled tokens reveal nothing | no | confirmed | The same `401 token_revoked` / `401 user_disabled` for the private item and an unknown one |
| 11 | Removing a member or turning the workspace private hides the item from the next request; root keeps access | no | confirmed | After deleting the membership: item, resolve and tarball-with-ETag answer as unknown; root 200. Turning private between requests: the 304 path became the same 404. Visibility `"Public "` treated as private |
| 12 | Odd encodings of names don't reveal anything | no | confirmed | `%40acme-infra`, `@acme-infra`, `ACME-INFRA`, `DEPLOY`, `deploy%2F`, `%2540acme-infra`, `acme-infra%20`: the outsider got the same as for `nosuch` on all four databases |
| 13 | It holds on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | `test-db.mjs` on the probes plus private-api, visibility-guard, scopes, drafts-api, registry-api and feeds-api → 88/88 on each; web vitest on SQLite 1733 passed; `tsc` 0; biome clean |
| 14 | The guard test covers the scope repository and fails when a scope filter is removed | yes | confirmed | Removing the filter in `scopes()` or in `findWorkspace` fails it. Remark: the `count` probe's comment named three scopes as two (fixed) |
| 15 | The task's API test answers `not_found` for a non-member and data for a member, and catches a missing filter | yes | confirmed | `private-api.db.test.ts` → 4 passed; with the token viewer `UNFILTERED`, 2 fail. Remark: it compared only with an unknown name in the same scope (an unknown scope is compared now too) |
| 16 | The MCP read tools are tested against a private item | no | partly | No such test in the change. Driven by the witness through the real `createServer` with `fetch` sent to the handlers: `search_items`, `get_item` and `plan_install` gave the outsider the unknown-name answers and the member the item |
| 17 | A non-member can't learn a private item's name through the API | no | partly | A public item's yanked version that depends on `@acme-infra/deploy` (task 5 lets the workspace turn private then) shows `"dependencies":{"@acme-infra/deploy":"^1.0.0"}` on `GET /items/team/yy` and its version; its own `ronne.yaml` names it too |

**Overall:** not met: the planned MCP test was missing, and a yanked outside dependent shows a private item's name. Resolved: task 8's text and *Done when* run `rmk-mcp` end to end against a private item (task 6's text says so); SPEC's Out section records the yanked-version limit. Re-checks below.

### Re-check — rows 16 and 17

Witnessed: 2026-10-07 17:50 EDT, by a fresh agent (adversarial). Commit: 732ee14 + uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 16a | The MCP check against a private item has a task that owns it, with a pass condition that tests it end to end | yes | confirmed | Task 8 runs `rmk-mcp` against a private item as a member and an outsider; its *Done when* requires it. `e2e/mcp.e2e.ts` already starts the real `rmk-mcp` |
| 16b | Task 6's own text matches the move to task 8 | no | not met | Task 6 still said the MCP read tools were "tested against a private item" |
| 16c | The reason given for moving it | yes | partly | "Can't load the MCP package" was too strong: a scratch test loaded it with `rmk`'s `dist` built |
| 17a | The SPEC records the limit | yes | confirmed | The new Out bullet matches `GET /items/team/yy` listing `"@acme-infra/deploy":"^1.0.0"` |
| 17b | Nothing in the private workspace becomes readable through such a version | yes | confirmed | The outsider's `GET /items/acme-infra/deploy` is 404 after Make private; resolving through `@team/front` gives the unknown-name answer; un-yanking `yy` is refused while private |
| 17c | The guard test's comment is fixed, and the API test compares an unknown scope | yes | confirmed | Both files → 10/10 on SQLite, PostgreSQL, MySQL and MariaDB |

**Overall:** not met (16b): task 6's text still promised the MCP test. The move to task 8 and the yanked-version limit were judged acceptable resolutions (the limit narrows the Goal's "they don't exist", recorded in Out for the owner's review).

### Re-check — row 16 (second)

Witnessed: 2026-10-07 17:51 EDT, by a fresh agent (adversarial). Commit: 732ee14 + uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 16b | Task 6's text matches the move to task 8 | yes | confirmed | Task 6 now says "the MCP read tools unchanged in code (they read through this API); their test against a private item is task 8's, end to end"; *Done when* names the `*_not_found` codes. Task 8 holds the test |
| 16c | The reason for the move is accurate | yes | confirmed | `apps/web/package.json` has no `@ronneai/mcp` or `@ronneai/rmk`; `turbo.json` `test` depends on `^build`, so `pnpm test` never builds rmk for the web app; `ci.yml` runs `pnpm test` before `pnpm build`. The note also says the guard test, not the scopes API test, pins the scope filter |

**Overall:** met: every row of task 6 holds. The MCP check against a private item stays open until task 8's end-to-end test passes.

## Task 7 — Plugin feeds

Witnessed: 2026-10-07 18:12 EDT, by a fresh agent (blind). Commit: 0e9ecf8 + the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Each tool's marketplace is cached per visibility key, and public-only callers share one entry | yes | confirmed | `visibilityKey` joins the sorted `privateWorkspaceIds`; `marketplaceSlot` is `tool/key`, or `tool` for the empty key; `marketplace` and `buildRest` both use it. Making `marketplaceSlot` return `tool` → 4 tests fail |
| 2 | Two users with different private workspaces get different marketplaces; neither sees the other's, public-only users see neither | yes | confirmed | Probe (acme and beta, a member each, an outsider, root), all three tools, interleaved so later callers hit the cache: acme member `[acme-infra.deploy, team.style]`, beta member `[beta-tools.lint, team.style]`, outsider `[team.style]`, root all 3. SQLite, PostgreSQL, MySQL, MariaDB (43/43) |
| 3 | Done when: the feed tests cover two keys sharing nothing | yes | partly | The tests used only the keys `""` and `"acme"`: no two different private keys. The behaviour held only in the probe (row 2) |
| 4 | At most 32 keys are kept, least recently used dropped first | yes | confirmed | `MARKETPLACE_CACHE_SLOTS = 32`; `get`/`set` move an entry to the end, `set` drops the oldest; the unit test with max 2 passes |
| 5 | A plugin zip is served only if the caller sees its item; otherwise as for an unknown item, uncounted | yes | confirmed | Test: member 200; outsider 404, body as for an unknown name; count stays 1. Probe: acme's member 404 for beta's zip, beta's 200 |
| 6 | Admin › Settings keeps each tool's largest marketplace of the current revision across keys | yes | confirmed | `recordBuild`: conditional update (older revision, or same revision no larger), then an upsert that leaves a row unchanged. The test passes on all four dialects |
| 7 | `rmk feed build` asks for public workspaces only (`?workspaces=`), or adds the `--workspace` ones (repeated or comma-separated, lower-cased) | yes | confirmed | `feed-build.test.ts` + `feed-workflow.test.ts` → 18 passed; the test records `["", "acme,beta"]`. Server probe: `ACME`, `,acme,`, `%20` behave |
| 8 | A name the caller doesn't see gets `workspace_not_found`, as an unknown name, and nothing is written | yes | confirmed | Test: identical 404 bodies for hidden `acme` and unknown `nosuch`. CLI probe: exit 1, `code: workspace_not_found` in `--json`, no files written |
| 9 | Root may name any private workspace; a mirror never gets root's full view | yes | confirmed | `narrowedViewer` sets `root: false`. Test: root `?workspaces=` → `[team.style]`, `=acme` → acme + team; probe `=beta` → beta + team |
| 10 | With `--workspace`, rmk warns that the mirror repository must stay private | yes | confirmed | Test: stdout has "(acme): keep the repository you push it to private". `--print-workflow … --workspace acme` printed no such warning |
| 11 | Losing access: a removed member, or a workspace turned private, drops those items from the next request | yes | partly | Removed member: test passes. Turned private: a request that loaded its viewer before the change and read the revision after it cached the stale feed under the new revision; the outsider then still saw `open-tools.secret` (its zip 404) |
| 12 | `docs/spec/plugin-feeds.md` is updated | no | confirmed | Visibility in what appears, the zip 404, `?workspaces=`, the cache per key (32, LRU), largest-build stats, `workspace_not_found`, the mirror's `--workspace` |
| 13 | Done when: the 079 benchmark still passes its budget (warm under 5 s at up to 5,000 items) with one key | yes | confirmed | `pnpm bench:feeds --items 1000,5000` → warm at 5,000: 0.72 / 0.58 / 0.57 s; with a real public-only viewer (key `""`) 0.63 / 0.58 / 0.57 s |
| 14 | Changed code lints and type-checks | no | confirmed | `biome check` → no errors (warnings not on changed lines); `tsc --noEmit` for apps/web and packages/cli clean |
| 15 | An older server ignores the `?workspaces=` that rmk now always sends | yes | confirmed | `git show 0e9ecf8:apps/web/src/server/http/feeds-api.ts \| grep -c searchParams` → 0 |
| 16 | The benchmark at 10,000 items: warm about 1.1 s, about 4.8 MiB | yes | confirmed | `pnpm bench:feeds --items 10000 --tools claude-code` → 4922 KiB (96.1%), warm 1.13 s, repeat 0.00 s (cold 32.3 s on a loaded machine; cold isn't in the budget) |
| 17 | `--print-workflow --workspace` adds a keep-private comment; the contract notes an rmk from before 093 sends no `?workspaces=` | yes | confirmed | `feedWorkflow("github"\|"gitlab","0.0.0",["acme"])` line 3 → the comment; none without workspaces. `plugin-feeds.md` says so |

**Overall:** not met (rows 3 and 11). Fixed: `marketplaceAs` reads the revision before the viewer, with a test that turns the workspace private mid-request (fails with the old order); the tests have a second private workspace, beta; `--print-workflow --workspace` adds a keep-it-private comment; the contract notes an older rmk sends no `?workspaces=`. Re-check below.

### Re-check — rows 3 and 11

Witnessed: 2026-10-07 18:17 EDT, by a fresh agent (blind). Commit: 0e9ecf8 + the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Done when: the feed tests cover two keys sharing nothing | yes | confirmed | `private-feeds-api.db.test.ts`: a second private workspace `beta` with its own member; acme's and beta's members each get only their own item on all three tools, and the zips (acme's member 404 for `beta-tools/lint`, beta's 200). Mutation `marketplaceSlot` → `${tool}/private` (acme and beta share a slot) → that test fails; → `tool` → 3 fail. Restored: 42 passed |
| 11 | A workspace turned private drops out of public-only callers' marketplaces from the next request, even when Make private lands mid-request | yes | confirmed | `marketplaceAs` reads `feeds.revision()` before `feedViewer` and pins it. Probe with a Kysely plugin calling `setVisibility(open,"private")` at 3 moments (after the revision read, after the viewer read, on the build's first query after a cache-missing bump), on claude-code and codex: the outsider's next marketplace `["team.style"]`, the member's unchanged. 9/9 on SQLite; 15/15 on PostgreSQL, MySQL, MariaDB. With the old order the probe and the new test both fail. `buildRest` never writes the marketplace cache |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-07 18:20 EDT, by a fresh agent (adversarial). Commit: 0e9ecf8 + working tree as of 18:17 EDT (`git diff | shasum` = fa65c0572aaa); a first copy from 18:04 is noted where it differed. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Each caller's marketplace (three tools) holds exactly what they see, in any order and concurrently | yes | confirmed | Probe P1: 3 rounds × 3 tools × {outsider, member, root, member of both, each also with `?workspaces=`} under `Promise.all` → each its own set, on SQLite, PostgreSQL, MySQL, MariaDB |
| 2 | The cache is kept per visibility key; two private keys share nothing | yes | confirmed | acme's and beta's members each get only their own on all three tools; `marketplaceSlot` → `tool` fails 4 tests; P8: 40 private workspaces and members, concurrent, 2 rounds → each only its own |
| 3 | A visibility change, or a new private workspace, during a request never leaves one key's build under another key | yes | confirmed | P5 (turn `open` private after the viewer's read) and P5b (a new private workspace gets an item then, while root builds): the 18:17 tree passes on all four databases. The 18:04 copy failed both |
| 4 | The background build after the budget runs out stays in its own key | yes | confirmed | P7: the member's first answer empty, `buildRest` in the member's slot → the outsider gets no acme item; the member's next request is complete |
| 5 | LRU eviction keeps at most 32 and never answers another key's build | yes | confirmed | P8 (40 keys) → no mix-up; the unit test passes. Remark: the limit is 32 slots (tool × key), not 32 keys as the docs said |
| 6 | A member removed, or a workspace made private or public between requests, takes effect on the next request | no | confirmed | P4: private → the outsider's marketplace and zip drop it, the member keeps it; public again → back. P6: a removed member's `If-None-Match` → 404 |
| 7 | `?workspaces=` gives the same answer for a hidden name and an unknown one | yes | confirmed | P3: 9 forms (`ACME`, `%20acme%20`, `acme,`, `%61cme`, `global,acme`, …) → the same 404 `workspace_not_found` body, 4 databases. On MySQL/MariaDB `acm%C3%A9`, `%E2%80%8Bacme`, `acme%00` matched `acme` for the member (collation), still 404 for the outsider |
| 8 | `?workspaces=` answers 200 or 404 for any input | yes | partly | PostgreSQL: `?workspaces=acme%00` → unhandled `invalid byte sequence for encoding "UTF8": 0x00` from `findByName`, a 500 (the same for every name) |
| 9 | Root's and a member's narrowed view holds exactly the workspaces named | yes | confirmed | P2: root `=acme` → acme + public; `=beta` → beta; member `acme,global,open` → acme + public; member `acme,beta` → 404; root unnarrowed → all |
| 10 | A plugin zip (GET, HEAD, If-None-Match), even one in storage, isn't served to someone who can't see its item, and the 404 matches an unknown name's | yes | confirmed | P6: after the member's download, the outsider's GET, HEAD, `If-None-Match` and HEAD with it → 404, no ETag, unknown-name body, count stays 1. Remark: with `findPluginAs` unfiltered, the API test still passed |
| 11 | A private item that depends on a public one builds as a plugin for a member | no | confirmed | P6: `@acme-infra/deploy` → `@team/style ^1.0.0`: the member gets 200, both in the zip |
| 12 | Stats keep the revision's largest; an older revision never replaces a newer | yes | confirmed | The test passes on 4 databases; P11: with a row, concurrent 100/900/500/300 at a newer revision → 900 in 10/10 rounds |
| 13 | Concurrent first builds of a tool keep the largest | yes | not met | P9: empty `plugin_feeds`, `Promise.all` of 100/900/500/300 → SQLite 100 every time; the others any size: every UPDATE matches 0 rows, the first INSERT wins |
| 14 | Warnings are logged once per revision across keys, on all 4 databases | yes | partly | P10: 4 keys at once → 1 log; concurrent `markWarned(8)` → one true. But `markWarned(9)`, `markWarned(8)`, `markWarned(9)` → true, true, true: a request on an older revision re-arms the newer one (079's `<>`) |
| 15 | `rmk feed build --workspace` checks names, sends `?workspaces=`, and warns | yes | confirmed | 18 CLI tests pass; `workspacesOf`: `ACME, Beta` → `[acme,beta]`; `acme\nrun: evil`, `$(id)`, `acme;rm`, `--force`, `acme${{ secrets.RMK_TOKEN }}`, `""`, 65 characters → usage error |
| 16 | `--print-workflow` can't be injected and carries `--workspace` | yes | confirmed | Only `[a-z0-9-]` reaches the template; GitHub and GitLab build lines carry `--workspace acme,beta`; the keep-private comment at line 3 |
| 17 | Against an older server, `--workspace` does no harm | yes | confirmed | `main`'s `feeds-api.ts` reads no query string; a pre-093 server has no private workspaces (from code) |
| 18 | The git mirror holds only public workspaces unless `--workspace` names one | yes | partly | Only for rmk ≥ 093: a pre-093 rmk sends no query and gets the full viewer (member → `acme-infra.deploy` included). `plugin-feeds.md` documented it; SPEC.md didn't |
| 19 | The 079 benchmark still passes its budget with one key | yes | confirmed | `pnpm bench:feeds --items 1000,5000 --tools claude-code` → warm 0.73 s at 5,000; with a real public-only viewer 0.53 s SQLite, 1.73 s PostgreSQL |
| 20 | `docs/spec/plugin-feeds.md` updated | no | confirmed | Visibility in content, `?workspaces=`, the zip rule, `workspace_not_found`, per-key cache, the mirror paragraph |

**Overall:** not met (rows 8, 13, 14, 18). Fixed: `recordBuild` retries its conditional update after inserting; `markWarned` only moves forward; an invalid `?workspaces=` name is never looked up (`workspace_not_found`); SPEC says an rmk from before 093 mirrors what its token sees, for the release notes; "32 marketplaces", not keys; the zip test asks HEAD and `If-None-Match` as an outsider (fails with `findPluginAs` unfiltered). Re-check below.

### Re-check — rows 8, 13, 14 and 18

Witnessed: 2026-10-07 18:31 EDT, by a fresh agent (adversarial). Commit: 0e9ecf8 + working tree as of 18:22 EDT (`git diff | shasum` = 06bf44524c72). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8 | `?workspaces=` answers 200 or 404 for any input, the same for hidden and unknown | yes | confirmed | P3b (`acme%00`, 5,000 `a`s, `%F0%9F%98%80`, `acm%C3%A9`, `%E2%80%8Bacme`; outsider and member both 404) → `workspace_not_found` on all 4 databases; MySQL no longer matches `acmé` to `acme`. Removing the `nameProblem` check fails the API test on PostgreSQL and MySQL |
| 13 | Concurrent first builds of a tool keep the largest | yes | confirmed | P9, 30 rounds of 100/900/500/300 on an empty table → 900 × 30 on 4 databases. Removing the second `replace()` fails the new test |
| 14 | A warning is logged once per revision; an older revision can't re-arm it | yes | confirmed | `markWarned(9)`, `(8)` → false, `(9)` → false on 4 databases; three concurrent marks → one true. Reverting to `<>` fails the new test |
| 18 | The git mirror holds only public workspaces unless `--workspace` names one | yes | partly | Documented only, on a wrong premise: every rmk sends `user-agent: rmk/<version>` (`main:packages/cli/src/api.ts:73`), so the server can tell an old rmk's mirror request from Claude Code's |
| 5 | The docs give the limit as 32 marketplaces (a tool's for a key) | yes | confirmed | SPEC.md and plugin-feeds.md |
| 10 | The zip test catches an unfiltered `findPlugin` | yes | confirmed | `findPluginAs` with `UNFILTERED` → the zip test fails |

**Overall:** not met (row 18). Fixed: a request from any rmk without `?workspaces=` is answered for the public workspaces only (Claude Code's unchanged); SPEC, the contract and the note say so, with a test. Re-check below.


### Re-check — row 18 (second)

Witnessed: 2026-10-07 18:36 EDT, by a fresh agent (adversarial). Commit: 0e9ecf8 + working tree as of 18:29 EDT (`git diff | shasum` = f3382d82b6e6). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 18 | The git mirror holds only public workspaces unless `--workspace` names one, an rmk from before 093 included; Claude Code's marketplace still holds what the caller sees | yes | confirmed | `main`'s rmk sends `user-agent: rmk/${rmkVersion()}` and no query. P12 (no `?workspaces=`, root and member): `rmk/0.3.2`, `rmk/0.2.0 (node 22)`, `" rmk/0.3.2"`, `rmk/` → public only; no header, `Claude-Code/2.1.0`, `claude-cli/2.1 (external, cli)`, `curl/8.7.1`, `Mozilla/5.0 rmk/0.3.2`, `RMK/0.3.2` → the full view. With `rmk/0.3.2`, `?workspaces=acme` for root → acme + public. Either order → each its own answer. 21/21 on SQLite, PostgreSQL, MySQL, MariaDB. The `rmk/` branch returning null fails the new test |

**Overall:** met. Remarks: the match is case-sensitive (no rmk sends otherwise; a header only changes the caller's own view); only `feed build` fetches `marketplace.json` in the CLI, and it always sends `?workspaces=`.

## Task 8 — Labels and end-to-end

Witnessed: 2026-10-07 19:11 EDT, by a fresh agent (blind). Commit: 5785bb4 + the uncommitted working tree (17 modified, 3 new files). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A private workspace's item shows a lock icon and "Private · acme" before its name on the card | yes | confirmed | `WorkspaceLabel.tsx` (lock, "Private", " · ", the workspace), used in `ItemCard.tsx`. `vitest run catalogue.test.tsx item-page.test.tsx …` → 70 passed; with the lock branch forced off, both new tests fail |
| 2 | The item page header shows the same lock label | yes | confirmed | `ItemPageView.tsx` uses WorkspaceLabel; the test matches the whole `<h1>` and fails under the same mutation |
| 3 | A public workspace other than global keeps its plain label, and global has none | no | confirmed | `WorkspaceLabel` returns null only for public `global`; `catalogue.test.tsx` checks a public acme entry has no `lucide-lock`; e2e test 3 checks the shelf heading loses "Private" after Make public |
| 4 | `privateWorkspace` comes from `workspaces.visibility` in the catalogue and item repositories (anything but "public" is private) | yes | confirmed | Both repositories select `workspace_visibility`; with either forced to `false`, `private-items.db.test.ts` fails |
| 5 | The Workspace filter lists only the workspaces the viewer sees | yes | confirmed | `inVisibleWorkspace(viewer)` on the workspaces list; the db test expects `["global","acme"]` for member and root, `["global"]` for the outsider; e2e: the member's `#catalogue-workspace` has e2e-vault, the outsider's doesn't |
| 6 | Service tests pass on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | `private-items` + `plugin-feed` → 30 passed on each |
| 7 | The end-to-end test uses two users (a member of e2e-vault and an outsider) on desktop | yes | confirmed | `private-workspaces.e2e.ts` test 1: the member's card, option and h1; the outsider has none, and their 404 text equals `/items/e2e-vault-tools/nothing-here`'s, name masked |
| 8 | The end-to-end test covers phone, phone-webkit and tablet | yes | confirmed | `private-workspaces.mobile.e2e.ts`, a pair per project; `playwright test private-workspaces` on the four projects (scratch copy) → 6 passed |
| 9 | Playwright passes on desktop, phone and phone-webkit (the whole suite) | no | confirmed | Scratch copy: build, `npx playwright test` → 97 passed (2.3m) across chromium, phone, phone-webkit, tablet, wizard and wizard-nojs |
| 10 | Through the MCP end-to-end test, the member sees the private item | yes | confirmed | Test 2 starts the real `packages/mcp/dist/bin.js` after `rmk login` with the member's token: `search_items` lists `@e2e-vault-tools/vault-deploy@1.0.0  skill`, `get_item` returns it |
| 11 | Through the MCP end-to-end test, the outsider gets exactly what an unknown name gets | yes | confirmed | As the outsider: no search result; `get_item` is an error whose text, name masked, equals `@e2e-vault-tools/nothing-here`'s |
| 12 | A non-member gets the same answers as for an unknown name (page, versions, contents, API, download, resolve) | yes | confirmed | `private-items.db.test.ts` on 4 databases; e2e 404 page text |
| 13 | Make private / Make public is root only; its dialog keeps its title and result after the page refreshes | yes | confirmed | Gated by `can(me,"workspaces.manage")` (root only) and `requirePermission` in the services; the `asked` state in `WorkspaceDialogs.tsx`; e2e test 3 passes |
| 14 | The changed code lints and type-checks | no | confirmed | `biome check` on the changed files → no errors; `tsc --noEmit -p apps/web` → 0 |
| 15 | The label has a title saying who sees the item | yes | confirmed | `Only ${workspace}'s members and root see this item.`; the catalogue test expects it |
| 16 | The seed adds e2e-vault (private, a member per project), e2e-shelf (public), users per project, and `privateRoot` as root | yes | confirmed | `users.ts` and `seed.ts` diffs; the e2e runs that depend on them pass |

**Overall:** met. Remarks: the mobile test doesn't check the Workspace filter (the desktop and db tests do); a `?workspace=<any name>` is echoed back as an option, the same for a private and an unknown name.
