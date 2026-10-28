# 135 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision and policy

Eight earlier blind passes (2026-10-28, 11:41 to 12:25 EDT) were not met. What they found, all fixed
before this pass:
- the Docker wrapper's container user couldn't read Ronne's `0700` folder on Linux, and then didn't
  map right under rootless Docker;
- the wrapper ignored rootless Docker, because Ronne gives the scanner its own `HOME`;
- the install didn't pin the commit or install from `uv.lock`;
- the installed tree had licences outside §1 (now E-11);
- SkillSpector falls back to `OPENAI_*` when a provider's key is missing, so only the chosen
  provider's variables are passed;
- wording: package counts, a provider that doesn't exist, where settings may live, what static
  scans send to OSV.dev, and the list of allowlist tests.

Witnessed: 2026-10-28 12:28 EDT, by a fresh agent (blind). Commit: 6e8b39e2 (plus the uncommitted Task 1 files). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §12 has a "Security scan" bullet | no | confirmed | `git diff docs/MVP/MVP.md` → "Security scan in review (M20, 135)" under `## 12. Security considerations`: static by default, at most OSV.dev, nothing with `--network none`, semantic only with an operator-set provider plus root's choice, no shell, env allowlist without `DATABASE_URL`/`AUTH_SECRET`, timeout, advisory |
| 2 | MVP.md §15 has a decision-log entry covering the spec's decisions 1–3 | no | confirmed | New "Security scan" row at the end of `## 15. Decision log`: decision 1 (on the server, advisory), 2 (never bundled, operator pins it), 3 (command from `RONNE_SKILL_SCANNER`, never from the web, with the reason); it also matches decision 5 |
| 3 | The dependencies policy lists SkillSpector as an operator-installed tool: Apache-2.0, Python, pinned, not in the pnpm tree or the image | no | confirmed | `dependencies.md:109-116`: "aren't in the pnpm tree, the image or the bundles"; Apache-2.0, Python 3.12+, v2.13.2 at `abd82935…`, `uv sync --frozen`. `ss-src/pyproject.toml:11` → `>=3.12,<3.15`; `git rev-parse HEAD` → `abd82935…`, `git describe` → v2.13.2 |
| 4 | E-11 covers the five non-§1 Python licences and agrees with the note | no | confirmed | E-11 lists certifi, orjson, tqdm, regex, typing_extensions (MPL-2.0 / CNRI-Python / PSF-2.0), allowed (owner, 2026-10-28); same in the note and PLAN Notes; 63 installed / 158 in `uv.lock` everywhere (`grep -c '^\[\[package\]\]' uv.lock` → 158) |
| 5 | docs/features/README.md adds M20 with 135 | no | confirmed | `README.md:362` `### M20 — Security scan`; row 135 depends on 013, 014, 015, 060, 129 (as the SPEC header), "in progress" |
| 6 | Knowledge note: hardening rules | no | confirmed | "The rules Ronne follows" 1–7 match SPEC Behaviour and the acceptance criteria; rule 4's test list matches PLAN task 4 and the SPEC word for word |
| 7 | Knowledge note: pinned install | no | confirmed | Checks out the commit with `--detach`; A is `uv sync --frozen --no-dev --no-editable`, B is `scripts/skill-scanner/Dockerfile` (uv 0.13.0 and the Python base pinned by digest, no git). The pin is the same in the note, policy, Dockerfile header, wrapper `IMAGE=` and `licences.py` |
| 8 | Knowledge note and wrapper: `--network none --read-only --user`, folder mounted read-only | no | confirmed | `sh -n` ok. Wrapper with `RUNTIME=echo`: static → `--network none`, `--user 0:0`, `--read-only`, `-v <dir>:/scan/skill:ro`; semantic with empty `SEMANTIC_NETWORK` → refused, exit 2; with `llmnet` → `--network llmnet`; a non-`scan` call → exit 2 |
| 9 | Knowledge note: semantic analysis | no | confirmed | Matches SPEC Behaviour (prefix, only the chosen provider's variables, only for semantic, the fallback explained, `ANTHROPIC_BASE_URL`/`OPENAI_PROJECT_ID` ignored) and Out; the wrapper's 12 `-e` provider variables are the SPEC table's 12 |
| 10 | Knowledge note: how to upgrade the pin | no | confirmed | "Moving the pin" 1–5; the fixtures README exists |
| 11 | Settings-file statements agree with config.ts | no | confirmed | `config.ts`: the file is `RONNE_ENV_FILE` or `.env`, the environment wins; `run-backup.ts` puts the settings file in the backup, as the note says; `config.ts` reads `RONNE_SKILL_SCANNER`, `_TIMEOUT` and the `_ENV_` prefix |
| 12 | SPEC facts about SkillSpector are right | no | confirmed | `ss-src/README.md:27,409` → 71 patterns in 17 categories; semgrep only in a `pyproject.toml` comment |
| 13 | PLAN, SPEC, MVP, README, policy and note agree | no | confirmed | Static default, semantic opt-in, settings sources, Docker installs out, 63 packages, decisions 1–5, the `instance_settings` keys |
| 14 | Relative links resolve | no | confirmed | `links.mjs` over the six docs → 340 links and anchors; the one flag is pre-existing example text `[words](address)` in backticks at MVP.md:998 |
| 15 | `pnpm witness:check` passes | no | confirmed | `pnpm witness:check; echo $?` → 0 |

**Overall:** met: the decision, policy row, E-11, M20 entry, knowledge note and scripts are present, agree with each other and with SkillSpector v2.13.2 and config.ts.
