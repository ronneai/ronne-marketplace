# 137 — Security scan: a summary, the details, and a score that blocks approval

> Milestone: M20 · Depends on: 135, 136, 014, 054, 058 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Security scan"), [135 SPEC](../135-skill-scanner/SPEC.md) decision 1 · Contracts: none changed

## Goal

The scan's result is hard to read today: one long panel listing every finding. The owner's redesign
(2026-10-28, a Stitch mock) makes it a **summary card** with the score, the recommendation and the
findings counted by category. All the findings are in a **dialog**. The authors see their own
scan too.

It also turns the scan from advice into a **gate**. Root sets a threshold score in the Security
scan tab, and a revision that scores at or above it can't be approved, except by root's audited
override. This changes 135's decision 1 ("advisory, never blocks").

## Scope

**In:**
- **The summary card**, on the review page and on the author's submission page, in place of 135's
  panel:
  - the recommendation, the severity and the scanner's version, as badges;
  - "{n} findings in {files}": the count and the files they're in;
  - the findings counted by category ("Prompt Injection 3");
  - the score out of 100;
  - what the gate says, when there is a threshold (below);
  - the actions: **Inspect {n} findings** (opens the dialog), **Scan again** (root), and
    **Override** (root, when the gate blocks);
  - the footer: what ran ("Static scan by SkillSpector 2.13.2"), that it can miss problems and flag
    safe code, and a link to the Documentation.
  - The waiting, failed and not-scanned states keep 135's words, in the same card frame.
- **The details dialog:**
  - the header: the severity, the item's name, the scanner's version and the score;
  - one tab per category, with counts, and All;
  - each finding:
    - its severity, title, rule and category;
    - its file and line, which **jump to the code**: the review page's All files view at that line;
    - SkillSpector's explanation, and its **remediation**, kept from now on;
  - **Mark false positive** (reviewers): a finding is dismissed with a required reason. It then shows
    as dismissed, by whom, with the reason, and can be restored;
  - **Export report (JSON)**: Ronne's kept copy of the result (never SkillSpector's raw output),
    with the item's name, the revision, the time and the dismissals, built in the browser;
  - **Close**.
- **Authors see their own scan** on their submission page: the card and the dialog, with no
  Scan again, Override or Mark false positive. They see the dismissals, read-only.
- **The threshold**, in Admin › Settings › Security scan: **Block approval at score**, empty (no
  gate, the default) or 1 to 100. It's audited with the rest of the tab (`settings.skill_scan`).
- **The gate.** With scanning on and a threshold set, the latest revision of a submission whose type
  is scanned can't be approved when:
  - its latest scan finished with a score at or above the threshold;
  - its latest scan is still waiting or running;
  - its latest scan failed; or
  - it has no scan (sent before scanning was on, say).

  This **fails closed** (owner, 2026-10-28): a scan that fails mustn't be a way past the gate. Root can
  Scan again, or override. It holds everywhere a submission is approved:
  - the review page's Approve, which is shown disabled with the reason, as a stale proposal's is;
  - each row of the review queue;
  - Approve many (054), which skips such a row with the reason;
  - and `decide` itself, checked again under the row's lock against the revision approved.
- **Root's scan override:**
  - root approves a blocked submission with a reason (required), recorded as an override;
  - it's audited as `submission.scan_override_approved`, with the score, the threshold and what blocked
    it (`score`, `pending`, `failed` or `none`);
  - moderators can't.
- **Scan again any time** (root): it's no longer only after a failure, so a new scanner version or
  a provider can be tried. It queues a new scan of the same revision; the newest scan is the one
  that counts.

**Out:**
- **Dismissals don't change the score or the gate.** The score is SkillSpector's, computed from all
  its findings, and Ronne can't recompute it. A dismissal is a reviewer's note for the others; root's
  override is the way past the gate.
- **The gate in personal workspaces** (114): a personal workspace's item is approved by its author
  as it's sent, before any scan can finish, and only its owner and root see it. It's still scanned,
  and its author sees the result.
- **The gate on release:** approval is the gate. An approved submission is released as before, and a
  threshold set later doesn't reach back to it.
- **A "Request human review" button** (in the mock): a human review is what the page already is.
- **SkillSpector's code snippets:** they repeat item content the review page already shows.

## Behaviour

**The card's words come from the result**, never from the mock's sample text:
- The title counts the kept findings, plus those cut by the cap, and names the files they point at.
  It shows up to three files, then "and {n} more".
- The category chips are sorted by count, then by name.
- Tones follow the design system:
  - error for **Likely unsafe** and the CRITICAL and HIGH severities;
  - warning for **Look closely** and MEDIUM;
  - muted for **Looks safe** and LOW;
  - the gate's notice is an error when it blocks.

**The gate's words:**
- Blocked by score: "Approval is blocked: the score, {score}, is at or above the threshold,
  {threshold}."
