import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../hold", () => ({ holdPage: vi.fn(async () => undefined) }));
vi.mock("@/features/feedback/actions", () => ({ sendFeedbackFromForm: vi.fn() }));

const { default: FeedbackPage } = await import("./page");

const render = async (from?: string | string[]) =>
  renderToStaticMarkup(await FeedbackPage({ searchParams: Promise.resolve({ from }) }));

describe("the Send feedback page (127)", () => {
  it("is the form, with the page they came from as a path only", async () => {
    const html = await render("/catalogue?q=secret#top");
    expect(html).toContain("<h1");
    expect(html).toContain("Send feedback");
    expect(html).toContain('<input type="hidden" name="page" value="/catalogue"/>');
    expect(html).not.toContain("secret");
  });

  it("offers no page when `from` isn't a page of the app", async () => {
    for (const from of ["https://evil.example/x", "//evil.example", "/nowhere", "", undefined])
      expect(await render(from), String(from)).not.toContain('name="page"');
    expect(await render(["/menu", "/admin"])).toContain('value="/menu"');
  });
});
