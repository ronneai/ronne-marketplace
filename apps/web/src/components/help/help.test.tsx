import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HELP, Help, type HelpId } from "./Help";
import { topicOf } from "./topics";

/** Where a `/docs/<topic>#<section>` link lands, or null when there's no such topic or section. */
const target = (href: string) => {
  const match = /^\/docs(?:\/([a-z-]+))?(?:#([a-z-]+))?$/.exec(href);
  if (!match) return null;
  const topic = topicOf(match[1] ?? "overview");
  if (!topic) return null;
  return !match[2] || topic.sections.some((s) => s.id === match[2]) ? topic : null;
};

describe("inline help", () => {
  it("links every helper to a topic section that exists", () => {
    for (const [id, help] of Object.entries(HELP)) expect(target(help.href), id).not.toBeNull();
    expect(target("/docs/scopes#nope")).toBeNull();
    expect(target("/docs/nope")).toBeNull();
  });

  it("renders a helper as its question, answer and Learn more", () => {
    for (const id of Object.keys(HELP) as HelpId[]) {
      const html = renderToStaticMarkup(<Help id={id} />);
      expect(html).toContain(HELP[id].question.replaceAll("'", "&#x27;"));
      expect(html).toContain(`href="${HELP[id].href}"`);
    }
  });
});
