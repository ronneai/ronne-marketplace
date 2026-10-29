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

- [ ] **4. Dismissals.** [risky]
  - Migration `0039_scan_dismissals`, a repository, and a service: dismiss with a reason, restore;
    reviewers of the submission only, never its author; audited.
  - Reading a scan: the reviewers of the submission, or its author (authors see their own scan).
  - *Done when:* db tests cover dismiss, restore, the unique finding, a finding index out of range,
    the author and an outsider refused, the cascade when a scan goes, and the audit events, on the
    four databases; the migration's guard test passes.

- [ ] **5. The card, the dialog and the threshold field.**
  - The summary card replaces `ScanPanel` on the review page and shows on the author's submission
    page; the dialog with category tabs, jump to code, remediation, dismiss and restore, and the
    JSON export; the threshold field in the tab.
  - Messages in three languages; tokens only.
  - *Done when:* component tests for each state (waiting, failed, none, clean, blocked, open, author
    view), the export's content, i18n parity, an e2e (fake scanner: a blocked approval, the dialog,
    a dismissal, root's override) and the phone sweep pass.

- [ ] **6. Documentation.** The spec's Documentation section, in ronne-web and here.
  - *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

- **From task 3's re-check (low, root only):** the exemption looks at who wrote the submission,
  not how it reached the personal workspace. An author's submission scanned high in a team scope,
  whose scope then moves into that author's own personal workspace (115), skips the gate: only root
  can approve it there, and does so without the scan override's reason and audit. Narrow the
  exemption (say, to a submission sent there) if the audit trail matters for it.
- `pnpm test:db:<server> -- <paths>` takes several paths here; one witness's shell passed them as
  one string ("No test files found") and ran Vitest with `TEST_DATABASE_URL` instead.

