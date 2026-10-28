import { describe, expect, it } from "vitest";
import { sealScanKey } from "../../settings/models/scan-key";
import type { StoredScanSetup } from "../../settings/models/skill-scan-policy";
import { parseScannerList, scanCommand, scanSetup } from "./scan-setup";

const AUTH_SECRET = "test-secret-test-secret-test-secret-00";
const NONE: StoredScanSetup = {
  provider: null,
  model: null,
  endpoint: null,
  timeout: null,
  command: null,
  keyEnc: null,
};
const sealed = (key: string, provider = "anthropic", endpoint: string | null = null) =>
  sealScanKey(AUTH_SECRET, key, { provider, endpoint });
const LIST = JSON.stringify([["/opt/a/skillspector-sandbox", "--x"], ["relative"], ["/opt/b/run"]]);

describe("scanSetup: the command (136)", () => {
  it("uses the environment's command over root's choice", () => {
    const setup = scanSetup(
      { command: '["/env/scan"]', commands: LIST, env: {} },
      { ...NONE, command: "2" },
      AUTH_SECRET,
    );
    expect(setup.command).toEqual(["/env/scan"]);
    expect(setup.shown).toMatchObject({ commandFrom: "environment", chosenCommand: null });
  });

  it("uses root's choice from the list, and names each command by its file name only", () => {
    const setup = scanSetup({ commands: LIST, env: {} }, { ...NONE, command: "2" }, AUTH_SECRET);
    expect(setup.command).toEqual(["/opt/b/run"]);
    // The relative one can't be chosen, and keeps its place: the others' indexes don't move.
    expect(setup.shown.commands).toEqual([
      { index: 0, name: "skillspector-sandbox" },
      { index: 2, name: "run" },
    ]);
    expect(JSON.stringify(setup.shown)).not.toContain("--x");
  });

  it("chooses the only command by itself, and none of several until root picks", () => {
    expect(scanSetup({ commands: '[["/only"]]', env: {} }, NONE, AUTH_SECRET).command).toEqual([
      "/only",
    ]);
    expect(scanSetup({ commands: LIST, env: {} }, NONE, AUTH_SECRET).command).toBeNull();
  });

  it("says when root's command was dropped from the list, and runs none", () => {
    for (const command of ["1", "7"]) {
      const setup = scanSetup({ commands: LIST, env: {} }, { ...NONE, command }, AUTH_SECRET);
      expect(setup.command).toBeNull();
      expect(setup.shown).toMatchObject({ commandDropped: true, commandFrom: null });
    }
  });

  it("reads a list that isn't one as empty", () => {
    for (const value of [undefined, "", "nope", "{}", '"/opt/a"'])
      expect(parseScannerList(value)).toEqual([]);
  });
});

describe("scanSetup: the timeout (136)", () => {
  it("takes the environment's, then root's, then 300", () => {
    expect(
      scanSetup({ timeout: "60", env: {} }, { ...NONE, timeout: "900" }, AUTH_SECRET).shown,
    ).toMatchObject({
      timeoutFrom: "environment",
      timeoutSeconds: 60,
    });
    expect(scanSetup({ env: {} }, { ...NONE, timeout: "900" }, AUTH_SECRET).timeoutSeconds).toBe(
      900,
    );
    expect(scanSetup({ env: {} }, { ...NONE, timeout: "10" }, AUTH_SECRET).timeoutSeconds).toBe(
      300,
    );
  });

  it("takes 300 for an environment timeout that isn't valid, as 135 did, not root's", () => {
    const setup = scanSetup({ timeout: "10", env: {} }, { ...NONE, timeout: "900" }, AUTH_SECRET);
    expect(setup.shown).toMatchObject({ timeoutFrom: "environment", timeoutSeconds: 300 });
  });
});

