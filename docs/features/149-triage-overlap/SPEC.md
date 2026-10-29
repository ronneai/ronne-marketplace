# 149 — Triage: overlap with existing items

> Milestone: M24 · Depends on: 148, 142, 144 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("AI triage") · Contracts: none changed

## Goal

Before a new item is added, the reviewer and the author should know if the registry already has it,
or nearly (owner, 2026-10-29: "looking for redundancy, comparing existing items and new
submissions"). Triage (148) gets a **Similar items** section: what already exists that does the same
thing, and whether to depend on it, propose a change to it instead, or keep both.

## Scope

**In:**
- **Candidates from the search index** (142, with file contents from 144): for each triaged revision,
  Ronne queries the index with the item's name, description, keywords and the first 2 KiB of its
  body file, and takes the top 8 published items of any type, the item itself and a proposal's base
  left out.
- **Only items everyone who sees the result may see** (decision 2):
  - items in `global` and other public workspaces;
  - items in the revision's own workspace;
  - never another private or personal workspace's, even when the requester could see them.
- **Only consenting content goes to the provider:** a candidate from a private workspace is sent only
  if that workspace allows AI providers (147); it always is the revision's own.
- **The model is given** the revision (as 148) and, per candidate, its name, type, description and
  the first 8 KiB of its body file, in their own delimited blocks.
- **The answer** gets an `overlaps` list, at most 8: the candidate's name (only one of those sent;
  any other is dropped), a verdict (`duplicate`, `overlaps`, `related`), an explanation (≤1,000
  characters) and a recommendation (`depend on it`, `propose a change to it`, `keep both`, `merge`).
- **Where it shows:** a **Similar items** section in the Triage tab and a line on the card ("2
  similar items"), each linking to the item page; the author sees it too.
- **Without a search index** (142 off or still building): the section says "Similar items weren't
  checked: search isn't ready", and the rest of the triage runs.

**Out:**
- **Embeddings or a vector index.** The text index finds candidates; the model judges them. Later if
  the index misses too much (an open question below).
- **Overlap among drafts and submissions in review.** Only published items are candidates; two open
  submissions of the same thing are a later feature.
- **Doing anything about it.** The recommendation is advice.

## Behaviour

- Candidates are picked when the run starts, from the index as it is then; the result names the
  version of each candidate it compared.
- A candidate yanked or deprecated (016) since is shown with that badge.
- The index's own score is shown beside the model's verdict, so a reviewer sees both.
- The candidates' text counts toward 148's 200 KiB cap; candidates are cut first.

## Edge cases

- **No candidates:** "Nothing similar was found."
- **The model names an item it wasn't given:** dropped.
- **A candidate becomes private later** (its scope moved, 115): the stored result keeps only its name,
  shown to those who can still see it; others see "an item you can't see".
- **An empty registry:** no candidates, no request beyond 148's.

## Data

- `content_triages.overlaps` (long text, JSON): name, version, verdict, explanation,
  recommendation, index score.

## Documentation

- **AI triage** (`ai-triage#similar-items`): how candidates are found, which workspaces are compared,
  what the verdicts mean.
- **Helper:** the section's "How are similar items found?" → `ai-triage#similar-items`.

## Acceptance criteria

- [ ] A revision whose item closely matches a published one gets it as a candidate and in Similar
  items with a verdict and recommendation.
- [ ] Candidates never include another private or personal workspace's items (tests with a root
  requester and a member of two private workspaces).
- [ ] The model can't add an item that wasn't a candidate.
- [ ] With search unavailable, triage still runs and says similar items weren't checked.
- [ ] Screens in the three languages; the phone sweep passes.
- [ ] The Documentation and inline helper listed above say what the feature does.

## Decisions

1. **Search first, the model second** (Claude): the index is already there (142), costs nothing per
   query, and keeps what reaches the provider small.
2. **Compared only with what every reader may see** (Claude): a result is shown to the author and
   the reviewers; naming an item from a private workspace one of them can't see would leak it.

## Open questions

- If the text index misses paraphrased duplicates in practice, add embeddings to providers (147) and
  a vector column?
