import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { docsHref } from "@/components/help/topics";
import { HelpTip } from "./HelpTip";

describe("HelpTip", () => {
  it("is a closed popover's button, with the answer inline only without JavaScript (050)", () => {
    const html = renderToStaticMarkup(
      <HelpTip question="What's a scope?" href={docsHref("scopes", "what")}>
        The first part of an item&apos;s name.
      </HelpTip>,
    );
    expect(html).toMatch(/<button type="button"[^>]*aria-expanded="false"/);
    expect(html).toMatch(/aria-haspopup="dialog"/);
    expect(html).toContain("What&#x27;s a scope?");
    // Closed: no popover on the page, and the answer only in the noscript fallback.
    expect(html).not.toContain('role="dialog"');
    expect(html).toMatch(
      /<noscript>[\s\S]*The first part of an item&#x27;s name\.[\s\S]*<\/noscript>/,
    );
    expect(html).not.toContain("<details");
    expect(renderToStaticMarkup(<HelpTip question="Q">A.</HelpTip>)).not.toContain("Learn more");
  });

  it("opens Learn more, the Documentation on the website, in a new tab (088)", () => {
    const html = renderToStaticMarkup(
      <HelpTip question="What's a scope?" href={docsHref("scopes", "what")}>
        A.
      </HelpTip>,
    );
    const link = /<a [^>]*>Learn more[\s\S]*?<\/a>/.exec(html)?.[0] ?? "";
    expect(link).toContain('href="https://www.ronne.ai/marketplace/docs/scopes#what"');
    expect(link).toContain('target="_blank" rel="noopener noreferrer"');
    expect(link).toContain('aria-hidden="true"');
    expect(link).toContain('<span class="sr-only"> (opens in a new tab)</span>');
  });
});
