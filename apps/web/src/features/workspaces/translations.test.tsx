import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AskToJoinLink } from "@/components/workspaces/AskToJoinLink";
import type { Locale } from "@/server/domains/identity/models/locale";
import type { OwnRequest } from "@/server/domains/workspaces/models/access-request";
import type { JoinTarget, MyWorkspace } from "@/server/domains/workspaces/services/access-requests";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import { Showing } from "../current-workspace/Showing";

vi.mock("@/server/domains/workspaces/actions/workspaces", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { WorkspacesPage } = await import("./WorkspacesPage");
const { JoinPage } = await import("./JoinPage");
const { AskToJoinForm, AskToJoinButton, CancelRequestButton } = await import("./RequestControls");
const { generateMetadata: listTitle } = await import("@/app/(app)/workspaces/page");
const { generateMetadata: joinTitle } = await import("@/app/(app)/workspaces/[name]/join/page");

/** The Workspaces list, the join page and the "Showing" line in three languages (feature 130). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const workspace = (name: string, extra: Partial<MyWorkspace> = {}): MyWorkspace => ({
  name,
  description: `The ${name} team.`,
  visibility: "public",
  isGlobal: false,
  personal: false,
  role: null,
  ...extra,
});

const request = (name: string, extra: Partial<OwnRequest> = {}): OwnRequest => ({
  id: `r-${name}`,
  workspace: name,
  message: null,
  status: "open",
  reason: null,
  createdAt: new Date("2026-10-08T12:00:00Z"),
  decidedAt: null,
  description: null,
  visibility: null,
  askAgainFrom: null,
  ...extra,
});

const list = (locale: Locale) =>
  view(
    locale,
    <WorkspacesPage
      workspaces={[
        workspace("global", { isGlobal: true, role: "user" }),
        workspace("acme", { role: "admin" }),
        workspace("me", { personal: true }),
        workspace("secret", { visibility: "private", role: "moderator" }),
        workspace("open"),
        workspace("asked"),
        workspace("refused"),
      ]}
      requests={[
        request("asked"),
        request("refused", {
          status: "declined",
          decidedAt: new Date("2026-10-07T12:00:00Z"),
          askAgainFrom: new Date("2026-10-20T12:00:00Z"),
          reason: "Not now.",
        }),
        request("hidden", { status: "declined", decidedAt: new Date("2026-10-07T12:00:00Z") }),
      ]}
    />,
  );

describe("the Workspaces list in three languages", () => {
  it("names the columns, the kinds and the roles", () => {
    expect(list("en")).toContain(">Everyone<");
    const pt = list("pt");
    for (const text of [
      "Espaços de trabalho",
      "Visibilidade",
      ">Todos<",
      ">Pessoal<",
      ">Privado<",
      ">Público<",
      ">Seu<",
      ">Moderador<",
      ">Admin<",
    ])
      expect(pt, text).toContain(text);
    const fr = list("fr");
    for (const text of [
      "Espaces de travail",
      "Visibilité",
      ">Tout le monde<",
      ">Personnel<",
      ">Privé<",
      ">Le vôtre<",
      ">Modérateur<",
    ])
      expect(fr, text).toContain(text);
  });

  it("a request's state reads in the language, dates inside the sentence", () => {
    expect(list("en")).toMatch(/Requested <time[^>]*>2026-10-08<\/time>/);
    expect(list("pt")).toMatch(/Solicitado em <time[^>]*>2026-10-08<\/time>/);
    expect(list("pt")).toMatch(
      /Recusado em <time[^>]*>2026-10-07<\/time>; peça de novo a partir de <time[^>]*>2026-10-20<\/time>/,
    );
    expect(list("fr")).toMatch(/Demandé le <time[^>]*>2026-10-08<\/time>/);
    expect(list("fr")).toMatch(
      /Refusée le <time[^>]*>2026-10-07<\/time>; redemandez à partir du <time[^>]*>2026-10-20<\/time>/,
    );
    expect(list("fr")).toContain("« Not now. »");
    expect(list("pt")).toContain("“Not now.”");
    // A declined request with no wait to serve has no "ask again".
    expect(list("pt")).toMatch(/Recusado em <time[^>]*>2026-10-07<\/time>(?!;)/);
  });

  it("the other requests, and Ask to join with the workspace in its name", () => {
    expect(list("pt")).toContain("Suas outras solicitações");
    expect(list("fr")).toContain("Vos autres demandes");
    expect(list("pt")).toContain('aria-label="Pedir para entrar em open"');
    expect(list("fr")).toContain('aria-label="Demander à se joindre à open"');
    expect(list("fr")).toContain('aria-label="Annuler votre demande pour se joindre à asked"');
  });

  it("the join form counts characters in the language's number format", () => {
    expect(view("pt", <AskToJoinForm workspace="acme" />)).toContain("Mensagem (opcional)");
    expect(view("fr", <AskToJoinForm workspace="acme" />)).toContain("Message (facultatif)");
    expect(view("fr", <AskToJoinForm workspace="acme" />)).toMatch(/0\/500/);
    expect(view("pt", <AskToJoinButton workspace="acme" />)).toContain("Pedir para entrar");
    expect(view("fr", <CancelRequestButton requestId="r1" workspace="acme" />)).toContain(
      ">Annuler<",
    );
  });

  it("a workspace name that looks like a placeholder is shown as typed", () => {
    const html = view("pt", <WorkspacesPage workspaces={[workspace("{x}-<b>")]} requests={[]} />);
    expect(html).toContain("{x}-&lt;b&gt;");
    expect(view("pt", <AskToJoinLink workspace="{x}" />)).toContain("Pedir para entrar em {x}");
  });
});

describe("the join page in three languages", () => {
  const target = (extra: object): JoinTarget => ({ name: "acme", ...extra }) as JoinTarget;
  it("member, open to ask, waiting", () => {
    const member = target({ kind: "member" });
    expect(view("pt", <JoinPage target={member} />)).toContain(
      "Você já está neste espaço de trabalho.",
    );
    expect(view("pt", <JoinPage target={member} />)).toMatch(
      /página <a [^>]*>Espaços de trabalho<\/a>\./,
    );
    expect(view("fr", <JoinPage target={member} />)).toContain(
      "Vous êtes déjà dans cet espace de travail.",
    );
    const open = target({ kind: "open", description: "The team.", request: null });
    expect(view("pt", <JoinPage target={open} />)).toMatch(
      /Entrar em <span class="font-mono">acme<\/span>/,
    );
    expect(view("fr", <JoinPage target={open} />)).toMatch(
      /Se joindre à <span class="font-mono">acme<\/span>/,
    );
    expect(view("fr", <JoinPage target={open} />)).toContain("Root ou les modérateurs");
    expect(view("en", <JoinPage target={open} />)).toMatch(
      /Join <span class="font-mono">acme<\/span>/,
    );
  });
});

describe("the Showing line in three languages", () => {
  it("says which workspace, or why none", () => {
    const line = (locale: Locale, why?: "missing" | "not-reviewer") =>
      view(locale, <Showing workspace="acme" here="/catalogue" why={why} />);
    expect(line("en")).toContain("Showing <strong");
    expect(line("pt")).toMatch(/Mostrando só <strong[^>]*>acme<\/strong>/);
    expect(line("pt", "missing")).toMatch(
      /Nenhum espaço de trabalho <strong[^>]*>acme<\/strong> que você possa ver/,
    );
    expect(line("pt", "not-reviewer")).toContain("Você não revisa submissões em");
    expect(line("fr")).toMatch(/Affichage de <strong[^>]*>acme<\/strong> seulement/);
    expect(line("fr", "not-reviewer")).toContain("Vous ne révisez pas les soumissions dans");
    expect(line("fr")).toContain(">Tout afficher<");
    expect(line("pt")).toContain(">Mostrar tudo<");
  });
});

describe("the page titles follow the language", () => {
  it("Workspaces and Join a workspace", async () => {
    expect(await inLocale("pt", () => listTitle())).toEqual({
      title: "Espaços de trabalho · Ronne AI Marketplace",
    });
    expect(await inLocale("fr", () => joinTitle())).toEqual({
      title: "Se joindre à un espace de travail · Ronne AI Marketplace",
    });
    expect(await inLocale("en", () => listTitle())).toEqual({
      title: "Workspaces · Ronne AI Marketplace",
    });
  });
});

describe("no English left behind (130)", () => {
  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: none of the English texts appears`, async () => {
      const html = [
        list(locale),
        view(locale, <JoinPage target={{ kind: "member", name: "acme" } as JoinTarget} />),
        view(
          locale,
          <JoinPage
            target={{ kind: "open", name: "acme", description: "x", request: null } as JoinTarget}
          />,
        ),
        view(locale, <AskToJoinForm workspace="acme" />),
        view(locale, <Showing workspace="acme" here="/c" />),
        view(locale, <Showing workspace="acme" here="/c" why="missing" />),
        view(locale, <AskToJoinLink workspace="acme" />),
      ].join("\n");
      expect(await englishLeaks(["workspaces"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["workspaces"], locale, html)).toBeGreaterThan(8);
    });
  }
});
