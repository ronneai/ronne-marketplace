import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import type { Resolver } from "../../scans/models/endpoint";
import type { ProbeTarget } from "../../scans/services/provider-probe";
import { type ScannerConfig, scanSetup } from "../../scans/services/scan-setup";
import {
  InvalidScanCommandError,
  InvalidScanEndpointError,
  InvalidScanKeyError,
  InvalidScanModelError,
  InvalidScanProviderError,
  InvalidScanTimeoutError,
  ScanEndpointCredentialsError,
  ScanEndpointInternalError,
  ScanEndpointNotHttpsError,
  ScanEndpointUnresolvedError,
} from "../exceptions/errors";
import { openScanKey } from "../models/scan-key";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import type { SettingsDeps } from "./settings";
import {
  type ScanSetupInput,
  setSkillScanSetup,
  storedScanSetup,
  testSkillScanConnection,
} from "./skill-scan-setup";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let root: CurrentUser;
let deps: SettingsDeps;
const at = new Date("2026-10-28T12:00:00.000Z");
const AUTH_SECRET = "test-secret-test-secret-test-secret-00";
const KEY = "sk-live-SECRET-0123456789";
const OTHER_KEY = "sk-live-SECRET-9876543210";

const dns: Record<string, string[]> = {
  "api.anthropic.com": ["160.79.104.10"],
  "llm.example.com": ["93.184.215.14"],
  "llm2.example.com": ["93.184.215.15"],
  "inside.example.com": ["10.0.0.9"],
};
const resolve: Resolver = async (host) => {
  const found = dns[host];
  if (!found) throw new Error("ENOTFOUND");
  return found;
};

beforeEach(async () => {
  t = await createTestDb();
  const { id } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  root = { id, email: "root@example.com", name: "Root", role: "root", workspaces: {} };
  deps = { repo: kyselySettingsRepository(t.db, t.dialect), now: () => at };
});
afterEach(() => t.cleanup());

const LIST = JSON.stringify([["/opt/a/scan"], ["/opt/b/scan"]]);
const BLANK: ScanSetupInput = {
  provider: "",
  model: "",
  endpoint: "",
  timeout: "",
  command: "",
  key: "",
  removeKey: false,
};

/** Saves as root, with the setup as it is now under `config`. */
const save = async (
  value: Partial<ScanSetupInput>,
  config: ScannerConfig = { commands: LIST, env: {} },
  user: CurrentUser | null = root,
) => {
  const shown = scanSetup(config, await storedScanSetup(deps.repo), AUTH_SECRET).shown;
  return setSkillScanSetup(
    deps,
    { user, ip: "203.0.113.7" },
    { ...BLANK, ...value },
    { shown, authSecret: AUTH_SECRET, allowedHosts: new Set(["ollama.lan"]), resolve },
  );
};
const stored = () => storedScanSetup(deps.repo);
const keyNow = async () => {
  const { keyEnc } = await stored();
  const { provider, endpoint } = await stored();
  return keyEnc ? openScanKey(AUTH_SECRET, keyEnc, { provider: provider ?? "", endpoint }) : null;
};
const events = async () =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter(
    (e) => e.action === "settings.skill_scan",
  );
const anthropic = { provider: "anthropic", model: "claude-x" };

