import { describe, expect, it } from "vitest";
import { scanSetup } from "../../scans/services/scan-setup";
import { sealScanKey } from "../models/scan-key";
import type { StoredScanSetup } from "../models/skill-scan-policy";
import { skillScannerFrom } from "./settings";

const NONE: StoredScanSetup = {
  provider: null,
  model: null,
  endpoint: null,
  timeout: null,
  command: null,
  keyEnc: null,
  url: null,
  urlGated: null,
  semanticUrl: null,
  semanticUrlGated: null,
};
const AUTH_SECRET = "test-secret-test-secret-test-secret-00";

describe("what settings may show of the scanner setup (135, 136)", () => {
  it("names the provider, its model and host, and never its key or endpoint secrets", () => {
    const shown = skillScannerFrom(
      scanSetup(
        {
          command: '["/usr/local/bin/skillspector-sandbox"]',
          env: {
            RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "openai_compatible",
            RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_MODEL: "m1",
            RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_COMPAT_API_KEY: "sk-SECRET-KEY",
            RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_COMPAT_BASE_URL:
              "https://user:sk-URLSECRET@llm.example.com:8443/v1?api-key=sk-QSECRET",
          },
        },
        NONE,
        AUTH_SECRET,
      ),
    );
    expect(shown).toMatchObject({
      configured: true,
      provider: { name: "openai_compatible", model: "m1", host: "llm.example.com:8443" },
      setup: { commandFrom: "environment", providerFrom: "environment" },
    });
    expect(JSON.stringify(shown)).not.toContain("SECRET");
  });

  it("never shows a key root stored, only that one is set", () => {
    const shown = skillScannerFrom(
      scanSetup(
        { commands: '[["/opt/s"]]', env: {} },
        {
          ...NONE,
          provider: "anthropic",
          model: "claude-x",
          keyEnc: sealScanKey(AUTH_SECRET, "sk-ant-SECRET", {
            provider: "anthropic",
            endpoint: null,
          }),
        },
        AUTH_SECRET,
      ),
    );
    expect(shown.provider).toEqual({
      name: "anthropic",
      model: "claude-x",
      host: "api.anthropic.com",
    });
    expect(shown.setup?.stored.key).toBe("set");
    expect(JSON.stringify(shown)).not.toContain("SECRET");
    expect(JSON.stringify(shown)).not.toContain("v1.");
  });

  it("says no command is set when it isn't a valid one", () => {
    for (const command of [undefined, "", "/opt/s", '["s"]', "{}"])
      expect(skillScannerFrom(scanSetup({ command, env: {} }, NONE, AUTH_SECRET))).toMatchObject({
        configured: false,
        provider: null,
      });
  });
});
