import { describe, expect, it } from "vitest";
import { skillScannerFrom } from "./settings";

describe("what settings may show of the scanner setup (135)", () => {
  it("names the provider, its model and host, and never its key or endpoint secrets", () => {
    const shown = skillScannerFrom({
      command: '["/usr/local/bin/skillspector-sandbox"]',
      env: {
        RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "openai_compatible",
        RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_MODEL: "m1",
        RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_COMPAT_API_KEY: "sk-SECRET-KEY",
        RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_COMPAT_BASE_URL:
          "https://user:sk-URLSECRET@llm.example.com:8443/v1?api-key=sk-QSECRET",
      },
    });
    expect(shown).toEqual({
      configured: true,
      provider: { name: "openai_compatible", model: "m1", host: "llm.example.com:8443" },
    });
    expect(JSON.stringify(shown)).not.toContain("SECRET");
  });

  it("says no command is set when it isn't a valid one", () => {
    for (const command of [undefined, "", "/opt/s", '["s"]', "{}"])
      expect(skillScannerFrom({ command, env: {} })).toEqual({ configured: false, provider: null });
  });
});
