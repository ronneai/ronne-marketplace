import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SkillScanSettings } from "@/server/domains/settings/models/skill-scan-policy";

// The form after root clicked an analysis other than the saved one: its `useState` for the
// analysis starts from what the test says root picked (135).
const picked = vi.hoisted(() => ({ analysis: null as string | null }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useState: <T,>(initial: T) =>
      react.useState(
        picked.analysis !== null && (initial === "static" || initial === "semantic")
          ? (picked.analysis as T)
          : initial,
      ),
  };
});
vi.mock("../actions", () => ({ saveSkillScanPolicy: vi.fn() }));

const { SkillScanForm } = await import("./SkillScanForm");

const render = (settings: SkillScanSettings, analysis: string | null) => {
  picked.analysis = analysis;
  try {
    return renderToStaticMarkup(<SkillScanForm settings={settings} />);
  } finally {
    picked.analysis = null;
  }
};

const base: SkillScanSettings = {
  policy: { enabled: true, types: ["skill"], analysis: "static" },
  blockScore: null,
  scanner: { configured: true, provider: { name: "ollama", model: null, host: "h:1" } },
  lastVersion: null,
  lastError: null,
  runsStatic: false,
};

describe("the security scan form once root picks an analysis (135)", () => {
  it("asks to confirm when root switches to semantic", () => {
    expect(render(base, "semantic")).toContain("sent to ollama at h:1. Save to confirm.");
    expect(render(base, "static")).not.toContain("Save to confirm.");
  });

  it("keeps Semantic choosable after root clicked Static, while semantic is what's saved", () => {
    const page = render(
      {
        ...base,
        policy: { ...base.policy, analysis: "semantic" },
        scanner: { configured: true, provider: null },
        runsStatic: true,
      },
      "static",
    );
    expect(page).not.toMatch(
      /<input type="radio" disabled=""[^>]*name="analysis" value="semantic"/,
    );
  });

  it("keeps the switch submittable when scanning is on and the command went", () => {
    const page = render({ ...base, scanner: { configured: false, provider: null } }, null);
    expect(page).toMatch(/<input type="checkbox"[^>]*name="enabled"/);
    expect(page).not.toMatch(/<input type="checkbox" disabled=""[^>]*name="enabled"/);
  });
});
