# 158 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A task is ticked only when its latest pass is met with every
claim confirmed. The record lands here, in the same commit as the task. How it works:
[state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Inter and the type scale

Witnessed: 2026-10-31 13:10 -03, by a fresh agent (blind). Commit: 1339fde7 plus the working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `fonts.test.ts` passes | no | confirmed | `vitest run src/app/fonts.test.ts` → 3 tests passed (OFL text, README checksums, no font-service loader) |
| 2 | Inter is self-hosted: Latin subset, `next/font/local`, weights 400–600 | no | confirmed | `fonts.ts` `inter = localFont({src: "./fonts/inter/Inter-Variable-Latin.woff2", weight: "400 600"})`; `layout.tsx:46` applies `inter.variable`; `globals.css:11,124-125` sets the sans font and body weight 400 |
| 3 | Inter's licence and checksum are in place | no | confirmed | `shasum -a 256` of the woff2 → `3100e775…c62`, the value in `fonts/README.md:9`; `inter/OFL.txt` present |
| 4 | Manrope is gone from the code | no | confirmed | folder deleted; `grep -ril manrope` finds only the "replacing Manrope" notes in `fonts.ts` and the README |
| 5 | `globals.css` has the 10 type utilities | no | confirmed | `@utility` blocks `globals.css:136-187`, weights 600/600/600/500/400/500/400/400/500/600 |
| 6 | Page title, badge, sidebar and card use them | no | confirmed | `Panel.tsx:33`, `Badge.tsx:28`, `Sidebar.tsx` (`type-nav`, `type-group-label`), `ItemCard.tsx` (`type-version`, `type-id`, `type-meta`) |
| 7 | OFL is allowed for font files by the dependency policy | no | confirmed | `docs/policies/dependencies.md:18` |

**Overall:** met.

## Task 2 — Monospace only for machine values

Witnessed: 2026-10-31 13:07 -03, by a fresh agent (blind). Commit: 1339fde7 plus the working tree. Machine: macOS (Darwin 27.0.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Emails, dates, counts, sizes, breadcrumbs and labels carry no `font-mono` | no | not met | status prefixes (`Notice.tsx:44`, `ToastCard.tsx:44`, `IssueList.tsx:54`, `nodes.tsx:86,94`, `RiskSummary.tsx:38`), counts (`UsageCard.tsx:226-228`, `UsersPage.tsx:116`, `WorkspacesTable.tsx:147`, `ScanCard.tsx:200`), a size (`VersionsTab.tsx:135`), headings (`OverviewTab.tsx:65,306,325`) and step numbers still mono |
| 2 | Machine values keep mono | no | partly | none found to have lost mono wrongly; only the remaining usages were scanned |
| 3 | The tests pass | no | confirmed | `vitest run src/components/ui src/components/app-shell src/features/admin-audit` → 227 passed |

**Overall:** not met.

### Re-check, Task 2 (round 2)

Witnessed: 2026-10-31 17:30 UTC, by a fresh agent (blind re-check, all claims). Commit: 1339fde7 plus the working tree.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Emails carry no `font-mono` | no | not met | `MemberControls.tsx:247`, `MembersTable.tsx:101`, `ScopesTable.tsx:77` (`mono: true`), `AuditLogPage.tsx:120` |
| 2 | Dates carry no `font-mono` | no | not met | `mono: true` on date columns (`UsersPage`, `FeedbackInbox`, `AuditLogPage`, `ScopesTable`, `SubmissionsTable`), `<Td mono>` in `TokensPage`, `DeviceFlow.tsx:59`, `SubmissionScreen.tsx:202` |
| 3 | Counts and sizes carry no `font-mono` | no | not met | `NewDraftForm.tsx:362`, `BulkSubmit.tsx:153`, `IssuesPopover.tsx:201` |
| 4 | Labels, headings and status text carry no `font-mono` | no | not met | `BulkApprove.tsx:185`, `nodes.tsx:57,213,219`, `WorkspaceSwitcher.tsx:69`, `IssuesPopover.tsx:98`, `OverviewTab.tsx:525` |
| 5 | Machine values kept mono | no | confirmed | the other ~190 uses are names, versions, paths, hashes, codes, commands and inputs |
| 6 | The tests pass | no | confirmed | `pnpm --filter @ronneai/web test` → 474 files, 5713 passed |

**Overall:** not met.

### Re-check, Task 2 (round 3)

Witnessed: 2026-10-31 13:35 -03, by a fresh agent (blind re-check, all claims). Commit: 1339fde7 plus the working tree.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Emails carry no `font-mono` | no | confirmed | `grep -rn font-mono apps/web/src` (non-test): none wraps an email; the email columns lost `mono: true` |
| 2 | Dates and times carry no `font-mono` | no | not met | `mono: true` on `LocalTime` columns: `UsersPage.tsx:281`, `WorkspacesTable.tsx:157`, `QueueTable.tsx:250` (`DataTable.tsx:339` puts `font-mono` on the whole `<td>`) |
| 3 | Counts and numbers carry no `font-mono` | no | not met | `WorkspacesTable.tsx:136` (scopes), `QueueTable.tsx:229` (revision) |
| 4 | Sizes carry no `font-mono` | no | not met | `OverviewTab.tsx:444`: the shared `Row` hard-codes mono on every value, the size included |
| 5 | Labels, headings, prefixes and step numbers carry no `font-mono` | no | partly | removed; three judgement calls (`sha256` caption, scope-picker heading, "/ marketplace") read as defensible |
| 6 | The remaining uses are machine values; none lost mono wrongly | no | confirmed | every other use classified; the diff's `-` lines are all prose, labels or numbers |
| 7 | The tests pass | no | confirmed | `pnpm --filter @ronneai/web test` → 474 files, 5713 passed |

**Overall:** not met.

### Re-check, Task 2 (round 4)

Witnessed: 2026-10-31 13:35 -03, by a fresh agent (blind re-check, all claims, all four routes to mono: the class, the `mono: true` column option, `<Td mono>`, and shared helpers such as `Row`). Commit: 1339fde7 plus the working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | No email is in mono, by any route | no | confirmed | `grep -rn font-mono apps/web/src` → 196 non-test lines, none around an email; email columns lost `mono: true` |
| 2 | No date or time is in mono | no | confirmed | every `LocalTime` column lost `mono: true`; no `LocalTime` in a mono parent |
| 3 | No count, size or revision number is in mono | no | confirmed | `scopes` and `revision` columns lost `mono: true`; `Row` has `plain`, passed for the size (`OverviewTab.tsx:457`) |
| 4 | No breadcrumb, label, heading, prefix or step number is in mono | no | confirmed | removed in the diff; the remaining `Row` caller is a settings list (machine values) |
| 5 | All four routes hold only machine values | no | confirmed | `mono: true` remains on scope names, workspace names, feedback page (a path) and version; `Td mono` on the token preview, workspace names and move `from`/`to` |
| 6 | No machine value lost mono wrongly | no | confirmed | `git diff HEAD -U1` removals read: none is a name, version, path, hash or token; card name and version moved to `type-id`/`type-version`, which are mono |
| 7 | The tests pass | no | confirmed | `pnpm --filter @ronneai/web test` → 474 files, 5713 passed, 20 skipped |

**Overall:** met.

## Task 3 — Card, sidebar and copy button

Witnessed: 2026-10-31 13:10 -03, by a fresh agent (blind). Commit: 1339fde7 plus the working tree. Machine: macOS (Darwin), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Compact card: date in the footer after the installs | no | confirmed | `ItemCard.tsx` footer; `item-card-compact.test.tsx:36-43` |
| 2 | Name 13px/500 mono, two lines, full name on hover | no | confirmed | `type-id` (`globals.css:163`), `line-clamp-2`, `title={name}` |
| 3 | Nav count is a 20px pill showing `99+` above 99 | no | confirmed | `NavCount.tsx`; `AppShell.test.tsx:599` |
| 4 | "/ marketplace" mono, muted at 70%, fades when folded | no | confirmed | `Sidebar.tsx` span; no test for it yet |
| 5 | Group labels Inter 11px 600 | no | confirmed | `type-group-label` (`globals.css:187-192`) |
| 6 | Copy button icon only, label as accessible name | no | confirmed | `CopyableCommand.tsx`; `ui.test.tsx:198` |
| 7 | When copying is blocked ("manual"), text still shows | no | partly | code correct; no test for the manual state |
| 8 | `ScanRequest` and `ScanOverride` have keys | no | confirmed | `SubmissionScreen.tsx:152,162` |
| 9 | The e2e fade assertion follows the scroll position | no | can't check here | not run by the witness (no servers) |

**Overall:** not met: rows 7 and 9.

### Re-check, Task 3

Witnessed: 2026-10-31 13:30 -03, by a fresh agent (blind re-check, all claims; told to read the card test and the font chain). Commit: 1339fde7 plus the working tree. Machine: macOS (Darwin 27), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Date in the footer after the installs, not in the badge row | no | confirmed | `item-card-compact.test.tsx` asserts `metaRow(compact)` has no `<time` and `footer.indexOf("<time") > footer.indexOf("7 installs")` |
| 2 | Nav count is a 20px pill, capped at `99+` | no | confirmed | `NavCount.tsx` (`h-5 min-w-5`, `count > 99 ? "99+"`); `AppShell.test.tsx:605` |
| 3 | "/ marketplace" mono, muted grey, beside the logo | no | confirmed | `Sidebar.tsx:29` `PRODUCT_SUFFIX`; span `font-mono text-xs text-muted/70`, `max-w-0 opacity-0` when folded; test at `AppShell.test.tsx:599` |
| 4 | Group labels are Inter 11px 600 | no | confirmed | `globals.css:11,124` and `fonts.ts:10-12`, `layout.tsx:46` give the chain to Inter |
| 5 | Copy button icon only; text only in the "manual" state | no | confirmed | `CopyableCommand.tsx`; `copyable-command.test.tsx` has a manual-state case |
| 6 | `ScanRequest` and `ScanOverride` have keys | no | confirmed | `SubmissionScreen.tsx` diff |
| 7 | The e2e fade assertion follows the scroll position | no | confirmed | `navigation.mobile.e2e.ts:110-121` reads `scrollLeft`; the implementer's `pnpm test:e2e` run of the final tree (332 passed, including this file's 9 on phone, phone-webkit and tablet) was read by the witness, who did not run it |
| 8 | The tests pass | no | confirmed | `vitest run src/components/catalogue src/components/app-shell src/components/ui src/features/reviews` → 29 files, 293 passed |

**Overall:** met.
