import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import { planReleases } from "@/server/domains/submissions/models/release-plan";
import { englishLeaks } from "@/test/english-leak";
import { inLocale } from "@/test/intl";

vi.mock("./actions", () => ({ prepareReleaseAction: vi.fn(), releaseSelectedAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const {
  BulkReleaseProvider,
  BulkReleaseToolbar,
  ReleasePreview,
  ReleaseResults,
  ReleaseSelectCell,
  SettingsForm,
} = await import("./BulkRelease");

/** Releasing many at once speaks the person's language (feature 131). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node)).replace(/<!-- -->/g, "");
const withoutHelp = (text: string) =>
  text
    .replace(/<button[^>]*aria-haspopup="dialog"[^>]*>.*?<\/button>/g, "")
    .replace(/<noscript>.*?<\/noscript>/g, "");

const candidate = (name: string, published: string[], includedFor?: string[]) => ({
  id: name,
  name,
  type: "skill" as const,
  author: "Ada",
  published,
  suggested: "minor" as const,
  dependsOn: [],
  ...(includedFor ? { includedFor } : {}),
});
const candidates = [
  candidate("@t/new", []),
  candidate("@t/old", ["1.0.0"], ["@t/new"]),
  candidate("@t/rc", ["1.0.0", "1.1.0-rc.1"]),
];
const settingsOf = (kind: "stable" | "prerelease", tag = "") =>
  kind === "stable"
    ? { kind, bump: "suggested" as const, tag }
    : { kind, id: "beta", bump: "suggested" as const, tag };
const preview = (locale: Locale, kind: "stable" | "prerelease", tag = "") =>
  view(
    locale,
    <ReleasePreview
      candidates={candidates}
      refused={[
        { id: "x", name: "@t/x", result: "not_releasable", reason: "Not yours." },
        { id: "y", name: null, result: "not_found" },
      ]}
      plans={planReleases(candidates, settingsOf(kind, tag))}
      loading={false}
    />,
  );

describe("releasing many at once in three languages", () => {
  it("words the settings", () => {
    const form = (l: Locale) =>
      view(
        l,
        <SettingsForm
          settings={settingsOf("prerelease")}
          onChange={() => {}}
          notes=""
          onNotes={() => {}}
        />,
      );
    expect(form("pt")).toContain(">Lançar como<");
    expect(form("pt")).toContain('aria-label="Id do pré-lançamento"');
    expect(form("pt")).toContain(">Sugerido para cada um<");
    expect(form("fr")).toContain('placeholder="latest, ou next pour une préversion"');
    expect(form("fr")).toContain(">Major pour tous<");
  });

  it("words each plan: first release, after a version, included for, and why one can't go", () => {
    const en = preview("en", "stable");
    expect(en).toContain("Ada · first release");
    expect(en).toContain("Ada · after 1.0.0 · minor (suggested)");
    expect(en).toContain("1.1.0 as latest");
    const pt = preview("pt", "stable");
    expect(pt).toContain("Ada · primeiro lançamento");
    expect(pt).toContain("Ada · depois da 1.0.0 · minor (sugerido)");
    expect(pt).toContain("1.1.0 como latest");
    expect(pt).toContain(">incluído por causa de @t/new<");
    expect(pt).toContain("Not yours.");
    expect(pt).toContain("Ele não existe, ou você não pode vê-lo.");
    // A beta of the next minor sorts before 1.1.0-rc.1: no version.
    expect(preview("fr", "prerelease")).toContain(
      "Cela ne donne pas de nouvelle version : un identifiant de préversion",
    );
    expect(preview("fr", "stable", "x")).toContain(
      "x se lit comme une plage de versions, donc ce ne peut pas être une étiquette.",
    );
    expect(preview("pt", "stable", "Bad!")).toContain("Uma tag tem de 1 a 32 letras minúsculas");
    expect(
      view("fr", <ReleasePreview candidates={candidates} refused={[]} plans={[]} loading />),
    ).toContain("Calcul de l’ordre…");
  });

  it("words what happened to each", () => {
    const results = (l: Locale) =>
      view(
        l,
        <ReleaseResults
          results={[
            {
              id: "a",
              name: "@t/a",
              result: "published",
              version: "1.0.0",
              tag: "latest",
              sha256: "abcdef0123456789",
            },
            { id: "b", name: "@t/b", result: "skipped", reason: "Its group failed." },
            { id: "c", name: null, result: "not_found" },
          ]}
        />,
      );
    expect(results("pt")).toContain(">Publicado:<");
    expect(results("pt")).toContain("1.0.0 como latest · sha256 abcdef012345…");
    expect(results("pt")).toContain(">Pulado:<");
    expect(results("fr")).toContain(">Non publié :<");
  });

  it("words the toolbar and the checkbox, with the count", () => {
    const toolbar = (l: Locale, label?: string) =>
      view(
        l,
        <BulkReleaseProvider releasable={{ a: "@t/a", b: "@t/b" }}>
          <BulkReleaseToolbar selectAllLabel={label} />
          <ReleaseSelectCell id="a" name="@t/a" />
        </BulkReleaseProvider>,
      );
    expect(toolbar("en")).toContain("Select all approved (2)");
    expect(toolbar("pt")).toContain("Selecionar todos os aprovados (2)");
    expect(toolbar("pt")).toContain("Lançar selecionados (0)");
    expect(toolbar("fr")).toContain('aria-label="Sélectionner @t/a pour le publier"');
    expect(toolbar("fr", "Tout sélectionner")).toContain("Tout sélectionner (2)");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English left in the release dialog's parts`, async () => {
      const all = withoutHelp(
        [
          view(
            locale,
            <SettingsForm
              settings={settingsOf("stable")}
              onChange={() => {}}
              notes=""
              onNotes={() => {}}
            />,
          ),
          preview(locale, "stable"),
          preview(locale, "prerelease"),
          view(
            locale,
            <ReleaseResults
              results={[
                {
                  id: "a",
                  name: "@t/a",
                  result: "published",
                  version: "1.0.0",
                  tag: "latest",
                  sha256: "abc",
                },
                { id: "c", name: null, result: "not_found" },
              ]}
            />,
          ),
          view(
            locale,
            <BulkReleaseProvider releasable={{ a: "@t/a" }}>
              <BulkReleaseToolbar />
            </BulkReleaseProvider>,
          ),
        ].join("\n"),
      );
      expect(await englishLeaks(["author", "common"], locale, all)).toEqual([]);
    });
  }
});