describe("root's scanner setup (136)", () => {
  it("sets the provider, model, timeout, command and the key, sealed, never returned", async () => {
    const result = await save({ ...anthropic, timeout: "900", command: "1", key: KEY });
    expect(result).toEqual({ changed: true });
    const row = await stored();
    expect(row).toMatchObject({
      provider: "anthropic",
      model: "claude-x",
      timeout: "900",
      command: "1",
    });
    expect(row.endpoint ?? "").toBe("");
    expect(row.keyEnc).toMatch(/^v1\./);
    expect(row.keyEnc).not.toContain(KEY);
    expect(await keyNow()).toBe(KEY);
    const setup = scanSetup({ commands: LIST, env: {} }, row, AUTH_SECRET);
    expect(setup.command).toEqual(["/opt/b/scan"]);
    expect(setup.provider?.variables.ANTHROPIC_API_KEY).toBe(KEY);
    expect(JSON.stringify(setup.shown)).not.toContain("SECRET");
  });

  it("keeps the stored key when the field is left empty, and audits no key change", async () => {
    await save({ ...anthropic, key: KEY });
    expect(await save({ ...anthropic, model: "claude-y" })).toEqual({ changed: true });
    expect(await keyNow()).toBe(KEY);
    const [latest] = await events();
    expect(latest?.metadata).toEqual({
      setup: {
        from: {
          provider: "anthropic",
          model: "claude-x",
          endpointHost: null,
          timeout: null,
          command: null,
        },
        to: {
          provider: "anthropic",
          model: "claude-y",
          endpointHost: null,
          timeout: null,
          command: null,
        },
      },
    });
  });

  it("replaces and removes the key, audited as such", async () => {
    await save({ ...anthropic, key: KEY });
    await save({ ...anthropic, key: OTHER_KEY });
    expect(await keyNow()).toBe(OTHER_KEY);
    await save({ ...anthropic, removeKey: true });
    expect((await stored()).keyEnc).toBe("");
    expect(await keyNow()).toBeNull();
    expect((await events()).map((e) => e.metadata.keyChange)).toEqual([
      "removed",
      "replaced",
      "set",
    ]);
  });

  it("changes nothing, and audits nothing, when nothing changed", async () => {
    await save({ ...anthropic, key: KEY });
    expect(await save({ ...anthropic })).toEqual({ changed: false });
    expect(await events()).toHaveLength(1);
  });

  it("removes a kept key when the provider or the endpoint's origin changes", async () => {
    await save({ ...anthropic, key: KEY });
    await save({ provider: "openai", model: "gpt-x" });
    expect(await keyNow()).toBeNull();
    expect((await events())[0]?.metadata.keyChange).toBe("removed");

    await save({
      provider: "openai_compatible",
      endpoint: "https://llm.example.com/v1",
      key: KEY,
    });
    // The same origin, another path: kept.
    await save({ provider: "openai_compatible", endpoint: "https://llm.example.com/v2" });
    expect(await keyNow()).toBe(KEY);
    // Another host: removed, unless typed again.
    await save({ provider: "openai_compatible", endpoint: "https://llm2.example.com/v2" });
    expect(await keyNow()).toBeNull();
  });

  it("stores the endpoint as checked, and audits its host only", async () => {
    await save({
      provider: "openai_compatible",
      endpoint: "HTTPS://LLM.Example.com:443/v1/../v2?token=QSECRET",
      key: KEY,
    });
    expect((await stored()).endpoint).toBe("https://llm.example.com/v2?token=QSECRET");
    const [event] = await events();
    expect(event?.metadata.setup).toMatchObject({ to: { endpointHost: "llm.example.com" } });
    expect(JSON.stringify(event)).not.toContain("QSECRET");
    expect(JSON.stringify(event)).not.toContain("SECRET");
  });

  it("refuses an endpoint that fails its checks, and changes nothing", async () => {
    const compat = { provider: "openai_compatible", key: KEY };
    for (const [endpoint, error] of [
      ["http://llm.example.com/v1", ScanEndpointNotHttpsError],
      ["https://u:p@llm.example.com/v1", ScanEndpointCredentialsError],
      ["https://inside.example.com/v1", ScanEndpointInternalError],
      ["https://169.254.169.254/", ScanEndpointInternalError],
      ["https://nowhere.example.com/", ScanEndpointUnresolvedError],
      ["https://8.8.8.8\\@169.254.169.254/", InvalidScanEndpointError],
    ] as const)
      await expect(save({ ...compat, endpoint })).rejects.toThrow(error);
    // The operator's host may use http.
    await save({ provider: "ollama", endpoint: "http://ollama.lan:11434" });
    expect((await stored()).endpoint).toBe("http://ollama.lan:11434/");
    expect(await events()).toHaveLength(1);
  });

  it("refuses what isn't valid", async () => {
    await expect(save({ provider: "nope" })).rejects.toThrow(InvalidScanProviderError);
    await expect(save({ provider: "constructor" })).rejects.toThrow(InvalidScanProviderError);
    await expect(save({ ...anthropic, model: "x".repeat(129) })).rejects.toThrow(
      InvalidScanModelError,
    );
    await expect(save({ ...anthropic, model: "a\nb" })).rejects.toThrow(InvalidScanModelError);
    for (const timeout of ["29", "3601", "1.5", "ten"])
      await expect(save({ timeout })).rejects.toThrow(InvalidScanTimeoutError);
    for (const command of ["2", "-1", "x"])
      await expect(save({ command })).rejects.toThrow(InvalidScanCommandError);
    await expect(save({ ...anthropic, key: "a\nb" })).rejects.toThrow(InvalidScanKeyError);
    await expect(save({ ...anthropic, key: "k".repeat(4097) })).rejects.toThrow(
      InvalidScanKeyError,
    );
    // Ollama takes no key.
    await expect(save({ provider: "ollama", key: KEY })).rejects.toThrow(InvalidScanKeyError);
    expect(await events()).toHaveLength(0);
  });

  it("is root's only", async () => {
    const ana: CurrentUser = {
      id: "ana",
      email: "a@example.com",
      name: "Ana",
      role: "user",
      workspaces: {},
    };
    await expect(save({ ...anthropic, key: KEY }, undefined, ana)).rejects.toThrow(ForbiddenError);
    await expect(save({ ...anthropic, key: KEY }, undefined, null)).rejects.toThrow(ForbiddenError);
  });
});

