import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("shows under way in teal, needing attention in amber, and refused in red", () => {
    const html = (status: Parameters<typeof StatusBadge>[0]["status"]) =>
      renderToStaticMarkup(<StatusBadge status={status} />);
    expect(html("submitted")).toContain("bg-accent-strong");
    expect(html("changes_requested")).toMatch(/text-warning-text[^>]*>changes requested</);
    expect(html("rejected")).toContain("text-error-text");
    expect(html("draft")).toContain("bg-tint");
    expect(html("withdrawn")).toContain("bg-tint");
  });
});
