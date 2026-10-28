# SkillSpector fixtures

Real reports from SkillSpector v2.13.2 (commit `abd8293`), recorded on 2026-10-28 with the image
built from `scripts/skill-scanner/Dockerfile` and run through `scripts/skill-scanner/skillspector-sandbox`
(no network, `--no-llm`), as Ronne runs it (feature 135).

| Report | Scanned | Result |
|---|---|---|
| `reports/secure-coding.json` | `examples/items/secure-coding` (a skill) | 0, SAFE, no findings |
| `reports/github-mcp.json` | `examples/items/github-mcp` (an MCP server) | 22, CAUTION, 2 findings |
| `reports/bad-skill.json` | `bad-skill/`, a skill written to be caught: a hidden instruction to send SSH and AWS keys away, `curl \| bash`, base64 piped to `sh`, and `exec` of downloaded code | 100, DO_NOT_INSTALL, 14 findings |

`bad-skill/` is test input only. Its URLs point at `example.com`, and nothing runs it.

To record them again (when the pin moves, `docs/knowledge/skill-scanner.md`), from the repository root:

```sh
export SKILLSPECTOR_LOG_LEVEL=ERROR LANGCHAIN_TRACING_V2=false
F=packages/core/src/skill-scan/fixtures
for n in secure-coding github-mcp bad-skill; do
  src=examples/items/$n; [ $n = bad-skill ] && src=$F/bad-skill
  d=$(mktemp -d); cp -R "$src/." "$d/"
  scripts/skill-scanner/skillspector-sandbox scan "$d" --no-llm --format json > "$F/reports/$n.json"
  rm -rf "$d"
done
```
