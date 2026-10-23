import { EditorView } from "@codemirror/view";
import { formatBytes } from "@ronneai/core";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { stateFor } from "@/components/code/CodeEditor";
import { FileTree } from "@/components/code/FileTree";
import { useBytes } from "@/i18n/bytes";
import type { Locale } from "@/server/domains/identity/models/locale";
import type { ContentFile } from "@/server/domains/items/models/contents";
import type { FileChange } from "@/server/domains/submissions/models/diff";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import { FileContent } from "./FileContent";
import { FilesBrowser } from "./FilesBrowser";
import { FileChanges } from "./FileViews";
import { showFiles } from "./shown";
import type { ShownFile } from "./types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/items/team/reviewer",
  useSearchParams: () => new URLSearchParams("tab=files"),
}));

/** The Files tab, the file tree and the diffs speak the person's language (feature 131). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const text = (path: string, body: string, executable = false): ContentFile => ({
  path,
  size: new TextEncoder().encode(body).length,
  executable,
  kind: "text",
  text: body,
});
const binary: ContentFile = { path: "logo.png", size: 2048, executable: false, kind: "binary" };
const large: ContentFile = {
  path: "data.json",
  size: Math.round(1.5 * 1024 * 1024),
  executable: false,
  kind: "large",
};
const [markdown] = showFiles([text("SKILL.md", "---\nname: a\n---\n")]) as [ShownFile];

const changes: FileChange[] = [
  {
    path: "run.sh",
    status: "changed",
    executableChanged: true,
    hunks: [
      {
        lines: [
          { kind: "removed", text: "old", before: 1 },
          { kind: "added", text: "new", after: 1 },
        ],
      },
    ],
  } as FileChange,
  { path: "logo.png", status: "added", binary: true, sizeAfter: 1536 * 1024 } as FileChange,
  { path: "big.json", status: "removed", hunks: "too_large" } as FileChange,
];

describe("a file in three languages", () => {
  const cases: Record<Locale, string[]> = {
    en: ["executable", "This file is empty.", "A binary file, not shown here.", "1.5 MB", "2 KB"],
    pt: [
      "executável",
      "Este arquivo está vazio.",
      "Um arquivo binário, não exibido aqui.",
      "Grande demais para exibir aqui (1,5 MB).",
      "2 KB",
    ],
    fr: [
      "exécutable",
      "Ce fichier est vide.",
      "Un fichier binaire, non affiché ici.",
      "Trop volumineux pour l’afficher ici (1,5 Mo).",
      "2 Ko",
    ],
  };
  for (const locale of ["en", "pt", "fr"] as const) {
    it(`${locale}: its badge, empty, binary and large files, with sizes in the language`, () => {
      const html = [
        view(locale, <FileContent file={text("run.sh", "", true)} />),
        view(locale, <FileContent file={binary} />),
        view(locale, <FileContent file={large} />),
      ].join("\n");
      for (const expected of cases[locale]) expect(html, expected).toContain(expected);
      expect(html).toContain('<code class="font-mono">rmk install</code>');
    });
  }

  it("names the Markdown views and the frontmatter", () => {
    expect(view("pt", <FileContent file={markdown} />)).toContain("Renderizado");
    expect(view("pt", <FileContent file={markdown} />)).toContain("Código-fonte");
    expect(view("fr", <FileContent file={markdown} />)).toContain('aria-label="Frontmatter"');
    expect(view("fr", <FileContent file={markdown} />)).toContain("Rien après le frontmatter.");
  });

  it("names the tree and its files' marks", () => {
    const files = [{ path: "a/run.sh", size: 10, executable: true, dirty: true }];
    const html = (l: Locale) =>
      view(l, <FileTree files={files} selected="a/run.sh" onSelect={() => {}} />);
    expect(html("en")).toContain('aria-label="Files"');
    expect(html("pt")).toContain('aria-label="Arquivos"');
    expect(html("pt")).toContain('aria-label="Executável"');
    expect(html("pt")).toContain("(não salvo)");
    expect(html("fr")).toContain("(non enregistré)");
    expect(html("fr")).toContain("1 Ko");
    const browser = (l: Locale) =>
      view(l, <FilesBrowser files={[text("a.md", "x")]} selected="a.md" />);
    expect(browser("en")).toContain('aria-label="Files of this version"');
    expect(browser("pt")).toContain('aria-label="Arquivos desta versão"');
    expect(browser("fr")).toContain('aria-label="Fichiers de cette version"');
  });

  it("labels the editor's contents with the path", () => {
    const label = (words: string) =>
      stateFor("a.md", "", () => {}, true, { current: null }, words).facet(
        EditorView.contentAttributes,
      );
    expect(JSON.stringify(label("Conteúdo de a.md"))).toContain('"aria-label":"Conteúdo de a.md"');
  });
});

describe("sizes in three languages, rounded as core's formatBytes", () => {
  const Size = ({ bytes }: { bytes: number }) => <>{useBytes()(bytes)}</>;
  const size = (l: Locale, bytes: number) => view(l, <Size bytes={bytes} />);
  const MB = 1024 * 1024;
  it("matches formatBytes in English, number for number", () => {
    for (const bytes of [
      0,
      1,
      1023,
      1024,
      1025,
      999 * 1024,
      1000 * 1024,
      MB - 1,
      MB,
      MB + 1,
      1.5 * MB,
      5000 * MB,
    ])
      expect(size("en", bytes), String(bytes)).toBe(formatBytes(bytes));
    expect(size("en", MB + 1)).toBe("1.0 MB");
  });
  it("writes the number and the unit in the language", () => {
    expect(size("pt", MB + 1)).toBe("1,0 MB");
    expect(size("pt", 1.5 * MB)).toBe("1,5 MB");
    expect(size("fr", 1.5 * MB)).toBe("1,5 Mo");
    expect(size("fr", MB)).toBe("1 Mo");
    expect(size("fr", 1000 * 1024)).toBe("1000 Ko");
  });
});

describe("what changed, in three languages", () => {
  it("names each change and its lines", () => {
    const html = (l: Locale) => view(l, <FileChanges changes={changes} since={2} />);
    expect(html("en")).toContain("executable changed");
    expect(html("en")).toContain("A binary file, now 1.5 MB.");
    expect(html("en")).toContain("Added: </span>");
    expect(html("pt")).toContain(">alterado<");
    expect(html("pt")).toContain(">adicionado<");
    expect(html("pt")).toContain(">removido<");
    expect(html("pt")).toContain("Um arquivo binário, agora com 1,5 MB.");
    expect(html("pt")).toContain("Removida: </span>");
    expect(html("fr")).toContain("Un fichier binaire, maintenant de 1,5 Mo.");
    expect(html("fr")).toContain(
      "Trop volumineux pour comparer ici : voyez-le sous Tous les fichiers.",
    );
    expect(html("fr")).toContain("Ajoutée : </span>");
  });

  it("says when nothing changed, since a revision or not", () => {
    expect(view("en", <FileChanges changes={[]} since={2} />)).toContain(
      "No changes since revision 2.",
    );
    expect(view("en", <FileChanges changes={[]} since={null} />)).toContain("No changes.");
    // A revision is a number, not an amount: no digit grouping, as before.
    expect(view("en", <FileChanges changes={[]} since={1234} />)).toContain("revision 1234.");
    expect(view("fr", <FileChanges changes={[]} since={1234} />)).toContain("révision 1234.");
    expect(view("pt", <FileChanges changes={[]} since={2} />)).toContain(
      "Nenhuma alteração desde a revisão 2.",
    );
    expect(view("fr", <FileChanges changes={[]} since={null} />)).toContain("Aucune modification.");
  });

  it("names the files under .ronne/ in one sentence, in the language's order", () => {
    const layout = (l: Locale) =>
      view(l, <FileChanges changes={[]} unreleased={[".ronne/layout.json"]} since={null} />);
    expect(layout("en")).toContain(
      'The canvas layout (<span><code class="font-mono text-[0.85em]">.ronne/layout.json</code></span>) changed too.',
    );
    expect(layout("pt")).toContain("O layout do canvas (<span><code");
    expect(layout("fr")).toContain("La disposition du canevas (<span><code");
    const two = (l: Locale) =>
      view(
        l,
        <FileChanges
          changes={[]}
          unreleased={[".ronne/layout.json", ".ronne/{x}.md"]}
          since={null}
        />,
      );
    expect(two("en")).toContain(".ronne/{x}.md</code></span> changed too. Files in .ronne/");
    expect(two("pt")).toContain(".ronne/{x}.md</code></span> também mudaram.");
    expect(two("fr")).toContain(".ronne/{x}.md</code></span> ont aussi changé.");
    const one = (l: Locale) =>
      view(l, <FileChanges changes={[]} unreleased={[".ronne/notes.md"]} since={null} />);
    expect(one("en")).toContain(".ronne/notes.md</code></span> changed too.");
    expect(one("pt")).toContain(".ronne/notes.md</code></span> também mudou.");
    expect(one("fr")).toContain(".ronne/notes.md</code></span> a aussi changé.");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English left in a file, the tree and a diff`, async () => {
      const html = [
        view(locale, <FileContent file={text("run.sh", "", true)} />),
        view(locale, <FileContent file={binary} />),
        view(locale, <FileContent file={markdown} />),
        view(locale, <FileChanges changes={changes} since={2} />),
        view(locale, <FileChanges changes={[]} unreleased={[".ronne/a"]} since={1} />),
      ].join("\n");
      expect(await englishLeaks(["author"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["author"], locale, html)).toBeGreaterThan(6);
    });
  }
});
