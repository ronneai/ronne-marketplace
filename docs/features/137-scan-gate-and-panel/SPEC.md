# 137 — Security scan: a summary, the details, and a score that blocks approval

> Milestone: M20 · Depends on: 135, 136, 014, 054, 058 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Security scan"), [135 SPEC](../135-skill-scanner/SPEC.md) decision 1 · Contracts: none changed

## Goal

The scan's result is hard to read today: one long panel listing every finding. The owner's redesign
(2026-10-28, a Stitch mock) makes it a **summary card** with the score, the recommendation and the
findings counted by category. The review page becomes **tabs**, as a pull request's (owner,
2026-10-28): Overview, Files, Conversation and Security scan, and every finding is in the Security
scan tab. The authors see their own scan too.

It also turns the scan from advice into a **gate**. Root sets a threshold score in the Security
scan tab, and a revision that scores at or above it can't be approved, except by root's audited
override. This changes 135's decision 1 ("advisory, never blocks").

## Scope

**In:**
- **One screen for reviewers and authors** (owner, 2026-10-29): a submitted item's page is the same
  for whoever reviews it (`/reviews/<id>`) and for its author (`/submissions/<id>`): the header, the
  tabs (Overview, Files, Conversation, Security scan), the Overview's waits-on notice, risk summary,
  card and checks, the Files tab's read-only viewer with its change views, the conversation and the
  findings. Only the actions allowed change:
  - a reviewer: the decisions (each off with its reason when it isn't theirs), the scan's actions;
  - the author: Withdraw; **Edit files** while it may be changed (after changes are requested),
    which opens the editor, with Save and Resubmit, and a way back; why it was sent back, or why it
    can't be changed now; an archived one's Restore and Delete (a removed member is told to rejoin
    to restore it, and, as its status allows, what's left to them); a proposal's rebase. On the author's
    page a decision shows only where one is allowed (root on its own, say);
  - Publish, for whoever may publish.
  A draft is still its editor alone.
- **The summary card**, on the review page and on the author's submission page, in place of 135's
  panel:
  - the recommendation, the severity and the scanner's version, as badges;
  - "{n} findings in {files}": the count and the files they're in;
  - the findings counted by category ("Prompt Injection 3");
  - the score out of 100;
  - what the gate says, when there is a threshold (below);
  - the actions: **Inspect {n} findings** (opens the Security scan tab), **Scan again** (root),
    and **Override** (root, when the gate blocks; it opens the scan override's decision);
  - the footer: what ran ("Static scan by SkillSpector 2.13.2"), that it can miss problems and flag
    safe code, and a link to the Documentation.
  - The waiting, failed and not-scanned states keep 135's words, in the same card frame.
- **The review page's tabs** (owner, 2026-10-28), links with their own address (`?tab=`):
  - above them, whichever is open: the title, the decision buttons with "What do these do?" just
    before them, and a stale proposal's notice (it says why Approve is off);
  - **Overview**, the default: the dependency marks, the risk flags, the scan's card and the checks;
  - **Files** (with its count): the file views, as before; a link to a file or a view (a risk
    flag's, a finding's) opens this tab;
  - **Conversation** (with its count): the thread and the comment form; a decision made on the page
    opens it, so the reviewer sees the decision recorded;
  - **Security scan** (with the count of findings once scanned): every finding, below.
- **The findings** (the Security scan tab; no dialog, owner, 2026-10-28), as a code-quality tool's
  issue list (owner, 2026-10-29, after SonarQube's):
  - **by file**, files by path and those that name none last, each with its count and a link to it
    in the Files tab; in each, **by line** (a line column, `L10`, linked to the line), then the most
    severe first;
  - filters by **category**, **severity** and **status** (open, marked), each with counts, and All;
  - each finding: its severity, title, rule and category, SkillSpector's explanation, and its
    **remediation** ("How to fix:"), kept from now on; a mark shows its kind, by whom, and why;
  - the rule and category at the bottom of the finding; its actions as icons down its right side,
    with no words beside them; those that ask
    for something open a modal (owner, 2026-10-29), which can't be closed while it saves. Each
    icon's tooltip is only its action; its accessible name is unique on the page: the action, the
    title, the file and line, and the finding's number. An open finding's row turns the canvas
    colour under the mouse. The icons show the hand cursor, as buttons do.
    Colours tell them apart, tokens only: teal for Ask and Restore, amber for Accept the risk
    (a warning one keeps), the text colour for Mark false positive, muted for Copy link; never red (none is an error). The actions:
    - **Mark false positive** and **Accept the risk** (reviewers): a modal for the required reason,
      a false positive (the finding is wrong) or an accepted risk (it's real, and known and fine);
      **Restore**, for anyone who may review the submission, after a confirmation;
    - **Ask the author to fix it** (whoever may request changes): Request changes opens with the
      finding quoted (its title, rule, file and line, and the fix); several can be selected, or
      every open one, and asked for in one message, which the reviewer can edit before sending;
      the toolbar's "Ask the author to fix", "Select all" and "Clear the selection" are always
      there: Ask off until something is selected, Select all off with no open finding shown, Clear
      off with nothing held;
    - **Copy link**: copies at once a link to the page at the finding (`#finding-<n>`), which it
      opens and highlights; the icon shows it was copied for a few seconds;
  - **Export report (JSON)**: Ronne's kept copy of the result (never SkillSpector's raw output),
    with the item's name, the revision, the time and the marks, built in the browser.
  - Before a scan has finished, the tab shows the card's state (waiting, failed, not scanned).
- **Authors see their own scan** on their submission page, the review page's screen (task 8): the
  card on the Overview and the findings on the Security scan tab, linked into the Files tab, with
  no Scan again, Override or Mark false positive. They see the dismissals, read-only.
- **The threshold**, in Admin › Settings › Security scan, a section of its own, **Blocking
  approval**, with its helper and a narrow field, **Score that blocks approval**: empty (no gate,
  the default) or a whole number from 1 to 100. Anything else says so under the field and keeps
  Save off; the server refuses it too. It's audited with the rest of the tab
  (`settings.skill_scan`). The tab's intro no longer says the scan never blocks an approval.
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
- **The gate on the owner's own submissions in their personal workspace** (114): those are
  approved by their author as they're sent, before any scan can finish, and only the owner and root
  see them. They're still scanned, and the author sees the result. Anyone else's submission there
  (a scope moved in, 115) is gated like any other.
- **The gate on release:** approval is the gate. An approved submission is released as before, and a
  threshold set later doesn't reach back to it.
- **A "Request human review" button** (in the mock): a human review is what the page already is.
- **The dialog** of the first version of this spec: the Security scan tab replaced it (owner,
  2026-10-28).
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
  - the gate's notice is an error when it blocks by the score, a failed scan or none, and a
    warning while the scan waits or runs (it's about to pass or block).

**The gate's words:**
- Blocked by score: "Approval is blocked: the security scan's score, {score}, is at or above the
  threshold, {threshold}."
- Blocked while waiting: "Approval waits for the security scan to finish."
- Blocked by a failed scan: "Approval is blocked: the security scan didn't finish. Scan again, or
  override."
- Blocked with no scan: "Approval is blocked: this revision wasn't scanned. Scan it, or override."
- Not blocked: "Under the threshold, {threshold}."
- The author reads the same reason, and, when blocked by the score, "Change the files and send it
  again."
- A stored threshold that isn't a whole number from 1 to 100 (only a hand edit can make one) reads
  as none, as the other settings read a broken value as their default.

**Dismissals:**
- Who may dismiss: whoever may review the submission (a moderator of its workspace, or root), and
  never its author. A finding is dismissed once per scan. Restoring it deletes the dismissal.
- Both are audited, `scan.finding_dismissed` and `scan.finding_restored`, with the finding's rule
  and file, not its text; a dismissal with its reason, as a review message is.
- The reason: 1 to 500 characters, plain text, with control and invisible format characters
  removed first (the zero-width joiner stays, so emoji sequences stay whole); a reason with nothing
  visible in it is none.
- Only a finished scan's findings can be marked. Someone who can't see the submission is told the
  finding doesn't exist; its author is told only reviewers mark findings.
- A scan is seen by the submission's author, and by its reviewers while it isn't a draft: one sent
  back to draft (archived, then restored) is its author's alone, as on the review page.
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
- Migration `0040_scan_dismissal_kind`: `scan_dismissals.kind`, `false_positive` (the default, as
  every mark before) or `accepted`; audited with the mark (`metadata.kind`), and in the data
  download as `false_positive` or `accepted_risk`.
- `instance_settings`: `skill_scan_block_score` (empty or 1–100).
- `content_scans.result`: findings keep `remediation` (cleaned and cut like the other text). Older
  rows have none, and read as before.
- Audit actions: `submission.scan_override_approved`, `scan.finding_dismissed`, `scan.finding_restored`.
- The data download (104) includes the reasons a person gave for their marks, as comments of the
  kind `false_positive` or `accepted_risk`, as it includes their review messages.
- Review event kind: `scan_override`.

## Documentation

- **Security scan** topic (`security-scan`):
  - **Set up the scan** gets the threshold and what it blocks;
  - a new section, **Blocking approval** (`gate`): what blocks, failing closed, root's override,
    and personal workspaces.
- **Submitting and review › The security scan** (`review#security-scan`): the card, the Security
  scan tab (by file and line, the filters, the actions as icons with their dialogs, Select all),
  jumping to the code, the export, the marks, authors seeing their scan, and a blocked approval.
- **Submitting and review** (`review`): the author's page is the review page's screen, with Edit
  files to change it after changes are requested.
  It's in **Reviewing** (`review#reviewing`), the changes-requested row of **Statuses**
  (`review#statuses`), and **Decisions** (`review#decisions`): only allowed decisions show on the
  author's page.
- **Knowledge note** (`docs/knowledge/skill-scanner.md`, for maintainers): the gate, the marks and
  the shared screen.
- **Helpers:**
  - the card's "What is this scan?" stays (`review#security-scan`);
  - the threshold field's "What does the threshold block?" → `security-scan#gate`.

## Acceptance criteria

- [ ] The review page and the author's submission page show the card with the result's real numbers,
  and the Security scan tab (on both pages) lists every kept finding with its
  explanation and remediation, filtered by category.
- [ ] The review page has the Overview, Files, Conversation and Security scan tabs, each with its own
  address; the title, decisions and a stale notice stay above them.
- [ ] The author's submission page is the same screen, with the author's actions: Edit files opens
  the editor only while it may be changed; nobody sees a decision they can't make there; a draft is
  the editor.
- [ ] A finding's file and line open the Files tab's All files view at that line.
- [ ] The export downloads the kept result, with the dismissals, as JSON.
- [ ] Reviewers dismiss and restore findings with a reason; the author can't; both are audited.
- [ ] With a threshold, a revision at or above it, or with no finished scan, can't be approved from
  the page, the queue, Approve many or `decide`. Tests cover each blocking reason and each path.
- [ ] Root's scan override approves it with a reason and is audited with the score and threshold; a
  moderator's attempt is refused.
- [ ] Without a threshold, or with scanning off, approval is as before.
- [ ] Authors see their own scan and nobody else's.
- [ ] The card, the tabs, the findings and the threshold field are in English, Portuguese and French,
  use tokens only, and pass the phone sweep (every tab).
- [ ] The Documentation and helpers above say what the feature does.

## Decisions

1. **The score blocks approval at root's threshold; root alone overrides, with a reason, audited**
   (owner, 2026-10-28). It changes 135's decision 1: the scan was advice, and with a threshold set it
   decides. With none set, the default, it's still advice.
2. **It fails closed** (owner, 2026-10-28): a pending, failed or missing scan blocks too, or making
   the scan fail would get past it.
3. **The findings have jump to code, the category filters, the JSON export and Mark false positive**
   (owner, 2026-10-28); they're in the review page's Security scan tab, not a dialog, and the page
   has tabs as a pull request has, with an Overview first (owner, 2026-10-28).
4. **Marks don't move the score** (Claude): the score is SkillSpector's. A dismissal tells the
   other reviewers; the override is root's decision.
5. **No gate on the owner's own submissions in their personal workspace** (Claude): the author
   approves on send there (114), before a scan can finish. Only theirs: someone else's submission
   in a scope moved there (115) is gated, or a workspace admin could approve it past the gate
   (task 3's adversarial pass).
6. **An accepted risk is a mark of its own kind** (owner, 2026-10-29): a false positive says the
   scanner is wrong, an accepted risk that it's right and that's fine; the list, the audit and the
   export tell them apart. Neither moves the score or the gate.
7. **One screen, the actions by role** (owner, 2026-10-29): reviewers and authors see one screen
   (`SubmissionScreen`), so what's shown can't drift between them. The author's files are the
   reviewer's read-only viewer, and Edit files opens the editor while they may change them, rather
   than the editor in the Files tab.

## Open questions

- Should a dismissal carry over to the next revision's scan when the same finding comes back
  (SkillSpector has a `match_fingerprint`)? Not now: a new revision is new content.
