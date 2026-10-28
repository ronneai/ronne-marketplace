import type { ManifestIssue, RiskFlag } from "@ronneai/core";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RiskSummary } from "@/components/risk-flags/RiskSummary";
import type { Locale } from "@/server/domains/identity/models/locale";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import { IssueList } from "./IssueList";
import { FileIssues, IssuesSummary, useIssueCount } from "./IssuesPopover";

/**
 * The problems list and the risk summary speak the person's language around core's messages,
 * which stay English as `rmk` prints them (feature 131).
 */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const error: ManifestIssue = {
  severity: "error",
  code: "x",
  message: "`name` is required.",
  file: "a.md",
  line: 3,
};
const warning: ManifestIssue = { severity: "warning", code: "y", message: "Odd.", file: "a.md" };
const renamed: ManifestIssue = {
  ...warning,
  rename: { from: "@t/old", to: "@t/new" },
};
const flag: RiskFlag = {
  kind: "hook",
  message: "Runs `./check.sh` on every edit.",
  file: "hooks.json",
  line: 2,
  widening: true,
} as RiskFlag;

const Count = ({ issues }: { issues: ManifestIssue[] }) => <>{useIssueCount()(issues)}</>;
const count = (locale: Locale, issues: ManifestIssue[]) => view(locale, <Count issues={issues} />);

describe("problem counts by the language's plural rule", () => {
  const cases: Record<Locale, [ManifestIssue[], string][]> = {
    en: [
      [[], "No problems"],
      [[error], "1 error"],
      [[error, error], "2 errors"],
      [[warning], "1 warning"],
      [[warning, warning], "2 warnings"],
      [[error, warning, warning], "1 error, 2 warnings"],
    ],
    pt: [
      [[], "Nenhum problema"],
      [[error], "1 erro"],
      [[error, error], "2 erros"],
      [[warning], "1 aviso"],
      [[warning, warning], "2 avisos"],
      [[error, error, warning], "2 erros, 1 aviso"],
    ],
    fr: [
      [[], "Aucun problème"],
      [[error], "1 erreur"],
      [[error, error], "2 erreurs"],
      [[warning], "1 avertissement"],
      [[warning, warning], "2 avertissements"],
      [[error, warning], "1 erreur, 1 avertissement"],
    ],
  };
  for (const locale of ["en", "pt", "fr"] as const) {
    it(`${locale}: none, one and two of each`, () => {
      for (const [issues, expected] of cases[locale]) expect(count(locale, issues)).toBe(expected);
    });
  }
});

describe("the problems list in three languages", () => {
  it("prefixes each problem in the language and keeps core's message as it comes", () => {
    const html = (l: Locale) => view(l, <IssueList issues={[warning, error]} />);
    expect(html("en")).toContain(">ERR:<");
    expect(html("pt")).toContain(">ERRO:<");
    expect(html("pt")).toContain(">AVISO:<");
    expect(html("fr")).toContain(">ERREUR :<");
    expect(html("fr")).toContain('aria-label="Problèmes"');
    for (const l of ["en", "pt", "fr"] as const) {
      expect(html(l)).toContain('<code class="font-mono text-[0.85em]">name</code> is required.');
      expect(html(l)).toContain("a.md:3");
    }
  });

  it("says when there are none, and offers the new name", () => {
    expect(view("pt", <IssueList issues={[]} />)).toContain("Nenhum problema encontrado.");
    expect(view("fr", <IssueList issues={[]} />)).toContain(">OK :<");
    expect(view("fr", <IssueList issues={[renamed]} onRename={() => {}} />)).toContain(
      "Utiliser le nouveau nom",
    );
  });

  it("labels the file's icon and the summary chip", () => {
    expect(view("en", <FileIssues path="a.md" issues={[error]} />)).toContain(
      'aria-label="Show problems: 1 error"',
    );
    expect(view("pt", <FileIssues path="a.md" issues={[error, warning]} />)).toContain(
      'aria-label="Mostrar problemas: 1 erro, 1 aviso"',
    );
    expect(view("fr", <IssuesSummary issues={[warning]} />)).toContain(
      'aria-label="Problèmes : 1 avertissement"',
    );
    expect(view("pt", <IssuesSummary issues={[]} />)).toContain("Nenhum problema");
  });
});

describe("the risk summary in three languages", () => {
  it("heads and notes the flags in the language, keeping core's sentence", () => {
    const html = (l: Locale) =>
      view(l, <RiskSummary flags={[flag, { ...flag, widening: false }]} />);
    expect(html("en")).toContain("What it can do (2)");
    expect(html("en")).toContain(">WIDENS:<");
    expect(html("pt")).toContain("O que ele pode fazer (2)");
    expect(html("pt")).toContain(">AMPLIA:<");
    expect(html("fr")).toContain("Ce qu’il peut faire (2)");
    expect(html("fr")).toContain("ÉLARGIT :");
    expect(html("fr")).toContain(
      "Ces capacités sont déduites des fichiers; l’auteur ne peut ni les définir ni les masquer.",
    );
    for (const l of ["en", "pt", "fr"] as const)
      expect(html(l)).toContain('Runs <code class="font-mono text-[0.85em]">./check.sh</code>');
    // A count of flags is shown as a plain number, as before.
    const many = view("en", <RiskSummary flags={Array.from({ length: 1500 }, () => flag)} />);
    expect(many).toContain("What it can do (1500)");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English left around the problems and the flags`, async () => {
      const html = [
        view(locale, <IssueList issues={[]} />),
        view(locale, <IssueList issues={[renamed, error]} onRename={() => {}} />),
        view(locale, <FileIssues path="a.md" issues={[error]} />),
        view(locale, <IssuesSummary issues={[error, warning]} />),
        view(locale, <RiskSummary flags={[flag]} />),
      ].join("\n");
      expect(await englishLeaks(["author", "common"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["author"], locale, html)).toBeGreaterThan(4);
    });
  }
});
