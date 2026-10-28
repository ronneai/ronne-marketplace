// A stand-in for SkillSpector in the end-to-end tests (135), called as
//   fake-skillspector.mjs scan <dir> --no-llm --format json
// After three seconds it reports one finding in SKILL.md, as SkillSpector would for a hidden
// instruction.
const report = {
  risk_assessment: { score: 75, severity: "HIGH", recommendation: "DO_NOT_INSTALL" },
  metadata: { skillspector_version: "2.13.2-e2e", llm_requested: false, llm_available: false },
  analysis_completeness: { is_complete: true },
  issues: [
    {
      id: "P2",
      category: "Prompt Injection",
      severity: "HIGH",
      confidence: 0.9,
      pattern: "Hidden Instructions",
      explanation: "A comment tells the agent to do something the skill doesn't say.",
      location: { file: "SKILL.md", start_line: 3 },
    },
  ],
};
// A few seconds, as a real scan takes, so the review page shows it waiting first.
setTimeout(() => {
  process.stdout.write(JSON.stringify(report));
  process.exitCode = 1;
}, 3_000);