- Blocked while waiting: "Approval waits for the scan to finish."
- Blocked by a failed scan: "Approval is blocked: the scan didn't finish. Scan again, or override."
- Blocked with no scan: "Approval is blocked: this revision wasn't scanned. Scan now, or override."
- Not blocked: "Under the threshold, {threshold}."
- The author reads the same reason, and, when blocked by the score, "Change the files and send it
  again."

**Dismissals:**
- Who may dismiss: whoever may review the submission (a moderator of its workspace, or root), and
  never its author. A finding is dismissed once per scan. Restoring it deletes the dismissal.
- Both are audited, `scan.finding_dismissed` and `scan.finding_restored`, with the finding's rule
  and file, not its text.
- The reason: 1 to 500 characters, plain text.
- A finding is known by its scan and its position in that scan's kept findings, which never change
  once a scan is stored. A new scan has its own dismissals.

**The override and the decisions:**
- `decisionsFor` (058) gains the gate, so the page, the queue and Approve many agree.
- A blocked submission's Approve is disabled, with "Blocked by the security scan".
- Root also sees **Override the scan**, which asks for the reason. It's a decision of its own,
  `scan_override`, and is logged as event kind `scan_override` in the conversation.
- On root's own submission, while the gate blocks, Override the scan takes the place of 054's
  override: one decision, with the reason required.

## Edge cases

- **The threshold changes after a scan:** the gate reads the threshold when the decision is made.
- **Scanning turned off, or the type no longer scanned:** no gate for that submission.
- **No scanner command any more** (the operator dropped it): the gate still blocks unscanned
  revisions. The tab warns that approvals of scanned types need root's override until a scanner is
  back, or until the threshold is cleared.
- **A newer revision is sent while the reviewer looks:** `decide` already refuses a stale revision
  (AUTHZ-2), and the gate is checked against the revision approved.
- **Two scans of one revision** (Scan again): the newest counts, finished or not. While it waits,
  approval waits too.
- **Many findings:** the cap stays at 200. The dialog says how many were cut, and the category
  counts cover only the kept ones.

## Data

- Migration `0039_scan_dismissals`: `scan_dismissals` (`id`, `scan_id` → `content_scans.id` on
  delete cascade, `finding` int, `user_id`, `reason`, `created_at`), unique on (`scan_id`,
  `finding`).
- `instance_settings`: `skill_scan_block_score` (empty or 1–100).
- `content_scans.result`: findings keep `remediation` (cleaned and cut like the other text). Older
  rows have none, and read as before.
- Audit actions: `submission.scan_override_approved`, `scan.finding_dismissed`, `scan.finding_restored`.
- Review event kind: `scan_override`.

## Documentation

- **Security scan** topic (`security-scan`):
  - **Set up the scan** gets the threshold and what it blocks;
  - a new section, **Blocking approval** (`gate`): what blocks, failing closed, root's override,
    and personal workspaces.
- **Submitting and review › The security scan** (`review#security-scan`): the card, the dialog,
  jumping to the code, the export, false positives, authors seeing their scan, and a blocked
  approval.
- **Helpers:**
  - the card's "What is this scan?" stays (`review#security-scan`);
  - the threshold field's "What does the threshold block?" → `security-scan#gate`.

## Acceptance criteria

- [ ] The review page and the author's submission page show the card with the result's real numbers,
  and the dialog lists every kept finding with its explanation and remediation, filtered by category.
- [ ] A finding's file and line open the All files view at that line.
- [ ] The export downloads the kept result, with the dismissals, as JSON.
- [ ] Reviewers dismiss and restore findings with a reason; the author can't; both are audited.
- [ ] With a threshold, a revision at or above it, or with no finished scan, can't be approved from
  the page, the queue, Approve many or `decide`. Tests cover each blocking reason and each path.
- [ ] Root's scan override approves it with a reason and is audited with the score and threshold; a
  moderator's attempt is refused.
- [ ] Without a threshold, or with scanning off, approval is as before.
- [ ] Authors see their own scan and nobody else's.
- [ ] The card, dialog and threshold field are in English, Portuguese and French, use tokens only,
  and pass the phone sweep.
- [ ] The Documentation and helpers above say what the feature does.

## Decisions

1. **The score blocks approval at root's threshold; root alone overrides, with a reason, audited**
   (owner, 2026-10-28). It changes 135's decision 1: the scan was advice, and with a threshold set it
   decides. With none set, the default, it's still advice.
2. **It fails closed** (owner, 2026-10-28): a pending, failed or missing scan blocks too, or making
   the scan fail would get past it.
3. **The dialog has jump to code, the category tabs, the JSON export and Mark false positive** (owner,
   2026-10-28).
4. **Dismissals don't move the score** (Claude): the score is SkillSpector's. A dismissal tells the
   other reviewers; the override is root's decision.
5. **No gate in personal workspaces** (Claude): the author approves on send there (114), before a scan
   can finish, and nobody else installs it.

## Open questions

- Should a dismissal carry over to the next revision's scan when the same finding comes back
  (SkillSpector has a `match_fingerprint`)? Not now: a new revision is new content.
