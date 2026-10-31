import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseListQuery } from "@/components/ui/data-table/list-query";
import type { AuditEvent } from "@/server/domains/audit/models/audit-event";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/admin/audit",
}));
const { AuditLogPage } = await import("./AuditLogPage");
const { EventDetails } = await import("./EventDetails");
const { AUDIT_LIST, checkedState } = await import("./list");

type L = "en" | "pt" | "fr";
const NS = ["admin", "common", "help"];
const render = (node: ReactElement, locale: L) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const ULID = "01K6BZ3W1D8J9Q2R4T6V8X0Y2Z";
const event = (extra: Partial<AuditEvent> = {}): AuditEvent => ({
  id: ULID,
  actorId: ULID,
  actorEmail: "root@example.com",
  action: "auth.signed_in",
  targetType: "user",
  targetId: "01K6BZ3W1D8J9Q2R4T6V8X0Y30",
  targetEmail: "sam@example.com",
  metadata: { remember: true },
  ipAddress: "203.0.113.9",
  createdAt: new Date("2026-09-27T19:15:03Z"),
  ...extra,
});

const page = (
  locale: L,
  events: AuditEvent[],
  params: Record<string, string> = {},
  selected?: AuditEvent | "missing",
) =>
  render(
    <AuditLogPage
      state={checkedState(parseListQuery(AUDIT_LIST, params))}
      events={events}
      page={{ next: null, previous: null }}
      total={{ count: events.length, capped: false }}
      selected={selected}
    />,
    locale,
  );

const everything = (locale: L) =>
  [
    page(locale, [
      event(),
      event({ id: "2", actorId: null, actorEmail: null, targetType: "none" }),
    ]),
    page(locale, []),
    page(locale, [], { action: "user.*", actor: "x", from: "2026-01-01", to: "2026-02-01" }),
    page(locale, [event()], {}, "missing"),
    page(locale, [event()], {}, event()),
    render(<EventDetails event={event({ targetType: "submission" })} />, locale),
    render(
      <EventDetails event={event({ targetType: "item", metadata: { name: "@a/b/c" } })} />,
      locale,
    ),
    render(
      <EventDetails event={event({ targetType: "none", metadata: {}, ipAddress: null })} />,
      locale,
    ),
  ].join("\n");

describe("the Audit log in three languages (132)", () => {
  it("the page, filters and columns read in each language", () => {
    const cases: Record<L, string[]> = {
      en: ["Audit log", "All actions", "From (UTC)", ">Time<", ">Event<", "2 events"],
      pt: [
        "Registro de auditoria",
        "Todas as ações",
        "De (UTC)",
        ">Hora<",
        ">Evento<",
        "2 eventos",
      ],
      fr: [
        "Journal d’audit",
        "Toutes les actions",
        "Du (UTC)",
        ">Heure<",
        ">Événement<",
        "2 événements",
      ],
    };
    for (const [locale, texts] of Object.entries(cases) as [L, string[]][]) {
      const html = page(locale, [event(), event({ id: "2" })]);
      for (const text of texts) expect(html, `${locale}: ${text}`).toContain(text);
    }
  });

  it("the filter labels, button and chips read in each language", () => {
    const params = { action: "user.*", actor: "x", from: "2026-01-01", to: "2026-02-01" };
    const cases: Record<L, string[]> = {
      en: [">Filter<", ">Action<", ">Actor<", "Action:", "Actor:", "From:", "To:"],
      pt: [">Filtrar<", ">Ação<", ">Autor<", "Ação:", "Autor:", "De:", "Até:", "Todas: user.*"],
      fr: [
        ">Filtrer<",
        ">Action<",
        ">Auteur<",
        "Action :",
        "Auteur :",
        "Du :",
        "Au :",
        "Toutes : user.*",
      ],
    };
    for (const [locale, texts] of Object.entries(cases) as [L, string[]][]) {
      const html = page(locale, [event()], params);
      for (const text of texts) expect(html, `${locale}: ${text}`).toContain(text);
    }
  });

  it("the empty, filtered and missing states", () => {
    expect(page("pt", [])).toContain("Ainda não há eventos.");
    expect(page("fr", [], { actor: "x" })).toContain(
      "Aucun événement ne correspond à ces filtres.",
    );
    expect(page("pt", [event()], {}, "missing")).toContain("Esse evento não existe.");
    expect(page("fr", [event()], {}, "missing")).toContain("Cet événement n’existe pas.");
  });

  it("counts 1 and 2 events by each language's rule", () => {
    expect(page("pt", [event()])).toContain("1 evento");
    expect(page("fr", [event()])).toContain("1 événement");
    expect(page("fr", [event(), event({ id: "2" })])).toContain("2 événements");
  });

  it("an event's details read in each language, with the ids and the metadata as recorded", () => {
    const pt = render(
      <EventDetails event={event({ metadata: { note: "{count} <b>x</b>" } })} />,
      "pt",
    );
    for (const text of [
      "Quando",
      "Autor",
      "Alvo",
      "Endereço IP",
      "ID do evento",
      "JSON bruto",
      "Abrir o usuário",
    ])
      expect(pt, text).toContain(text);
    expect(pt).toContain("{count} &lt;b&gt;x&lt;/b&gt;");
    expect(pt).toContain("auth.signed_in");
    const fr = render(<EventDetails event={event({ targetType: "submission" })} />, "fr");
    for (const text of [
      "Quand",
      "Cible",
      "Adresse IP",
      "ID de l’événement",
      "JSON brut",
      "Ouvrir la soumission",
    ])
      expect(fr, text).toContain(text);
  });

  it("the links, the copy button, the actor placeholder and the no-JavaScript close read in the language", () => {
    const item = (locale: L) =>
      render(
        <EventDetails event={event({ targetType: "item", metadata: { name: "@a/b/c" } })} />,
        locale,
      );
    expect(item("en")).toContain("Open the item");
    expect(item("pt")).toContain("Abrir o item");
    expect(item("fr")).toContain("Ouvrir l’élément");
    expect(item("pt")).toContain("Abrir o usuário");
    expect(item("fr")).toContain("Ouvrir l’utilisateur");
    expect(item("pt")).toContain('aria-label="Copiar JSON"');
    expect(item("fr")).toContain('aria-label="Copier le JSON"');
    expect(page("pt", [], {})).toContain('placeholder="E-mail ou system"');
    expect(page("fr", [], {})).toContain('placeholder="Courriel, ou system"');
    // The dialog is closed by a link inside <noscript> when there is no JavaScript.
    expect(page("pt", [event()], {}, event())).toContain(">Fechar</a>");
    expect(page("fr", [event()], {}, event())).toContain(">Fermer</a>");
    expect(page("en", [event()], {}, event())).toContain(">Close</a>");
  });

  it("the dialog's title reads in the language", () => {
    expect(page("pt", [event()], {}, event())).toContain("Detalhes do evento");
    expect(page("fr", [event()], {}, event())).toContain("Détails de l’événement");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: every state leaves no English behind`, async () => {
      const html = everything(locale);
      expect(await englishLeaks(NS, locale, html)).toEqual([]);
      expect(await ownTextsShown(["admin"], locale, html)).toBeGreaterThan(15);
    });
  }
});