describe("the environment wins (136)", () => {
  const env = {
    command: '["/env/scan"]',
    timeout: "120",
    env: {
      RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "ollama",
      RONNE_SKILL_SCANNER_ENV_OLLAMA_BASE_URL: "http://10.0.0.5:11434",
    },
  };

  it("leaves what the environment sets as root stored it, whatever is sent", async () => {
    await save({ ...anthropic, key: KEY, timeout: "900", command: "0" });
    await save(
      {
        provider: "openai",
        model: "gpt-x",
        key: OTHER_KEY,
        timeout: "60",
        command: "1",
        removeKey: true,
      },
      env,
    );
    expect(await stored()).toMatchObject({
      provider: "anthropic",
      model: "claude-x",
      timeout: "900",
      command: "0",
    });
    expect(await keyNow()).toBe(KEY);
    const setup = scanSetup(env, await stored(), AUTH_SECRET);
    expect(setup.command).toEqual(["/env/scan"]);
    expect(setup.timeoutSeconds).toBe(120);
    expect(setup.provider?.name).toBe("ollama");
    expect(setup.provider?.variables).not.toHaveProperty("ANTHROPIC_API_KEY");
  });
});

describe("the scanner service (156)", () => {
  it("keeps root's command choice when the form is saved while a service is set", async () => {
    await save({ command: "1" });
    // The tab shows no command field then: the form sends none.
    await save({ command: "" }, { url: "http://proxy:8081", commands: LIST, env: {} });
    expect((await stored()).command).toBe("1");
    // Back to the command once the address goes.
    expect(scanSetup({ commands: LIST, env: {} }, await stored(), AUTH_SECRET).command).toEqual([
      "/opt/b/scan",
    ]);
  });
});

describe("what the setup reads back (136)", () => {
  it("reads a key that no longer opens as unreadable, and root can enter it again", async () => {
    await save({ ...anthropic, key: KEY });
    const rotatedByHand = scanSetup(
      { commands: LIST, env: {} },
      await stored(),
      "edited-by-hand-edited-by-hand-0000",
    );
    expect(rotatedByHand.provider).toBeNull();
    expect(rotatedByHand.shown.stored.key).toBe("unreadable");
    await save({ ...anthropic, key: OTHER_KEY });
    expect(await keyNow()).toBe(OTHER_KEY);
  });

  it("runs no command once the operator's list drops root's, until root picks another", async () => {
    await save({ command: "1" });
    const shorter = { commands: JSON.stringify([["/opt/a/scan"]]), env: {} };
    const setup = scanSetup(shorter, await stored(), AUTH_SECRET);
    expect(setup.command).toBeNull();
    expect(setup.shown.commandDropped).toBe(true);
    await save({ command: "0" }, shorter);
    expect(scanSetup(shorter, await stored(), AUTH_SECRET).command).toEqual(["/opt/a/scan"]);
  });

  it("never has the key in a returned value or an audit event", async () => {
    const returned = [
      await save({ ...anthropic, key: KEY }),
      await save({ ...anthropic, key: OTHER_KEY }),
      await save({ ...anthropic, removeKey: true }),
    ];
    const all = JSON.stringify({ returned, events: await events() });
    expect(all).not.toContain("SECRET");
    expect(all).not.toContain("v1.");
  });

  it("never gives the key to a provider another save switched to meanwhile", async () => {
    await save({ provider: "openai_compatible", endpoint: "https://llm.example.com/v1", key: KEY });
    // What a save that read the setup before this one would write: the provider, not the key row.
    await deps.repo.set("skill_scan_provider", "anthropic", root.id, at);
    await deps.repo.set("skill_scan_endpoint", "", root.id, at);
    const setup = scanSetup({ commands: LIST, env: {} }, await stored(), AUTH_SECRET);
    expect(setup.provider).toBeNull();
    expect(setup.shown.stored.key).toBe("unreadable");
    expect(JSON.stringify(setup)).not.toContain("SECRET");
  });
});

