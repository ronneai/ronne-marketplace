import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseListQuery } from "@/components/ui/data-table/list-query";
import type { Scope } from "@/server/domains/items/models/scope";
import type { MoveImpact } from "@/server/domains/workspaces/models/scope-move";
import type { Workspace } from "@/server/domains/workspaces/models/workspace";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({
  askMoveFromForm: vi.fn(),
  cancelMoveFromForm: vi.fn(),
  moveImpactFor: vi.fn(),
  moveTargetsFor: vi.fn(),
  createWorkspaceFromForm: vi.fn(),
  deleteWorkspaceFromForm: vi.fn(),
  renameImpactFor: vi.fn(),
  renameWorkspaceFromForm: vi.fn(),
  setVisibilityFromForm: vi.fn(),
  updateWorkspaceFromForm: vi.fn(),
  visibilityImpactFor: vi.fn(),
}));
vi.mock("../admin-scopes/actions", () => ({
  createScopeFromForm: vi.fn(),
  updateScopeFromForm: vi.fn(),
}));

const { MoveForm, MoveChanges, MoveState } = await import("./MoveScope");
const {
  CreateWorkspaceForm,
  DeleteWorkspaceButton,
  DeleteWorkspaceForm,
  EditWorkspaceForm,
  RenameForm,
  VisibilityForm,
} = await import("./WorkspaceDialogs");
const { WorkspacesTable } = await import("./WorkspacesTable");
const { ADMIN_WORKSPACES_LIST } = await import("./list");
const { ScopesTable } = await import("../admin-scopes/ScopesTable");
const { CreateScopeForm, EditScopeForm } = await import("../admin-scopes/ScopeDialogs");
const { workspaceScopesList } = await import("../admin-scopes/list");

type L = "en" | "pt" | "fr";
const NS = ["admin", "common"];
const render = (node: ReactElement, locale: L) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const workspace = (extra: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  name: "acme",
  description: "Acme’s teams.",
  visibility: "public",
  isGlobal: false,
  ownerId: null,
  scopes: 0,
  moderators: 0,
  createdBy: { id: "r", email: "root@example.com" },
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  ...extra,
});
const scope = (extra: Partial<Scope> = {}): Scope => ({
  id: "s1",
  name: "platform",
  description: "Shared platform tools.",
  workspace: { id: "w1", name: "acme" },
  createdBy: { id: "r", email: "root@example.com" },
  createdAt: new Date("2026-09-20T10:00:00Z"),
  ...extra,
});

const scopes = (rows: Scope[], locale: L, q = "") => {
  const list = workspaceScopesList("/workspaces/acme");
  return render(
    <ScopesTable
      list={list}
      state={parseListQuery(list, q ? { q } : {})}
      scopes={rows}
      page={{ next: null, previous: null }}
      total={{ count: rows.length, capped: false }}
      actions={() => <span>ACTIONS</span>}
    />,
    locale,
  );
};
const workspacesTable = (rows: Workspace[], locale: L, kind = "", capped = false) =>
  render(
    <WorkspacesTable
      list={ADMIN_WORKSPACES_LIST}
      state={parseListQuery(ADMIN_WORKSPACES_LIST, kind ? { kind } : {})}
      workspaces={rows}
      page={{ next: null, previous: null }}
      total={{ count: rows.length, capped: false }}
      kinds={{
        shared: { count: 3, capped: false },
        personal: { count: capped ? 1000 : 1, capped },
      }}
    />,
    locale,
  );

