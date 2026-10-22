import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import { inLocale } from "@/test/intl";
import type { PinTargetView } from "./types";

vi.mock("./actions", () => ({
  loadShelfAction: vi.fn(),
  moveInShelfAction: vi.fn(),
  pinToShelfAction: vi.fn(),
  unpinFromShelfAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
const { PinMenu } = await import("./PinMenu");
const { ManageShelf, ShelfList } = await import("./ManageShelf");

const NAME = "@team/base";
const root: PinTargetView[] = [
  { key: "instance", workspace: null, pinned: true, blocked: null },
  { key: "W1", workspace: "acme", pinned: false, blocked: null },
];

const menu = (locale: Locale, targets: PinTargetView[]) =>
  inLocale(locale, () =>
    renderToStaticMarkup(<PinMenu itemId="I1" name={NAME} targets={targets} />),
  );

describe("the Pin menu (125)", () => {
  it("is not there when there is nowhere the person may pin", () => {
    expect(menu("en", [])).toBe("");
  });

  it("has a Pin button and lists Start here and the workspaces with what each row does", () => {
    const html = menu("en", root);
    expect(html).toContain(">Pin<");
    expect(html).toContain("Pin @team/base");
    expect(html).toContain(">Start here<");
    expect(html).toContain(">acme<");
    // Start here holds the item already: Unpin and the Pinned badge; acme doesn't: Pin.
    expect(html).toContain('aria-label="Remove the pin of @team/base from Start here"');
    expect(html).toContain('aria-label="Pin @team/base to acme"');
    expect(html).toContain(">Pinned<");
    expect(html).toContain('aria-label="Manage Start here"');
    expect(html).toContain('aria-label="Manage acme"');
  });

  it("an admin sees only their workspaces: nothing says Start here", () => {
    const html = menu("en", [{ key: "W1", workspace: "acme", pinned: false, blocked: null }]);
    // No Start here row (the helper's own answer names it, so look for the row's label).
    expect(html).not.toContain(">Start here<");
    expect(html).not.toContain("to Start here");
    expect(html).toContain(">acme<");
  });

  it("explains why Start here is not offered for an item of a private workspace", () => {
    const html = menu("en", [
      { key: "instance", workspace: null, pinned: false, blocked: "private" },
    ]);
    expect(html).toContain("Only items in a public workspace can be pinned to Start here.");
    expect(html).toContain('disabled=""');
  });

  it("a pinned item can still be unpinned from Start here when its workspace became private", () => {
    const html = menu("en", [
      { key: "instance", workspace: null, pinned: true, blocked: "private" },
    ]);
    expect(html).not.toContain("Only items in a public workspace");
  });

  it("has a search field only when there are many shelves", () => {
    expect(menu("en", root)).not.toContain("Find a workspace");
    const many = Array.from({ length: 8 }, (_, i) => ({
      key: `W${i}`,
      workspace: `ws-${i}`,
      pinned: false,
      blocked: null,
    }));
    expect(menu("en", many)).toContain("Find a workspace");
  });

  it("speaks Portuguese and French, and names Start here as each language does", () => {
    const pt = menu("pt", root);
    expect(pt).toContain(">Fixar<");
    expect(pt).toContain(">Comece por aqui<");
    expect(pt).toContain('aria-label="Fixar @team/base em acme"');
    expect(pt).toContain(">Fixado<");
    expect(pt).toContain(">Concluído<");
    const fr = menu("fr", root);
    expect(fr).toContain(">Épingler<");
    expect(fr).toContain(">Commencez ici<");
    expect(fr).toContain('aria-label="Épingler @team/base dans acme"');
    expect(fr).toContain(">Épinglé<");
    expect(fr).toContain(">Terminé<");
  });

  it("is a dialog, so a phone gets the whole screen", () => {
    const html = menu("en", root);
    expect(html).toContain("<dialog");
    expect(html).toContain("max-sm:w-screen");
  });
});

describe("the Manage view (125)", () => {
  it("says it is loading before the shelf arrives, in each language", () => {
    const view = (locale: Locale) =>
      inLocale(locale, () => renderToStaticMarkup(<ManageShelf shelfKey="instance" />));
    expect(view("en")).toContain("Loading…");
    expect(view("pt")).toContain("Carregando…");
    expect(view("fr")).toContain("Chargement…");
  });
});

describe("a shelf in the Manage view (125)", () => {
  const entry = (name: string, availability: "available" | "unavailable" = "available") => ({
    itemId: name.toUpperCase(),
    name,
    position: 1,
    availability,
  });
  const list = (
    state: Parameters<typeof ShelfList>[0]["state"],
    locale: Locale = "en",
    pending = false,
  ) =>
    inLocale(locale, () =>
      renderToStaticMarkup(
        <ShelfList state={state} pending={pending} onMove={() => {}} onRemove={() => {}} />,
      ),
    );
  const three = {
    ok: true as const,
    max: 12,
    entries: [entry("@a/one"), entry("@a/two", "unavailable"), entry("@a/three")],
  };

  it("shows the count against the limit, and each pin in order with its three buttons", () => {
    const html = list(three);
    expect(html).toContain("3 of 12 pinned");
    expect(html.indexOf("@a/one")).toBeLessThan(html.indexOf("@a/two"));
    expect(html.indexOf("@a/two")).toBeLessThan(html.indexOf("@a/three"));
    for (const name of ["@a/one", "@a/two", "@a/three"])
      for (const label of [`Move ${name} up`, `Move ${name} down`, `Remove ${name}`])
        expect(html).toContain(`aria-label="${label}"`);
  });

  /** The button with this label, as its opening tag. */
  const button = (html: string, label: string) =>
    html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";

  it("the first cannot move up and the last cannot move down; the others can", () => {
    const html = list(three);
    expect(button(html, "Move @a/one up")).toContain('disabled=""');
    expect(button(html, "Move @a/one down")).not.toContain('disabled=""');
    expect(button(html, "Move @a/two up")).not.toContain('disabled=""');
    expect(button(html, "Move @a/two down")).not.toContain('disabled=""');
    expect(button(html, "Move @a/three up")).not.toContain('disabled=""');
    expect(button(html, "Move @a/three down")).toContain('disabled=""');
    expect(button(html, "Remove @a/one")).not.toContain('disabled=""');
  });

  it("waits while a change is under way", () => {
    const html = list(three, "en", true);
    expect(button(html, "Remove @a/two")).toContain('disabled=""');
    expect(button(html, "Move @a/two up")).toContain('disabled=""');
  });

  it("marks only the pin that is not available, and keeps its Remove", () => {
    const html = list(three);
    expect(html.match(/Not available/g)).toHaveLength(1);
    expect(html).toContain("It has no installable version now.");
    expect(html.indexOf("Not available")).toBeGreaterThan(html.indexOf("@a/two"));
    expect(html.indexOf("Not available")).toBeLessThan(html.indexOf("@a/three"));
    expect(button(html, "Remove @a/two")).not.toContain('disabled=""');
  });

  it("says when nothing is pinned, and why a change was refused", () => {
    expect(list({ ok: true, max: 12, entries: [] })).toContain("Nothing is pinned here yet.");
    expect(list({ ok: true, max: 12, entries: [] })).toContain("0 of 12 pinned");
    const refused = list({ ok: false, error: "Start here has 12 items; remove one first." });
    expect(refused).toContain('<p role="alert"');
    expect(refused).toContain("Start here has 12 items; remove one first.");
    expect(refused).not.toContain("<li");
  });

  it("speaks Portuguese and French", () => {
    const pt = list(three, "pt");
    for (const text of [
      "3 de 12 fixados",
      'aria-label="Mover @a/one para cima"',
      'aria-label="Mover @a/one para baixo"',
      'aria-label="Remover @a/one"',
      "Indisponível",
    ])
      expect(pt, text).toContain(text);
    const fr = list(three, "fr");
    for (const text of [
      "3 sur 12 épinglés",
      'aria-label="Monter @a/one"',
      'aria-label="Descendre @a/one"',
      'aria-label="Retirer @a/one"',
      "Non disponible",
    ])
      expect(fr, text).toContain(text);
    expect(list({ ok: true, max: 12, entries: [] }, "pt")).toContain("Nada fixado aqui ainda.");
    expect(list({ ok: true, max: 12, entries: [] }, "fr")).toContain(
      "Rien n’est encore épinglé ici.",
    );
  });
});
