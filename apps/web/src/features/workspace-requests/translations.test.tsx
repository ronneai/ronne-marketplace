import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import type { MoveImpact } from "@/server/domains/workspaces/models/scope-move";
import type { MoveRequestRow } from "@/server/domains/workspaces/services/scope-moves";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import type { RequestRow } from "./types";

vi.mock("@/server/domains/workspaces/actions/workspaces", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { RequestsTable } = await import("./RequestsTable");
const { ApproveForm, DeclineButton } = await import("./AnswerControls");
const { ScopeMovesTable } = await import("./ScopeMovesTable");
const { generateMetadata: requestsTitle } = await import("@/app/(app)/workspaces/requests/page");
const { generateMetadata: workspaceTitle } = await import("@/app/(app)/workspaces/[name]/page");

/** Requests to join and scope moves in three languages (feature 130). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const request = (extra: Partial<RequestRow> = {}): RequestRow => ({
  id: "r1",
  workspace: "acme",
  email: "ana@example.com",
  name: "Ana",
  message: "Let me in.",
  createdAt: new Date("2026-10-10T10:00:00Z"),
  canPickRole: true,
  ...extra,
});

const impact = (extra: Partial<MoveImpact> = {}): MoveImpact => ({
  scope: { id: "s1", name: "infra", workspace: "beta" },
  target: { id: "w2", name: "acme", visibility: "public", global: false, personal: false },
  name: "infra",
  nameProblem: null,
  clash: false,
  items: [],
  aliasTaken: [],
  aliasHidden: 0,
  outsideDependents: [],
  outsideHidden: 0,
  ownDependencies: [],
  ownHidden: 0,
  openDependents: [],
  openHidden: 0,
  notMembers: [],
  notMembersHidden: 0,
  notReviewed: [],
  fewerSee: false,
  refused: false,
  ...extra,
});

const move = (extra: Partial<MoveRequestRow> = {}): MoveRequestRow => ({
  id: "m1",
  scope: "@beta/infra",
  newName: "@acme/infra",
  renamed: true,
  from: "beta",
  to: "acme",
  items: 1,
  askedBy: { email: "dave@example.com", name: "Dave" },
  createdAt: new Date("2026-10-10T10:00:00Z"),
  message: null,
  notReviewed: ["1.0.0", "1.1.0"],
  impact: impact({ clash: true, ownHidden: 1 }),
  ...extra,
});

describe("Requests to join in three languages", () => {
  const table = (locale: Locale, total = 1) =>
    view(
      locale,
      <RequestsTable
        requests={[request(), request({ id: "r2", message: null })]}
        total={total}
        showWorkspace
      />,
    );

  it("the columns, the answers and the counts", () => {
    expect(table("en")).toContain(">Asked (UTC)<");
    const pt = table("pt", 30);
    for (const text of [
      ">Quem<",
      "Espaço de trabalho",
      "Solicitado (UTC)",
      ">Mensagem<",
      ">Aprovar<",
      ">Recusar<",
      ">Nenhuma<",
      "As 2 mais antigas de 30.",
      'aria-label="Papel para ana@example.com"',
      ">Moderador<",
    ])
      expect(pt, text).toContain(text);
    const fr = table("fr", 30);
    for (const text of [
      ">Qui<",
      "Espace de travail",
      "Demandé (UTC)",
      ">Approuver<",
      ">Refuser<",
      "Les 2 plus anciennes sur 30.",
      'aria-label="Approuver ana@example.com"',
    ])
      expect(fr, text).toContain(text);
    expect(view("pt", <RequestsTable requests={[]} total={0} />)).toContain(
      "Nenhuma solicitação aguardando.",
    );
    expect(view("fr", <RequestsTable requests={[]} total={0} />)).toContain(
      "Aucune demande en attente.",
    );
  });

  it("the decline button, and approving as a user only", () => {
    expect(view("pt", <DeclineButton request={request()} />)).toContain(
      'aria-label="Recusar ana@example.com"',
    );
    expect(view("fr", <DeclineButton request={request()} />)).toContain(
      'aria-label="Refuser ana@example.com"',
    );
    const plain = view("fr", <ApproveForm request={request({ canPickRole: false })} />);
    expect(plain).not.toContain("<select");
    expect(plain).toContain(">Approuver<");
  });

  it("a message that looks like a placeholder is shown as typed", () => {
    const html = view(
      "pt",
      <RequestsTable requests={[request({ message: "{x} <b>y</b>" })]} total={1} />,
    );
    expect(html).toContain("{x} &lt;b&gt;y&lt;/b&gt;");
  });
});

describe("Scope moves in three languages", () => {
  it("the columns, the plural items, the notes and what refuses it", () => {
    const pt = view(
      "pt",
      <ScopeMovesTable
        moves={[
          move(),
          move({ id: "m2", items: 2, renamed: false, notReviewed: [], impact: impact() }),
        ]}
        showTarget
      />,
    );
    for (const text of [
      ">Escopo<",
      ">De<",
      ">Para<",
      "Nome dele lá",
      "Solicitado por (UTC)",
      "1 item<",
      "2 itens",
      "Não revisadas: 1.0.0, 1.1.0. Aprovar as revisa.",
      "2 motivos impedem isso agora: Aprovar mostra quais.",
      ">Renomeado<",
      'aria-label="Aprovar a movimentação de @beta/infra para acme"',
    ])
      expect(pt, text).toContain(text);
    const fr = view("fr", <ScopeMovesTable moves={[move()]} />);
    for (const text of [
      "Non révisées : 1.0.0, 1.1.0. Approuver les révise.",
      "2 obstacles empêchent maintenant le déplacement",
      ">Renommé<",
      "1 élément<",
    ])
      expect(fr, text).toContain(text);
    expect(view("pt", <ScopeMovesTable moves={[]} />)).toContain(
      "Nenhuma movimentação aguardando.",
    );
    expect(view("fr", <ScopeMovesTable moves={[]} />)).toContain("Aucun déplacement en attente.");
  });

  it("one thing that refuses is singular in each language", () => {
    const one = (l: Locale) =>
      view(l, <ScopeMovesTable moves={[move({ impact: impact({ clash: true }) })]} />);
    expect(one("en")).toContain("1 thing refuses it now: Approve lists them.");
    expect(one("pt")).toContain("1 motivo impede isso agora: Aprovar mostra qual.");
    expect(one("fr")).toContain(
      "1 obstacle empêche maintenant le déplacement : Approuver les liste.",
    );
  });
});

describe("the page titles follow the language", () => {
  it("Requests to join and Workspace", async () => {
    expect(await inLocale("pt", () => requestsTitle())).toEqual({
      title: "Solicitações para entrar · Ronne AI Marketplace",
    });
    expect(await inLocale("fr", () => workspaceTitle())).toEqual({
      title: "Espace de travail · Ronne AI Marketplace",
    });
  });
});

describe("no English left behind (130)", () => {
  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: none of the English texts appears`, async () => {
      const html = [
        view(
          locale,
          <RequestsTable
            requests={[request(), request({ id: "r2", message: null })]}
            total={30}
            showWorkspace
          />,
        ),
        view(locale, <RequestsTable requests={[]} total={0} />),
        view(locale, <DeclineButton request={request()} />),
        view(locale, <ScopeMovesTable moves={[move()]} showTarget />),
        view(locale, <ScopeMovesTable moves={[]} />),
      ].join("\n");
      expect(await englishLeaks(["workspaces"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["workspaces"], locale, html)).toBeGreaterThan(8);
    });
  }
});
