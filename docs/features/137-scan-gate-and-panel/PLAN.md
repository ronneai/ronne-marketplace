# 137 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md §12's "Security scan in review" and §15's "Security scan" row say a threshold can block
    approval (137); 135's decision 1 points at 137.
  - `docs/features/README.md` lists 137 in M20, and the M20 intro no longer says it never blocks.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [x] **2. Remediation in the kept result.**
  - `parseSkillScan` keeps each finding's `remediation`, cleaned and cut like the other text; older
    stored results without it still read.
  - *Done when:* core tests cover it on the recorded reports, and a stored result without it.

- [x] **3. The threshold and the gate.** [risky]
  - `skill_scan_block_score` in the settings service, saved and audited with the tab.
  - A pure `scanGate` (the policy, the threshold, the submission's type and its latest revision's
    newest scan → open, or blocked with `score`, `pending`, `failed` or `none`).
  - Wired into `decisionsFor`, `decide` (under the lock, against the revision approved), the queue
    rows and Approve many.
  - The `scan_override` decision: root only, reason required, event kind `scan_override`, audit
    `submission.scan_override_approved` with the score, threshold and reason code.
  - Root may Scan again any time.
  - *Done when:* unit tests cover every gate state; db tests cover each approval path blocked and
    open, the override (root allowed, a moderator refused, the reason required), and a threshold
    changed between scan and decision, on the four databases.

- [x] **4. Dismissals.** [risky]
  - Migration `0039_scan_dismissals`, a repository, and a service: dismiss with a reason, restore;
    reviewers of the submission only, never its author; audited.
  - Reading a scan: the reviewers of the submission, or its author (authors see their own scan).
  - *Done when:* db tests cover dismiss, restore, the unique finding, a finding index out of range,
    the author and an outsider refused, the cascade when a scan goes, and the audit events, on the
    four databases; the migration's guard test passes.

- [x] **5. The card, the review page's tabs and the threshold field.**
  - The summary card replaces `ScanPanel` on the review page's Overview and shows on the author's
    submission page (with the findings under it); the review page's tabs (Overview, Files,
    Conversation, Security scan, owner 2026-10-28); the Security scan tab with category filters,
    jump to code, remediation, dismiss and restore, and the JSON export; root's Override on the
    card; "What do these do?" before the decisions; the threshold section in the settings tab.
  - Messages in three languages; tokens only.
  - *Done when:* component tests for each state (waiting, failed, none, clean, blocked, open, author
    view), the tabs and the export's content, i18n parity, an e2e (fake scanner: a blocked
    approval, the Security scan tab, a dismissal, root's override, the author's view), the other
    e2e tests that read the review page, and the phone sweep of every tab pass.

- [x] **6. The findings: by file, and their actions** (owner, 2026-10-29). [risky]
  - The Security scan tab groups the findings by file (their count, a link to the file), sorted by
    line, with a line column, as a code-quality tool's issue list (the owner's SonarQube example);
    filters by category, severity and status (open, marked).
  - On each finding, visible: **Mark false positive** and **Accept the risk** (a mark's kind,
    migration `0040_scan_dismissal_kind`, audited and in the data download), **Ask the author to fix
    it** (one or several findings quoted in a Request changes message), and **Copy link** (a
    permalink that opens and highlights the finding).
  - Then (owner, 2026-10-29): the actions are icons down each finding's right side (the action as
    tooltip, a name unique on the page, token colours, the hand cursor), with modals for a reason
    or a confirmation that can't close while saving and give focus back; the rule and category at
    the bottom; an open row lights under the mouse; the toolbar always shown ("Select all").
  - *Done when:* component tests for the grouping, sorting, filters and each action; db tests for
    the kind (audit, data download, the four databases); the e2e covers accepting a risk and asking
    for a fix; the phone sweep passes; the adversarial pass also re-checks task 4's last three fixes.

- [x] **8. One screen for reviewers and authors** (owner, 2026-10-29). [risky]
  - The author's submission page shows the review page's screen (`SubmissionScreen`): the same
    header, tabs, Overview, Files viewer, Conversation and Security scan, with only the actions
    allowed changing: a reviewer's decisions; the author's Withdraw, Edit files (while it may be
    changed: the editor, with Save and Resubmit), why it was sent back, an archived one's Restore
    and Delete, a proposal's rebase; Publish for whoever may. A draft stays the editor.
  - *Done when:* page tests for both routes (tabs, actions per role, Edit files and the editor);
    the e2e for submitting, withdrawing, requesting changes and releasing pass on the new screen;
    the phone sweep passes.

- [ ] **7. Documentation.** The spec's Documentation section, in ronne-web and here.
  - *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

- **From task 8's last passes (older wording, outside this task):** a personal-workspace item in
  `submitted` (hard to reach: Submit approves it in the same call) still reads "Submitted for
  review…"; in French, `stalePersonal`'s "l'approuve encore" could read "l'approuve de nouveau".

- **From task 3's re-check (low, root only):** the exemption looks at who wrote the submission,
  not how it reached the personal workspace. An author's submission scanned high in a team scope,
  whose scope then moves into that author's own personal workspace (115), skips the gate: only root
  can approve it there, and does so without the scan override's reason and audit. Narrow the
  exemption (say, to a submission sent there) if the audit trail matters for it.
- `pnpm test:db:<server> -- <paths>` takes several paths here; one witness's shell passed them as
  one string ("No test files found") and ran Vitest with `TEST_DATABASE_URL` instead.
- **Task 4 (owner, 2026-10-29):** after six adversarial rounds, each finding fixed with a test, the
  owner chose no further round. The last round's three findings (a NUL in a revision id on
  PostgreSQL, a blank Braille reason, no test for lone surrogates) are fixed in task 4's commit;
  task 4 is ticked once task 6's adversarial pass, which changes the dismissals, re-checks them.
- **For task 6 (from task 5's re-check):** no test renders `/submissions/[id]` as a reviewer; one
  should check there's no "Change the files and send it again.", no findings under the card, and
  the link to the review page's Security scan tab.

