import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillScanSettings } from "@/server/domains/settings/models/skill-scan-policy";
import { inLocale } from "@/test/intl";
import admin from "../../../../messages/en/admin.json";

const settings = vi.hoisted(() => ({ setSkillScanPolicy: vi.fn(), skillScanSettings: vi.fn() }));
vi.mock("@/server/domains/settings/actions/settings", () => settings);
vi.mock("@/server/domains/identity/actions/erase-user", () => ({ adminRetryErasures: vi.fn() }));
vi.mock("@/server/domains/identity/repositories/auth-instance", () => ({ getAppAuth: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const actions = await import("../actions");
const { SkillScanForm } = await import("./SkillScanForm");
const { SemanticConfirm, confirmsSemantic } = await import("./SemanticConfirm");
const { SkillScanNotConfiguredError } = await import("@/server/domains/settings/exceptions/errors");

const base: SkillScanSettings = {
  policy: { enabled: false, types: ["skill"], analysis: "static" },
  scanner: { configured: true, provider: null },
  lastVersion: null,
  lastError: null,
  runsStatic: false,
};
const html = (value: Partial<SkillScanSettings>) =>
  renderToStaticMarkup(<SkillScanForm settings={{ ...base, ...value }} />);

beforeEach(() => vi.clearAllMocks());

describe("Admin › Settings › Security scan (135)", () => {
  it("says no scanner is set up, and keeps the switch and semantic off", () => {
    const page = html({ scanner: { configured: false, provider: null } });
    expect(page).toContain("No scanner is set up on this server");
    expect(page).toContain("RONNE_SKILL_SCANNER");
    expect(page).toMatch(/<input type="checkbox" disabled=""[^>]*name="enabled"/);
    expect(page).toMatch(/<input type="radio" disabled=""[^>]*name="analysis" value="semantic"/);
  });

  it("shows the scanner set up, its last version and its last error", () => {
    const page = html({ lastVersion: "2.13.2", lastError: "timeout" });
    expect(page).toContain("The scanner is set up on this server.");
    expect(page).toContain("The last scan that finished used SkillSpector 2.13.2.");
    expect(page).toContain("The last scan didn&#x27;t finish: it ran past the timeout");
  });

  it("names where semantic analysis sends the files, never a key", () => {
    const page = html({
      scanner: {
        configured: true,
        provider: { name: "ollama", model: "qwen3-coder:30b", host: "10.0.0.5:11434" },
      },
    });
    expect(page).toContain("sent to ollama at 10.0.0.5:11434 (qwen3-coder:30b)");
    expect(page).not.toMatch(
      /<input type="radio" disabled=""[^>]*name="analysis" value="semantic"/,
    );
  });

  it("words the last error in each language, an exit code included", () => {
    expect(html({ lastError: "exit 2" })).toContain("it exited with code 2");
    expect(inLocale("pt", () => html({ lastError: "not found" }))).toContain(
      "o comando do verificador não foi encontrado",
    );
    expect(inLocale("fr", () => html({ lastError: "output too large" }))).toContain(
      "elle a produit trop de sortie",
    );
    // A code this page doesn't know is shown as written, never blank.
    expect(html({ lastError: "something new" })).toContain("finish: something new");
  });

  it("leaves out the model when the provider has none", () => {
    const noModel = {
      configured: true,
      provider: { name: "ollama", model: null, host: "localhost:11434" },
    };
    expect(html({ scanner: noModel })).toContain("sent to ollama at localhost:11434.");
    for (const locale of ["en", "pt", "fr"] as const)
      expect(inLocale(locale, () => html({ scanner: noModel }))).not.toContain(
        "localhost:11434 ()",
      );
  });

  it("shows a model even when it's named none", () => {
    const page = html({
      scanner: { configured: true, provider: { name: "ollama", model: "none", host: "h:1" } },
    });
    expect(page).toContain("sent to ollama at h:1 (none).");
  });

  it("renders the confirmation naming the provider and host, only when switching", () => {
    const provider = { name: "openai", model: null, host: "api.openai.com" };
    const shown = renderToStaticMarkup(
      <SemanticConfirm saved="static" chosen="semantic" provider={provider} />,
    );
    expect(shown).toContain("sent to openai at api.openai.com. Save to confirm.");
    expect(
      renderToStaticMarkup(
        <SemanticConfirm saved="semantic" chosen="semantic" provider={provider} />,
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(<SemanticConfirm saved="static" chosen="semantic" provider={null} />),
    ).toBe("");
    expect(
      inLocale("fr", () =>
        renderToStaticMarkup(
          <SemanticConfirm saved="static" chosen="semantic" provider={provider} />,
        ),
      ),
    ).toContain("openai sur api.openai.com");
  });

  it("asks root to confirm only when switching to semantic with a provider", () => {
    expect(confirmsSemantic("static", "semantic", true)).toBe(true);
    expect(confirmsSemantic("semantic", "semantic", true)).toBe(false);
    expect(confirmsSemantic("static", "static", true)).toBe(false);
    expect(confirmsSemantic("static", "semantic", false)).toBe(false);
  });

  it("words the confirmation with the provider and the host", () => {
    const en = createTranslator({
      locale: "en",
      messages: { admin },
      namespace: "admin.settings.scan",
    } as never) as unknown as (key: string, values: Record<string, string>) => string;
    expect(en("analysis.warning", { provider: "openai", host: "api.openai.com" })).toBe(
      "From now on, each scanned submission's files are sent to openai at api.openai.com. Save to confirm.",
    );
  });

  it("says scans run static when the provider went", () => {
    expect(
      html({ policy: { enabled: true, types: ["skill"], analysis: "semantic" }, runsStatic: true }),
    ).toContain("no provider is set up on the server any more: scans run static");
  });

  it("lists every item type, the picked ones checked, and Save off until something changed", () => {
    const page = html({ policy: { enabled: true, types: ["skill", "agent"], analysis: "static" } });
    expect(page).toMatch(/<input type="checkbox"[^>]*name="types" checked="" value="skill"/);
    expect(page).toMatch(/<input type="checkbox"[^>]*name="types" checked="" value="agent"/);
    expect(page).toMatch(/<input type="checkbox"[^>]*name="types" value="rule"\/>/);
    expect(page).toMatch(/<button[^>]*disabled=""[^>]*>Save/);
  });

  it("reads in Portuguese and French", () => {
    expect(inLocale("pt", () => html({}))).toContain("Verificação de segurança");
    expect(inLocale("fr", () => html({}))).toContain("Analyse de sécurité");
  });

  it("saves the switch, the types and the analysis, and words a domain error", async () => {
    settings.setSkillScanPolicy.mockResolvedValueOnce({ changed: true });
    const data = new FormData();
    data.set("enabled", "on");
    data.append("types", "skill");
    data.append("types", "agent");
    data.set("analysis", "static");
    expect(await actions.saveSkillScanPolicy({}, data)).toEqual({ done: "Security scan saved." });
    expect(settings.setSkillScanPolicy).toHaveBeenCalledWith(expect.anything(), {
      enabled: "on",
      types: ["skill", "agent"],
      analysis: "static",
    });
    settings.setSkillScanPolicy.mockRejectedValueOnce(new SkillScanNotConfiguredError());
    expect(await actions.saveSkillScanPolicy({}, data)).toEqual({
      error: expect.stringContaining("RONNE_SKILL_SCANNER"),
    });
  });
});
