import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The form hands the confirmation what's saved, what's chosen and the provider (135).
vi.mock("./SemanticConfirm", () => ({
  SemanticConfirm: (props: { saved: string; chosen: string; provider: { host: string } | null }) =>
    `CONFIRM saved=${props.saved} chosen=${props.chosen} host=${props.provider?.host ?? "none"}`,
}));
vi.mock("../actions", () => ({ saveSkillScanPolicy: vi.fn(), testScanConnection: vi.fn() }));

const { SkillScanForm } = await import("./SkillScanForm");

describe("the security scan form's confirmation (135)", () => {
  it("passes the saved and the chosen analysis, and the provider", () => {
    const page = renderToStaticMarkup(
      <SkillScanForm
        settings={{
          policy: { enabled: true, types: ["skill"], analysis: "static" },
          scanner: { configured: true, provider: { name: "ollama", model: null, host: "h:1" } },
          lastVersion: null,
          lastError: null,
          runsStatic: false,
        }}
      />,
    );
    expect(page).toContain("CONFIRM saved=static chosen=static host=h:1");
  });
});
