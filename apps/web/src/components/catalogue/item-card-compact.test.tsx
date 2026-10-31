import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CatalogueEntry } from "@/server/domains/items/actions/catalogue";
import { inLocale } from "@/test/intl";

vi.mock("@/features/favorites/actions", () => ({ toggleFavoriteFromForm: vi.fn() }));
const { ItemCard } = await import("./ItemCard");
const { CardGrid } = await import("./CardGrid");

const entry: CatalogueEntry = {
  id: "ITEM1",
  workspace: "global",
  privateWorkspace: false,
  personalWorkspace: false,
  scope: "team",
  name: "base",
  type: "skill",
  version: "1.2.3",
  description: "The base.",
  keywords: ["format", "lint"],
  publishedAt: new Date("2026-09-20T10:00:00Z"),
  lastPublishedAt: new Date("2026-09-20T10:00:00Z"),
  risky: false,
  deprecatedMessage: null,
  installable: true,
  downloadCount: 7,
  support: { "claude-code": "native", codex: "native", cursor: "native" },
};

/** The part of a card between its name and its description. */
const metaRow = (html: string) => html.slice(html.indexOf("</h3>"), html.indexOf("The base."));

describe("the compact item card (Home's grid)", () => {
  const compact = renderToStaticMarkup(<ItemCard entry={entry} heading="h3" favorited compact />);

  it("keeps the date out of the badge row, in the footer beside the installs", () => {
    // A risk badge fills the version row; the date there wrapped onto a row of its own.
    expect(metaRow(compact)).not.toContain("<time");
    const footer = compact.slice(compact.indexOf("The base."));
    expect(footer.indexOf("<time")).toBeGreaterThan(footer.indexOf("7 installs"));
    // The word is there for screen readers only.
    expect(footer).toMatch(/<span class="sr-only">Published <\/span>/);
    expect(footer).not.toContain("published ");
  });

  it("has the installs and a copy icon in its footer, not the command in a box", () => {
    const footer = compact.slice(compact.indexOf("The base."));
    expect(footer).toContain("7 installs");
    expect(footer).toContain('aria-label="Copy the install command for @team/base"');
    // The command is the tooltip, not text on the card.
    expect(footer).toContain('title="rmk install @team/base"');
    expect(footer).not.toContain("<code");
  });

  it("has no copy icon on an item nobody can install", () => {
    const gone = renderToStaticMarkup(
      <ItemCard entry={{ ...entry, installable: false }} heading="h3" compact />,
    );
    expect(gone).not.toContain("Copy the install command");
  });

  it("keeps the name to two lines with the whole name on hover, and breaks at - and / first", () => {
    expect(compact).toContain("line-clamp-2");
    expect(compact).toContain('title="@team/base"');
    expect(compact).toContain("break-words");
    expect(compact).not.toContain("break-all");
  });

  it("cuts a long description at two lines, with an ellipsis, and keeps room for two", () => {
    expect(compact).toContain("line-clamp-2 min-h-10");
    expect(renderToStaticMarkup(<ItemCard entry={entry} heading="h3" favorited />)).not.toContain(
      "line-clamp",
    );
  });

  it("drops the Workspace and Scope line, the full name already says them", () => {
    expect(compact).not.toContain("Workspace");
    expect(compact).not.toContain("Scope");
    expect(compact).not.toContain("/workspaces/global");
    const outside = renderToStaticMarkup(
      <ItemCard entry={{ ...entry, workspace: "acme" }} heading="h3" compact />,
    );
    expect(outside).toContain(">@acme/team/base<");
  });

  it("keeps a cue for a private or personal workspace, which the name can't say", () => {
    const priv = renderToStaticMarkup(
      <ItemCard
        entry={{ ...entry, workspace: "vault", privateWorkspace: true }}
        heading="h3"
        compact
      />,
    );
    expect(priv).toContain(">Private<");
    expect(priv).toContain("lucide-lock");
    expect(priv).toContain("Only vault’s members and root see this item.");
    const personal = renderToStaticMarkup(
      <ItemCard entry={{ ...entry, personalWorkspace: true }} heading="h3" compact />,
    );
    expect(personal).toContain("(personal)");
    expect(compact).not.toContain("Private");
    expect(compact).not.toContain("(personal)");
  });

  it("leaves the keywords and the tools to the item's page", () => {
    expect(compact).not.toContain("#format");
    expect(compact).not.toContain("works in");
  });

  it("says its copy button in the person's language", () => {
    const pt = inLocale("pt", () =>
      renderToStaticMarkup(<ItemCard entry={entry} heading="h3" compact />),
    );
    expect(pt).toContain('aria-label="Copiar o comando de instalação de @team/base"');
    const fr = inLocale("fr", () =>
      renderToStaticMarkup(<ItemCard entry={entry} heading="h3" compact />),
    );
    expect(fr).toContain("Copier la commande d’installation de @team/base");
    expect(fr).toContain("Publié le");
  });

  it("keeps the ordinary card as it was: date in the line under it, keywords, tools and command", () => {
    const full = renderToStaticMarkup(<ItemCard entry={entry} heading="h3" favorited />);
    const footer = full.slice(full.indexOf("The base."));
    expect(footer).toContain("published");
    expect(footer).toContain("#format");
    expect(footer).toContain("works in");
    expect(footer).toContain("rmk install @team/base");
    expect(full).toContain("Workspace");
    expect(full).not.toContain("line-clamp");
  });
});

describe("the card grid", () => {
  it("makes as many columns as fit, a card never under 17rem and never more than five to a row", () => {
    const html = renderToStaticMarkup(
      <CardGrid>
        <li>x</li>
      </CardGrid>,
    );
    expect(html).toContain(
      "grid-cols-[repeat(auto-fill,minmax(max(min(100%,17rem),calc((100%_-_3rem)/5)),1fr))]",
    );
    expect(html).not.toContain("@container");
  });
});
