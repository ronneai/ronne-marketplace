import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scanSetup } from "@/server/domains/scans/services/scan-setup";
import { sealScanKey } from "@/server/domains/settings/models/scan-key";
import type {
  ScanSetupShown,
  SkillScanSettings,
  StoredScanSetup,
} from "@/server/domains/settings/models/skill-scan-policy";
import { inLocale } from "@/test/intl";

const settings = vi.hoisted(() => ({
  setSkillScanPolicy: vi.fn(),
  setSkillScanSetup: vi.fn(),
  skillScanSettings: vi.fn(),
  testSkillScanConnection: vi.fn(),
}));
vi.mock("@/server/domains/settings/actions/settings", async (original) => ({
  ...(await original<typeof import("@/server/domains/settings/actions/settings")>()),
  ...settings,
}));
vi.mock("@/server/domains/identity/actions/erase-user", () => ({ adminRetryErasures: vi.fn() }));
vi.mock("@/server/domains/identity/repositories/auth-instance", () => ({ getAppAuth: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const actions = await import("../actions");
const { SkillScanForm } = await import("./SkillScanForm");
const { skillScannerFrom } = await import("@/server/domains/settings/actions/settings");
const { ScanEndpointInternalError } = await import("@/server/domains/settings/exceptions/errors");

const AUTH_SECRET = "test-secret-test-secret-test-secret-00";
const NONE: StoredScanSetup = {
  provider: null,
  model: null,
  endpoint: null,
  timeout: null,
  command: null,
  keyEnc: null,
};
const LIST = JSON.stringify([["/opt/a/skillspector-sandbox", "--secret-arg"], ["/opt/b/run"]]);

/** The page's props as the server builds them, from the operator's config and root's settings. */
const props = (
  config: Parameters<typeof scanSetup>[0],
  stored: Partial<StoredScanSetup> = {},
  authSecret = AUTH_SECRET,
): SkillScanSettings => ({
  policy: { enabled: true, types: ["skill"], analysis: "static" },
  blockScore: null,
  scanner: skillScannerFrom(scanSetup(config, { ...NONE, ...stored }, authSecret)),
  lastVersion: null,
  lastError: null,
  runsStatic: false,
});
const html = (value: SkillScanSettings) => renderToStaticMarkup(<SkillScanForm settings={value} />);
const keyFor = (provider: string, endpoint: string | null = null) =>
  sealScanKey(AUTH_SECRET, "sk-live-SECRET-1", { provider, endpoint });

beforeEach(() => vi.clearAllMocks());

describe("the scanner command (136)", () => {
  it("lists the operator's commands by position and file name, never their arguments", () => {
    const page = html(props({ commands: LIST, env: {} }, { command: "1" }));
    expect(page).toMatch(/<select[^>]*name="command"/);
    expect(page).toContain("1. skillspector-sandbox");
    expect(page).toMatch(/<option value="1" selected="">2. run<\/option>/);
    expect(page).not.toContain("--secret-arg");
    expect(page).not.toContain("/opt/");
  });

  it("names the only command, with nothing to choose", () => {
    const page = html(props({ commands: '[["/opt/a/scan"]]', env: {} }));
    expect(page).toContain("scan, the server&#x27;s only command.");
    expect(page).not.toMatch(/name="command"/);
  });

  it("says a chosen command was dropped from the list", () => {
    const page = html(
      props({ commands: '[["/opt/a/scan"], ["/opt/b/run"]]', env: {} }, { command: "5" }),
    );
    expect(page).toContain("no longer in the server&#x27;s list");
    expect(page).toMatch(/<option value="" selected="">Choose a command<\/option>/);
  });

  it("shows the environment's command as set on the server, with no field", () => {
    const page = html(props({ command: '["/env/scan"]', commands: LIST, env: {} }));
    expect(page).toContain("Set on the server, in RONNE_SKILL_SCANNER.");
    expect(page).not.toMatch(/name="command"/);
  });
});

describe("the provider and its key (136)", () => {
  it("shows root's provider, model and endpoint, and the key only as set, never its value", () => {
    const value = props(
      { commands: LIST, env: {} },
      {
        provider: "openai_compatible",
        model: "m1",
        endpoint: "https://llm.example.com/v1",
        keyEnc: keyFor("openai_compatible", "https://llm.example.com/v1"),
      },
    );
    // The props themselves: no key, and no sealed value either.
    expect(JSON.stringify(value)).not.toContain("SECRET");
    expect(JSON.stringify(value)).not.toContain("v1.");
    const page = html(value);
    expect(page).toMatch(
      /<option value="openai_compatible" selected="">OpenAI-compatible<\/option>/,
    );
    expect(page).toMatch(/name="model"[^>]*value="m1"|value="m1"[^>]*name="model"/);
    expect(page).toContain("https://llm.example.com/v1");
    expect(page).toContain("Key set");
    expect(page).toContain(">Replace<");
    expect(page).toContain(">Remove<");
    // No key field until Replace: nothing a browser could fill in or show.
    expect(page).not.toMatch(/name="key"/);
    expect(page).not.toContain("sk-live-SECRET");
  });

  it("gives an empty password field when there's no key", () => {
    const page = html(props({ commands: LIST, env: {} }, { provider: "anthropic" }));
    const field = page.match(/<input[^>]*name="key"[^>]*>/)?.[0] ?? "";
    expect(field).toContain('type="password"');
    expect(field).toContain('autoComplete="off"');
    // Controlled, and empty: nothing typed, nothing stored shown.
    expect(field).not.toMatch(/value="[^"]/);
    expect(page).not.toContain("Key set");
  });

  it("says a key that can't be read must be entered again, with an empty field", () => {
    const value = props(
      { commands: LIST, env: {} },
      { provider: "anthropic", keyEnc: keyFor("anthropic") },
      "another-secret-another-secret-0000",
    );
    const page = html(value);
    expect(page).toContain("The stored key can&#x27;t be read: enter it again.");
    expect(page.match(/<input[^>]*name="key"[^>]*>/)?.[0]).toContain('type="password"');
  });

  it("asks for an endpoint only where the provider takes one, and a key only where it takes one", () => {
    const anthropic = html(props({ commands: LIST, env: {} }, { provider: "anthropic" }));
    expect(anthropic).not.toMatch(/name="endpoint"/);
    const ollama = html(props({ commands: LIST, env: {} }, { provider: "ollama" }));
    expect(ollama).toMatch(/name="endpoint"[^>]*required=""|required=""[^>]*name="endpoint"/);
    expect(ollama).not.toMatch(/name="key"/);
    const none = html(props({ commands: LIST, env: {} }));
    expect(none).toMatch(/<option value="" selected="">None<\/option>/);
    expect(none).not.toMatch(/name="model"/);
    expect(none).not.toContain("Test connection");
  });

  it("offers Test connection beside root's provider", () => {
    const page = html(props({ commands: LIST, env: {} }, { provider: "anthropic" }));
    expect(page).toContain("Test connection");
    expect(page).toMatch(/formNoValidate=""/);
  });

  it("shows the environment's provider as set on the server, with no fields and no key", () => {
    const env = {
      RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "anthropic",
      RONNE_SKILL_SCANNER_ENV_ANTHROPIC_API_KEY: "sk-env-SECRET",
    };
    const page = html(
      props({ commands: LIST, env }, { provider: "openai", keyEnc: keyFor("openai") }),
    );
    expect(page).toContain("Set on the server: anthropic at api.anthropic.com.");
    expect(page).not.toMatch(/name="provider"|name="key"|name="model"/);
    expect(page).not.toContain("sk-env-SECRET");
    expect(page).not.toContain("sk-live-SECRET");
    expect(page).not.toContain("Test connection");
    const incomplete = html(
      props({ env: { RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "openai" } }),
    );
    expect(incomplete).toContain("Set on the server, but not complete");
  });
});

describe("the timeout (136)", () => {
  it("shows root's timeout, empty for the default, or the environment's read-only", () => {
    expect(html(props({ commands: LIST, env: {} }, { timeout: "900" }))).toMatch(
      /name="timeout"[^>]*value="900"|value="900"[^>]*name="timeout"/,
    );
    expect(html(props({ commands: LIST, env: {} }))).toMatch(/name="timeout"(?![^>]*value="\d)/);
    const env = html(props({ timeout: "120", env: {} }, { timeout: "900" }));
    expect(env).toContain("Set on the server: 120 seconds.");
    expect(env).not.toMatch(/name="timeout"/);
  });
});

describe("the layout (136)", () => {
  it("puts the timeout beside the provider's choice on wider screens, and lets it take digits only", () => {
    const page = html(props({ commands: LIST, env: {} }, { provider: "anthropic" }));
    const row = page.match(
      /<div class="grid gap-3 sm:grid-cols-2[^"]*">([\s\S]*?)<\/select>[\s\S]*?name="timeout"/,
    )?.[0];
    expect(row).toContain('id="scan-provider"');
    expect(row).toContain('name="timeout"');
    expect(page.match(/<input[^>]*name="timeout"[^>]*>/)?.[0]).toContain('pattern="[0-9]*"');
  });
});

describe("in every language (136)", () => {
  it("reads in Portuguese and French", () => {
    const value = props(
      { commands: LIST, env: {} },
      { provider: "anthropic", keyEnc: keyFor("anthropic") },
    );
    const pt = inLocale("pt", () => html(value));
    expect(pt).toContain("Provedor de LLM");
    expect(pt).toContain("Chave definida");
    const fr = inLocale("fr", () => html(value));
    expect(fr).toContain("Fournisseur de LLM");
    expect(fr).toContain("Clé définie");
  });
});

describe("the tab's actions (136)", () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    data.append("types", "skill");
    return data;
  };

  it("saves the setup before the policy, with the key as typed and nothing else of it", async () => {
    settings.setSkillScanSetup.mockResolvedValueOnce({ changed: true });
    settings.setSkillScanPolicy.mockResolvedValueOnce({ changed: false });
    const data = form({
      provider: "anthropic",
      model: "claude-x",
      timeout: "900",
      command: "1",
      key: "sk-typed",
      analysis: "semantic",
      enabled: "on",
    });
    expect(await actions.saveSkillScanPolicy({}, data)).toEqual({ done: "Security scan saved." });
    expect(settings.setSkillScanSetup).toHaveBeenCalledWith(expect.anything(), {
      provider: "anthropic",
      model: "claude-x",
      endpoint: null,
      timeout: "900",
      command: "1",
      key: "sk-typed",
      removeKey: null,
    });
    expect(settings.setSkillScanSetup.mock.invocationCallOrder[0]).toBeLessThan(
      settings.setSkillScanPolicy.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("stops at a setup error, saving no policy, and words it", async () => {
    settings.setSkillScanSetup.mockRejectedValueOnce(new ScanEndpointInternalError());
    const result = await actions.saveSkillScanPolicy(
      {},
      form({ provider: "ollama", analysis: "static" }),
    );
    expect(result.error).toContain("private, loopback or link-local");
    expect(settings.setSkillScanPolicy).not.toHaveBeenCalled();
  });

  it("words Test connection's three answers with the host only", async () => {
    const data = form({ provider: "anthropic", key: "sk-typed" });
    settings.testSkillScanConnection.mockResolvedValueOnce({
      result: "reached",
      host: "api.anthropic.com",
    });
    expect(await actions.testScanConnection({}, data)).toEqual({
      done: "Reached api.anthropic.com.",
    });
    settings.testSkillScanConnection.mockResolvedValueOnce({
      result: "refused",
      host: "api.anthropic.com",
    });
    expect(await actions.testScanConnection({}, data)).toEqual({
      error: "api.anthropic.com refused the key.",
    });
    settings.testSkillScanConnection.mockResolvedValueOnce({ result: "unreachable", host: "h:1" });
    expect(await actions.testScanConnection({}, data)).toEqual({ error: "Couldn't reach h:1." });
    expect(settings.testSkillScanConnection).toHaveBeenLastCalledWith(expect.anything(), {
      provider: "anthropic",
      endpoint: null,
      key: "sk-typed",
    });
  });
});

// The shown setup type is what the page gets: a key could only reach it through these fields.
const _shape: (keyof ScanSetupShown)[] = [
  "commandFrom",
  "commands",
  "chosenCommand",
  "commandDropped",
  "timeoutFrom",
  "timeoutSeconds",
  "providerFrom",
  "providers",
  "stored",
];