describe("Test connection (136)", () => {
  const sent: ProbeTarget[] = [];
  const test = async (
    value: { provider?: string; endpoint?: string; key?: string },
    config: ScannerConfig = { commands: LIST, env: {} },
  ) => {
    const shown = scanSetup(config, await stored(), AUTH_SECRET).shown;
    return testSkillScanConnection(
      deps,
      { user: root, ip: null },
      { provider: value.provider ?? "", endpoint: value.endpoint ?? "", key: value.key ?? "" },
      {
        shown,
        authSecret: AUTH_SECRET,
        allowedHosts: new Set(["ollama.lan"]),
        resolve,
        probe: async (target) => {
          sent.push(target);
          return "refused";
        },
      },
    );
  };
  beforeEach(() => {
    sent.length = 0;
  });

  it("sends the key typed now to the checked addresses only, and says what came back", async () => {
    expect(await test({ provider: "anthropic", key: "sk-typed" })).toEqual({
      result: "refused",
      host: "api.anthropic.com",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url.href).toBe("https://api.anthropic.com/v1/models");
    expect(sent[0]?.headers["x-api-key"]).toBe("sk-typed");
    expect(sent[0]?.addresses).toEqual(["160.79.104.10"]);
  });

  it("uses the stored key only for the provider and endpoint it was typed for", async () => {
    await save({ provider: "openai_compatible", endpoint: "https://llm.example.com/v1", key: KEY });
    await test({ provider: "openai_compatible", endpoint: "https://llm.example.com/v1" });
    expect(sent[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
    // Another host in the form: the stored key isn't sent there.
    await expect(
      test({ provider: "openai_compatible", endpoint: "https://llm2.example.com/v1" }),
    ).rejects.toThrow(InvalidScanKeyError);
    await expect(test({ provider: "openai" })).rejects.toThrow(InvalidScanKeyError);
    expect(sent).toHaveLength(1);
  });

  it("checks the endpoint as a save does, and sends nothing to one refused", async () => {
    await expect(
      test({ provider: "openai_compatible", endpoint: "https://inside.example.com/v1", key: KEY }),
    ).rejects.toThrow(ScanEndpointInternalError);
    await expect(
      test({
        provider: "openai_compatible",
        endpoint: "https://8.8.8.8\\@169.254.169.254/",
        key: KEY,
      }),
    ).rejects.toThrow(InvalidScanEndpointError);
    expect(sent).toHaveLength(0);
    // The operator's host goes through, unpinned: it isn't checked.
    await test({ provider: "ollama", endpoint: "http://ollama.lan:11434" });
    expect(sent[0]).toMatchObject({ addresses: null });
    expect(sent[0]?.url.href).toBe("http://ollama.lan:11434/api/tags");
  });

  it("can't test the environment's provider, and is root's only", async () => {
    const env = { env: { RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "ollama" } };
    await expect(test({ provider: "anthropic", key: KEY }, env)).rejects.toThrow(
      InvalidScanProviderError,
    );
    const shown = scanSetup({ env: {} }, await stored(), AUTH_SECRET).shown;
    await expect(
      testSkillScanConnection(
        deps,
        { user: null, ip: null },
        { provider: "anthropic", endpoint: "", key: KEY },
        {
          shown,
          authSecret: AUTH_SECRET,
          allowedHosts: new Set(),
          resolve,
          probe: async () => "reached",
        },
      ),
    ).rejects.toThrow(ForbiddenError);
    expect(sent).toHaveLength(0);
  });
});
