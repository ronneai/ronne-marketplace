import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import type { DependencyMark } from "@/server/domains/submissions/actions/submissions";
import {
  SUBMISSION_STATUSES,
  type SubmissionStatus,
} from "@/server/domains/submissions/models/status";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import { textOf } from "@/test/text";
import {
  DependencyMarksIcon,
  DependencyMarksNotice,
  DependencyStatusBadge,
} from "./DependencyMarks";
import { ProposalBadges } from "./ProposalBadges";
import { StatusBadge } from "./StatusBadge";

/** The words the authoring and review screens share speak the person's language (feature 131). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const badge = (locale: Locale, status: SubmissionStatus) =>
  textOf(view(locale, <StatusBadge status={status} />));

const waits = (status: Extract<DependencyMark, { kind: "waits" }>["status"]): DependencyMark => ({
  kind: "waits",
  dependency: "@t/a",
  status,
});
const blocked = (
  status: Extract<DependencyMark, { kind: "blocked" }>["status"],
  through: string[] = [],
): DependencyMark => ({ kind: "blocked", dependency: "@t/a", status, through });

describe("StatusBadge in three languages", () => {
  const cases: Record<Locale, Record<SubmissionStatus, string>> = {
    en: {
      draft: "draft",
      submitted: "submitted",
      changes_requested: "changes requested",
      approved: "approved",
      rejected: "rejected",
      withdrawn: "archived",
      published: "published",
    },
    pt: {
      draft: "rascunho",
      submitted: "submetido",
      changes_requested: "alterações solicitadas",
      approved: "aprovado",
      rejected: "rejeitado",
      withdrawn: "arquivado",
      published: "publicado",
    },
    fr: {
      draft: "brouillon",
      submitted: "soumis",
      changes_requested: "modifications demandées",
      approved: "approuvé",
      rejected: "rejeté",
      withdrawn: "archivé",
      published: "publié",
    },
  };
  for (const locale of ["en", "pt", "fr"] as const) {
    it(`${locale}: every status, withdrawn as archived (057)`, () => {
      for (const status of SUBMISSION_STATUSES)
        expect(badge(locale, status), status).toBe(cases[locale][status]);
    });
  }
});

describe("ProposalBadges in three languages", () => {
  const proposal = { baseVersion: "1.2.0" } as Parameters<typeof ProposalBadges>[0]["proposal"];
  it("names the version it changes, and says when it's stale", () => {
    const html = (l: Locale) => view(l, <ProposalBadges proposal={proposal} stale="1.3.0" />);
    expect(html("en")).toContain("change to 1.2.0");
    expect(html("en")).toContain('title="1.3.0 has been released since: rebase first."');
    expect(html("pt")).toContain("alteração da 1.2.0");
    expect(html("pt")).toContain(">desatualizado<");
    expect(html("fr")).toContain("modification de 1.2.0");
    expect(html("fr")).toContain("La 1.3.0 a été publiée depuis : faites d’abord un rebase.");
  });

  it("shows nothing for a new item", () => {
    expect(view("pt", <ProposalBadges proposal={null} />)).toBe("");
  });
});

describe("dependency marks in three languages", () => {
  it("words a waiting dependency, its badge and its sentence", () => {
    const html = (l: Locale) => view(l, <DependencyStatusBadge mark={waits("approved")} />);
    expect(html("en")).toContain('aria-label="Waits on @t/a (pending release)"');
    expect(html("pt")).toContain('aria-label="Aguarda @t/a (aguardando lançamento)"');
    expect(html("pt")).toContain("aguardando lançamento<");
    expect(html("fr")).toContain('aria-label="Attend @t/a (en attente de publication)"');
  });

  it("words each waiting status for its badge", () => {
    const words: Record<Locale, string[]> = {
      en: ["in review", "back with its author", "pending release", "not submitted"],
      pt: ["em revisão", "de volta com o autor", "aguardando lançamento", "não submetido"],
      fr: ["en révision", "renvoyé à son auteur", "en attente de publication", "non soumis"],
    };
    const statuses = ["submitted", "changes_requested", "approved", "not_submitted"] as const;
    for (const l of ["en", "pt", "fr"] as const)
      statuses.forEach((status, i) => {
        const text = textOf(view(l, <DependencyStatusBadge mark={waits(status)} />));
        expect(text, `${l} ${status}`).toBe(words[l][i]);
      });
  });

  it("words a blocked dependency, directly and through another", () => {
    const text = (l: Locale, mark: DependencyMark) =>
      view(l, <DependencyStatusBadge mark={mark} />);
    expect(text("pt", blocked("rejected"))).toContain("Bloqueado: @t/a foi rejeitado");
    expect(text("fr", blocked("withdrawn"))).toContain("Bloqué : @t/a a été archivé");
    expect(text("pt", blocked("withdrawn", ["@t/b"]))).toContain(
      "Bloqueado: @t/a aguarda @t/b, que foi arquivado",
    );
    expect(text("fr", blocked("rejected", ["@t/b"]))).toContain("@t/b rejeté<");
  });

  it("counts the icon's dependencies by the language's plural rule", () => {
    const label = (l: Locale, marks: DependencyMark[]) =>
      view(l, <DependencyMarksIcon marks={marks} />).match(/aria-label="([^"]+)"/)?.[1];
    const one = [waits("submitted")];
    const two = [waits("submitted"), waits("approved")];
    const problem = [blocked("rejected")];
    const problems = [blocked("rejected"), waits("approved")];
    expect(label("en", one)).toBe("1 dependency not released yet");
    expect(label("en", two)).toBe("2 dependencies not released yet");
    expect(label("en", problem)).toBe("1 dependency with a problem");
    expect(label("en", problems)).toBe("2 dependencies with a problem");
    expect(label("pt", one)).toBe("1 dependência ainda não lançada");
    expect(label("pt", two)).toBe("2 dependências ainda não lançadas");
    expect(label("pt", problem)).toBe("1 dependência com problema");
    expect(label("pt", problems)).toBe("2 dependências com problema");
    expect(label("fr", one)).toBe("1 dépendance pas encore publiée");
    expect(label("fr", two)).toBe("2 dépendances pas encore publiées");
    expect(label("fr", problem)).toBe("1 dépendance avec un problème");
    expect(label("fr", problems)).toBe("2 dépendances avec un problème");
    // With none there's no icon, in any language.
    for (const l of ["en", "pt", "fr"] as const)
      expect(view(l, <DependencyMarksIcon marks={[]} />)).toBe("");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: the notice leaves no English behind`, async () => {
      const html = [
        view(locale, <DependencyMarksNotice marks={[blocked("rejected"), waits("submitted")]} />),
        view(locale, <DependencyMarksNotice marks={[waits("changes_requested")]} />),
        ...SUBMISSION_STATUSES.map((status) => view(locale, <StatusBadge status={status} />)),
      ].join("\n");
      expect(await englishLeaks(["author"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["author"], locale, html)).toBeGreaterThan(3);
    });
  }

  it("a dependency name that looks like a placeholder is shown as typed", () => {
    const mark = { ...waits("submitted"), dependency: "@t/{status}" };
    expect(view("pt", <DependencyStatusBadge mark={mark} />)).toContain("Aguarda @t/{status}");
  });
});