describe("scanSetup: the provider (136)", () => {
  it("builds root's provider with the key opened, for the scanner only", () => {
    const setup = scanSetup(
      { env: {} },
      { ...NONE, provider: "anthropic", model: "claude-x", keyEnc: sealed("sk-ant-1") },
      AUTH_SECRET,
    );
    expect(setup.provider).toEqual({
      name: "anthropic",
      model: "claude-x",
      host: "api.anthropic.com",
      variables: {
        SKILLSPECTOR_PROVIDER: "anthropic",
        SKILLSPECTOR_MODEL: "claude-x",
        ANTHROPIC_API_KEY: "sk-ant-1",
      },
    });
    expect(setup.shown).toMatchObject({ providerFrom: "settings", stored: { key: "set" } });
    expect(JSON.stringify(setup.shown)).not.toContain("sk-ant-1");
  });

  it("uses the environment's provider whenever the operator set any provider variable", () => {
    const setup = scanSetup(
      { env: { RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "ollama" } },
      { ...NONE, provider: "anthropic", keyEnc: sealed("sk-ant-1") },
      AUTH_SECRET,
    );
    expect(setup.provider?.name).toBe("ollama");
    expect(setup.provider?.variables).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(setup.shown.providerFrom).toBe("environment");
    expect(setup.endpointToCheck).toBeNull();
    // Even one the environment gets wrong: the web's never fills in.
    const broken = scanSetup(
      { env: { RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "nope" } },
      { ...NONE, provider: "anthropic", keyEnc: sealed("sk-ant-1") },
      AUTH_SECRET,
    );
    expect(broken.provider).toBeNull();
    expect(broken.shown.providerFrom).toBe("environment");
  });

  it("reads a key another AUTH_SECRET sealed as unreadable: no provider, so scans run static", () => {
    const setup = scanSetup(
      { env: {} },
      { ...NONE, provider: "anthropic", keyEnc: sealed("sk-ant-1") },
      "another-secret-another-secret-0000",
    );
    expect(setup.provider).toBeNull();
    expect(setup.shown.stored.key).toBe("unreadable");
  });

  it("needs Ollama's endpoint from the web, and checks a stored endpoint again", () => {
    expect(
      scanSetup({ env: {} }, { ...NONE, provider: "ollama" }, AUTH_SECRET).provider,
    ).toBeNull();
    const setup = scanSetup(
      { env: {} },
      { ...NONE, provider: "ollama", endpoint: "http://ollama.lan:11434/" },
      AUTH_SECRET,
    );
    expect(setup.provider).toMatchObject({ name: "ollama", host: "ollama.lan:11434" });
    expect(setup.endpointToCheck).toBe("http://ollama.lan:11434/");
  });

  it("counts a provider missing its key, or an unknown one, as none", () => {
    expect(
      scanSetup({ env: {} }, { ...NONE, provider: "openai" }, AUTH_SECRET).provider,
    ).toBeNull();
    expect(
      scanSetup({ env: {} }, { ...NONE, provider: "__proto__" }, AUTH_SECRET).provider,
    ).toBeNull();
  });
});

describe("scanSetup: the key goes only where it was typed for (136)", () => {
  it("never gives a key to another provider, or to another origin, whatever changed the setting", () => {
    const typed = sealed("sk-SECRET", "openai_compatible", "https://llm.example.com/v1");
    const asTyped = {
      ...NONE,
      provider: "openai_compatible",
      endpoint: "https://llm.example.com/v1",
      keyEnc: typed,
    };
    expect(
      scanSetup({ env: {} }, asTyped, AUTH_SECRET).provider?.variables.SKILLSPECTOR_COMPAT_API_KEY,
    ).toBe("sk-SECRET");
    // The same origin, another path: still its endpoint.
    expect(
      scanSetup({ env: {} }, { ...asTyped, endpoint: "https://llm.example.com/v2" }, AUTH_SECRET)
        .provider,
    ).not.toBeNull();
    for (const changed of [
      // A save that raced this one switched the provider and left the key row alone.
      { ...asTyped, provider: "anthropic", endpoint: null },
      { ...asTyped, endpoint: "https://llm2.example.com/v1" },
      { ...asTyped, endpoint: "https://llm.example.com:8443/v1" },
      { ...asTyped, endpoint: "http://llm.example.com/v1" },
    ]) {
      const setup = scanSetup({ env: {} }, changed, AUTH_SECRET);
      expect(JSON.stringify(setup), JSON.stringify(changed.endpoint)).not.toContain("sk-SECRET");
      expect(setup.shown.stored.key).toBe("unreadable");
    }
  });
});

describe("scanCommand (136)", () => {
  it("gives the same command as scanSetup, from the config and root's choice only", () => {
    for (const [config, stored] of [
      [
        { command: '["/env/scan"]', commands: LIST, env: {} },
        { ...NONE, command: "2" },
      ],
      [
        { commands: LIST, env: {} },
        { ...NONE, command: "2" },
      ],
      [
        { commands: LIST, env: {} },
        { ...NONE, command: "1" },
      ],
      [{ commands: '[["/only"]]', env: {} }, NONE],
    ] as const)
      expect(scanCommand(config, stored)).toEqual(scanSetup(config, stored, AUTH_SECRET).command);
  });
});