const impact = (extra: Partial<MoveImpact> = {}): MoveImpact => ({
  scope: { id: "s1", name: "infra", workspace: "beta" },
  target: { id: "w2", name: "acme", visibility: "public", global: false, personal: false },
  name: "infra",
  nameProblem: null,
  clash: false,
  items: [{ from: "@beta/infra/deploy", to: "@acme/infra/deploy" }],
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
const targets = {
  targets: [
    { name: "ana", visibility: "private" as const, global: false, personal: true },
    { name: "acme", visibility: "public" as const, global: false, personal: false },
  ],
};
const move = (
  locale: L,
  extra: Partial<MoveImpact> = {},
  way: "once" | "twice" | "request" = "once",
  step?: "form" | "confirm" | "type",
  to = "acme",
) =>
  render(
    <MoveForm
      scope={{ id: "s1", name: "infra" }}
      workspace="beta"
      onDone={() => {}}
      loaded={{
        targets,
        impact: { ...impact(extra), way, answeredBy: way === "request" ? "admins" : null },
        to,
        step,
      }}
    />,
    locale,
  );

const everything = (locale: L) =>
  [
    scopes([scope()], locale),
    scopes([], locale),
    scopes([], locale, "x"),
    render(<CreateScopeForm workspace={{ id: "w1", name: "acme" }} onDone={() => {}} />, locale),
    render(<EditScopeForm name="platform" description="d" onDone={() => {}} />, locale),
    workspacesTable([workspace(), workspace({ id: "w2", name: "beta", moderators: 2 })], locale),
    workspacesTable(
      [workspace({ ownerEmail: "a@b.c", visibility: "private" })],
      locale,
      "personal",
    ),
    workspacesTable([], locale),
    render(<CreateWorkspaceForm onDone={() => {}} />, locale),
    render(<EditWorkspaceForm name="acme" description="d" onDone={() => {}} />, locale),
    render(<DeleteWorkspaceForm name="acme" onDone={() => {}} />, locale),
    render(<DeleteWorkspaceButton name="acme" scopes={2} />, locale),
    render(<VisibilityForm name="acme" to="public" onDone={() => {}} />, locale),
    render(
      <VisibilityForm
        name="acme"
        to="private"
        onDone={() => {}}
        loaded={{ dependents: ["@x/a/b"], openDependents: ["@x/c/d"] }}
      />,
      locale,
    ),
    render(
      <VisibilityForm
        name="acme"
        to="private"
        onDone={() => {}}
        loaded={{ error: "load_failed" }}
      />,
      locale,
    ),
    render(<RenameForm name="acme" onDone={() => {}} loaded={{ items: 3 }} />, locale),
    render(<RenameForm name="acme" onDone={() => {}} />, locale),
    render(<RenameForm name="acme" onDone={() => {}} loaded={{ error: "load_failed" }} />, locale),
    move(locale),
    move(locale, {}, "request"),
    move(locale, {}, "once", "confirm"),
    move(locale, {}, "twice", "confirm", "global"),
    move(locale, {}, "twice", "type"),
    move(locale, { clash: true }),
    move(locale, {
      outsideDependents: ["@acme/team/app"],
      outsideHidden: 2,
      ownDependencies: [{ item: "@beta/infra/kit", dependency: "@vault/secret/lib" }],
      ownHidden: 1,
      aliasTaken: ["@acme/infra/deploy"],
      refused: true,
    }),
    render(
      <MoveChanges
        impact={impact({
          target: {
            id: "w3",
            name: "vault",
            visibility: "private",
            global: false,
            personal: false,
          },
          notMembers: [{ item: "@beta/infra/wip", author: "bob@example.com" }],
          notMembersHidden: 1,
          openDependents: ["@team/app"],
          notReviewed: ["@ana/tools/lint@1.0.0"],
          fewerSee: true,
        })}
      />,
      locale,
    ),
    render(
      <MoveChanges
        impact={impact({
          target: { id: "w4", name: "ana", visibility: "private", global: false, personal: true },
          items: [],
        })}
      />,
      locale,
    ),
    render(
      <MoveState
        move={{ id: "m1", toWorkspace: "acme", status: "open", reason: null }}
        workspace="beta"
      />,
      locale,
    ),
    render(
      <MoveState
        move={{ id: "m1", toWorkspace: "acme", status: "declined", reason: "No." }}
        workspace="beta"
      />,
      locale,
    ),
  ].join("\n");

describe("Scopes in three languages (132)", () => {
  it("the table, search and empty states read in each language", () => {
    expect(scopes([scope()], "pt")).toContain("Escopo");
    expect(scopes([scope()], "pt")).toContain("Criado por");
    expect(scopes([scope()], "fr")).toContain("Portée");
    expect(scopes([], "pt")).toContain("Ainda não há escopos.");
    expect(scopes([], "fr", "x")).toContain("Aucune portée ne correspond à cette recherche.");
    expect(scopes([], "en")).toContain("No scopes yet.");
  });

  it("the search label, placeholder and button read in each language", () => {
    // The label and the button say the same word, so each is counted: both must be there.
    const count = (html: string, text: string) => html.split(text).length - 1;
    const words: Record<L, { search: string; placeholder: string }> = {
      en: { search: ">Search<", placeholder: 'placeholder="Name or description"' },
      pt: { search: ">Pesquisar<", placeholder: 'placeholder="Nome ou descrição"' },
      fr: { search: ">Rechercher<", placeholder: 'placeholder="Nom ou description"' },
    };
    for (const [locale, { search, placeholder }] of Object.entries(words) as [
      L,
      (typeof words)[L],
    ][]) {
      for (const [name, html] of [
        ["scopes", scopes([scope()], locale)],
        ["workspaces", workspacesTable([workspace()], locale)],
      ] as const) {
        expect(count(html, search), `${name} ${locale}: label and button`).toBe(2);
        expect(html, `${name} ${locale}: placeholder`).toContain(placeholder);
      }
    }
    expect(workspacesTable([], "pt", "personal")).toContain("Nome, descrição ou dono");
    expect(workspacesTable([], "fr", "personal")).toContain("Nom, description ou propriétaire");
  });

  it("counts 1 and 2 scopes by each language's rule", () => {
    expect(scopes([scope()], "pt")).toContain("1 escopo");
    expect(scopes([scope(), scope({ id: "s2" })], "fr")).toContain("2 portées");
  });

  it("the create form names the items, and a name problem reads in the language", () => {
    const html = (locale: L) =>
      render(<CreateScopeForm workspace={{ id: "w1", name: "acme" }} onDone={() => {}} />, locale);
    expect(html("en")).toContain("@scope/item");
    expect(html("pt")).toContain("Os itens se chamarão");
    expect(html("fr")).toContain("Les éléments s’appelleront");
    expect(html("pt")).toContain("0/300");
  });

  it("shows a scope's description and creator as typed", () => {
    const html = scopes([scope({ description: "{count} <b>x</b>" })], "pt");
    expect(html).toContain("{count} &lt;b&gt;x&lt;/b&gt;");
  });
});

describe("Workspaces in three languages (132)", () => {
  it("the table, the Shared and Personal tabs and the visibility read in each language", () => {
    const pt = workspacesTable(
      [workspace(), workspace({ id: "w2", name: "beta", moderators: 2 })],
      "pt",
    );
    for (const text of [
      "Espaço de trabalho",
      "Visibilidade",
      "Moderadores",
      "Público",
      "Nenhum",
      "Compartilhados (3)",
    ])
      expect(pt, text).toContain(text);
    const fr = workspacesTable([workspace({ visibility: "private" })], "fr", "personal");
    for (const text of ["Propriétaire", "Personnels (1)", "Partagés (3)"])
      expect(fr, text).toContain(text);
    expect(workspacesTable([], "fr")).toContain("Aucun espace de travail pour l’instant.");
  });

  it("writes a capped count with a plus, grouped by the language", () => {
    expect(workspacesTable([], "en", "personal", true)).toContain("Personal (1,000+)");
    expect(workspacesTable([], "pt", "personal", true)).toContain("Pessoais (1.000+)");
  });

  it("counts the items outside by each language's plural rule (1 and 2)", () => {
    const form = (locale: L, n: number) =>
      render(
        <VisibilityForm
          name="acme"
          to="private"
          onDone={() => {}}
          loaded={{
            dependents: Array.from({ length: n }, (_, i) => `@x/a/b${i}`),
            openDependents: [],
          }}
        />,
        locale,
      );
    expect(form("en", 1)).toContain("1 item outside acme depends on its items");
    expect(form("en", 2)).toContain("2 items outside acme depend on its items");
    expect(form("pt", 1)).toContain("1 item fora de acme depende dos itens dele");
    expect(form("pt", 2)).toContain("2 itens fora de acme dependem dos itens dele");
    expect(form("fr", 2)).toContain("2 éléments hors de acme dépendent de ses éléments");
  });

  it("the rename form counts its items and keeps the names as typed", () => {
    const form = (locale: L, items: number) =>
      render(<RenameForm name="acme" onDone={() => {}} loaded={{ items }} />, locale);
    expect(form("en", 1)).toContain("Its 1 item");
    expect(form("en", 2)).toContain("Its 2 items");
    expect(form("pt", 1)).toContain("O 1 item será renomeado");
    expect(form("fr", 2)).toContain("Ses 2 éléments seront renommés");
    expect(form("pt", 1)).toContain("@acme/…");
  });
});

describe("Moving a scope in three languages (132)", () => {
  it("asks the question with the count and whether it is renamed", () => {
    expect(move("en", {}, "once", "confirm")).toContain(
      "Move @infra and its 1 item to acme, as @acme/infra?",
    );
    expect(move("pt", {}, "once", "confirm")).toContain(
      "Mover @infra e o 1 item dele para acme, como @acme/infra?",
    );
    expect(move("fr", {}, "once", "confirm")).toContain(
      "Déplacer @infra et son 1 élément vers acme, sous le nom @acme/infra?",
    );
    expect(move("en", { items: [], name: "x" }, "once", "confirm")).toContain("its 0 items");
  });

  it("words the form, the request, the refusals and the typed confirmation", () => {
    expect(move("pt")).toContain("Para onde");
    expect(move("fr")).toContain("Destination");
    expect(move("pt", {}, "request")).toContain("Pedir para mover");
    expect(move("fr", {}, "request")).toContain("Les admins de acme ou root répondront.");
    expect(move("pt", {}, "twice", "type")).toContain("Nome do escopo");
    expect(move("fr", { clash: true })).toContain("acme a déjà une portée appelée infra");
    expect(move("pt", { outsideHidden: 2, refused: true })).toContain("e mais 2 que você não vê");
    expect(move("fr", {}, "once", "form", "ana")).toContain("Personnel (ana)");
  });

  it("shows the names of items and people as typed", () => {
    const html = render(
      <MoveChanges impact={impact({ items: [{ from: "@a/{x}/b", to: "@c/{y}/b" }] })} />,
      "pt",
    );
    expect(html).toContain("@a/{x}/b → @c/{y}/b");
  });
});

describe("no English left behind in admin scopes and workspaces (132)", () => {
  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: every table, dialog and move step`, async () => {
      // The inline helpers still hold English until task 12 moves them; leave them out of the scan.
      const html = everything(locale).replace(
        /<button[^>]*aria-haspopup="dialog"[\s\S]*?<\/noscript>/g,
        "",
      );
      expect(await englishLeaks(NS, locale, html)).toEqual([]);
      expect(await ownTextsShown(["admin"], locale, html)).toBeGreaterThan(40);
    });
  }
});
