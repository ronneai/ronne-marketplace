import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import type { PathIssue } from "./files";
import type { EditorDraft, EditorProposal, GroupMember } from "./types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("./actions", () => ({}));
vi.mock("./dependency-picker/actions", () => ({ findDependenciesAction: vi.fn() }));

const { DraftEditor } = await import("./DraftEditor");
const { DeleteFileDialog, DraftSettingsDialog, ImportZipDialog, PathDialog, usePathWords } =
  await import("./FileDialogs");
const {
  DeleteArchivedDialog,
  GroupList,
  RestoreButton,
  SubmitDialog,
  SubmitOutcome,
  useSubmitWords,
  WithdrawButton,
  WithdrawDialog,
} = await import("./SubmitDialogs");
const { ProposalBar } = await import("./ProposalBar");

/** The draft editor, its notices and its dialogs speak the person's language (feature 131). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node)).replace(/<!-- -->/g, "");

/** Without the inline helpers (their question and answer), which move in task 11 (still English). */
const withoutHelp = (html: string) =>
  html
    .replace(/<button[^>]*aria-haspopup="dialog"[^>]*>.*?<\/button>/g, "")
    .replace(/<noscript>.*?<\/noscript>/g, "");

/** What a hook gives, in a language: hooks run inside a render. */
const grab = <T,>(locale: Locale, hook: () => T): T => {
  let value: T | undefined;
  const Grab = () => {
    value = hook();
    return null;
  };
  view(locale, <Grab />);
  return value as T;
};

const T1 = "2026-09-27T10:00:00.000Z";
const file = (path: string, content: string, encoding: "utf8" | "base64" = "utf8") => ({
  path,
  encoding,
  content,
  size: content.length,
  executable: false,
  loadedAt: T1,
  dirty: false,
});
const draft = (overrides: Partial<EditorDraft> = {}): EditorDraft => ({
  id: "d1",
  workspace: "global",
  scope: "platform",
  name: "reviewer",
  type: "agent",
  status: "draft",
  submittedAt: null,
  files: [
    file("logo.png", "iVBORw==", "base64"),
    file("prompt.md", "Hi"),
    file(
      "ronne.yaml",
      'name: "@platform/reviewer"\ntype: agent\ndescription: x\nagent:\n  prompt: prompt.md\n',
    ),
  ],
  mine: true,
  readOnly: false,
  canSubmit: true,
  canWithdraw: true,
  versionsHref: null,
  proposal: null,
  ...overrides,
});
const editor = (locale: Locale, overrides: Partial<EditorDraft> = {}, initialPath?: string) =>
  view(locale, <DraftEditor draft={draft(overrides)} initialPath={initialPath} />);

const submitted = {
  status: "submitted" as const,
  readOnly: true,
  canSubmit: false,
  submittedAt: T1,
};
const member = (name: string, ready = true, extra: Partial<GroupMember> = {}): GroupMember => ({
  id: `id-${name}`,
  name,
  neededBy: [],
  inCycle: false,
  ready,
  issues: [],
  ...extra,
});
const proposal = (overrides: Partial<EditorProposal> = {}): EditorProposal => ({
  itemName: "@platform/reviewer",
  baseVersion: "1.0.0",
  baseHref: "/items/platform/reviewer?version=1.0.0",
  stale: null,
  canRebase: true,
  canResolve: true,
  conflicts: [],
  ...overrides,
});

describe("the editor's header, toolbar and status in three languages", () => {
  it("words the header's buttons, totals and the file panel", () => {
    const en = editor("en");
    expect(en).toMatch(/3 of \d+ files · \d+ KB of \d+ MB/);
    expect(en).toContain(">Submit for review<");
    const pt = editor("pt");
    expect(pt).toContain(">Configurações<");
    expect(pt).toContain(">Salvo<");
    expect(pt).toContain(">Retirar<");
    expect(pt).toContain(">Submeter para revisão<");
    expect(pt).toContain("Arquivos (3)");
    expect(pt).toContain(">Importar .zip<");
    expect(pt).toMatch(/3 de \d+ arquivos · \d+ KB de \d+ MB/);
    const fr = editor("fr", { personal: true, status: "changes_requested" });
    expect(fr).toContain(">Soumettre de nouveau<");
    expect(fr).toContain(">Téléverser<");
    expect(fr).toContain('aria-label="Éditeur"');
  });

  it("words a file's toolbar and a binary file", () => {
    const binary = (l: Locale) => editor(l, {}, "logo.png");
    expect(binary("pt")).toContain(">Executável<");
    expect(binary("pt")).toContain(">Renomear<");
    expect(binary("pt")).toContain("Um arquivo binário, 1 KB.");
    expect(binary("fr")).toContain(">Remplacer<");
    expect(binary("fr")).toContain('aria-label="Remplacer logo.png"');
    expect(editor("fr", {}, "prompt.md")).toContain(">Fichier de départ<");
    expect(editor("fr", {}, "prompt.md")).toContain(
      "Un des fichiers de départ d’un agent : modifiez-le",
    );
  });

  it("words each read-only notice", () => {
    expect(editor("en", submitted)).toContain("Submitted for review on <time");
    expect(editor("pt", submitted)).toContain("Submetido para revisão em <time");
    expect(editor("pt", { ...submitted, submittedAt: null })).toContain("Submetido para revisão.");
    expect(editor("fr", submitted)).toContain("Ses fichiers sont figés");
    expect(editor("pt", { ...submitted, mine: false, canWithdraw: false })).toContain(
      "Submissão de outra pessoa.",
    );
    const approved = { ...submitted, status: "approved" as const };
    expect(editor("fr", { ...approved, selfApproved: true })).toContain(
      "Approuvé par vous : les espaces de travail personnels ne sont pas révisés.",
    );
    expect(editor("pt", approved)).toContain(
      "Está pronto para lançar, por você ou por um moderador.",
    );
    expect(editor("fr", { ...submitted, status: "published" })).toContain(">Publié.<");
    const notMember = editor("pt", { ...submitted, notMemberOf: "acme" });
    expect(notMember).toContain("Você não é mais membro de acme.");
    expect(notMember).toMatch(/Para trabalhar nele de novo, <a [^>]*>[^<]+<\/a>; os moderadores/);
  });

  it("words the archived notice and the feedback at the top", () => {
    const archived = editor("pt", {
      status: "withdrawn",
      readOnly: true,
      canSubmit: false,
      canWithdraw: false,
      canRestore: true,
      canDelete: true,
    });
    expect(archived).toContain("Arquivado.");
    expect(archived).toContain(">Restaurar<");
    expect(archived).toContain(">Excluir de vez<");
    const back = (l: Locale, kind: "request_changes" | "reject" | "rebase", body: string | null) =>
      editor(l, {
        status: kind === "reject" ? "rejected" : "changes_requested",
        feedback: { kind, by: "Rae", at: T1, body },
      });
    expect(back("en", "request_changes", "Tighten it.")).toContain(
      "Changes requested by Rae, <time",
    );
    expect(back("pt", "request_changes", "Tighten it.")).toContain(
      "Alterações solicitadas por Rae, <time",
    );
    expect(back("pt", "request_changes", "Tighten it.")).toContain("Tighten it.");
    expect(back("fr", "reject", null)).toContain("Rejeté par Rae, <time");
    expect(back("fr", "reject", null)).toContain("Un rejet est définitif");
    expect(back("pt", "rebase", "1.2.0")).toContain("sobre a 1.2.0.");
    expect(back("fr", "request_changes", null)).toContain(">Voir la conversation<");
  });

  it("words the reasons Submit is off, and its label", () => {
    const words = (l: Locale) => grab(l, useSubmitWords);
    expect(words("pt").label(false, [member("@t/a")])).toBe("Submeter com mais 1 rascunho");
    expect(words("fr").label(true, [member("@t/a"), member("@t/b")])).toBe(
      "Soumettre de nouveau avec 2 autres brouillons",
    );
    expect(words("pt").label(true, [], true)).toBe("Ressubmeter");
    expect(
      words("fr").blocked({
        ok: true,
        issues: [],
        members: [member("@t/{x}", false)],
        inCycle: false,
      }),
    ).toBe("@t/{x} n’est pas prêt : corrigez d’abord ses erreurs.");
    const error = { severity: "error" as const, code: "x", message: "Broken." };
    expect(words("pt").blocked({ ok: true, issues: [error], members: [], inCycle: false })).toBe(
      "Corrija os erros dele primeiro.",
    );
  });

  it("words each path problem", () => {
    const words = (l: Locale, issue: PathIssue) => grab(l, usePathWords)(issue);
    expect(words("pt", { kind: "exists", path: "a.md" })).toBe("Já existe um arquivo em a.md.");
    expect(words("fr", { kind: "folder", path: "docs" })).toBe("docs est un dossier.");
    expect(words("pt", { kind: "path", problem: "too_long" })).toBe(
      "O caminho tem mais de 255 caracteres.",
    );
    expect(words("fr", { kind: "path", problem: "outside" })).toBe(
      "Le chemin sort de l’élément avec « .. ».",
    );
    expect(words("en", { kind: "path", problem: "backslash" })).toBe(
      "The path uses \\ (use / between folders).",
    );
    expect(words("pt", { kind: "manifest" })).toBe(
      "O ronne.yaml não pode ser renomeado: todo item tem um.",
    );
  });
});

describe("the editor's dialogs in three languages", () => {
  it("words the path, delete, import and settings dialogs", () => {
    const path = view(
      "pt",
      <PathDialog
        title="Novo arquivo"
        label="Caminho"
        hint="Use /"
        initial=""
        confirm="Criar"
        problem={() => null}
        onDone={() => {}}
        onClose={() => {}}
      />,
    );
    expect(path).toContain(">Cancelar<");
    expect(
      view("fr", <DeleteFileDialog path="a/{x}.md" onDone={() => {}} onClose={() => {}} />),
    ).toContain('Supprimer <span class="font-mono">a/{x}.md</span>? Il est retiré du brouillon');
    expect(view("pt", <ImportZipDialog draftId="d" dirty onClose={() => {}} />)).toContain(
      "Salve ou desfaça suas alterações primeiro",
    );
    const zip = view("fr", <ImportZipDialog draftId="d" dirty={false} onClose={() => {}} />);
    expect(zip).toContain("Fusionner : les fichiers de l’archive");
    expect(zip).toContain(">Importer<");
    const settings = (l: Locale, isProposal: boolean) =>
      view(
        l,
        <DraftSettingsDialog
          draftId="d"
          scope="platform"
          name="reviewer"
          dirty={false}
          proposal={isProposal}
          onClose={() => {}}
        />,
      );
    expect(settings("pt", false)).toContain("O tipo não pode mudar.");
    expect(settings("pt", false)).toContain(">Excluir rascunho<");
    expect(settings("fr", true)).toContain(
      'garde la portée et le nom de son élément : <span class="font-mono">@platform/reviewer</span>.',
    );
  });

  it("words the submit dialog, its group and what went", () => {
    const dialog = (l: Locale, dirty: boolean) =>
      view(
        l,
        <SubmitDialog draftId="d" itemName="@platform/reviewer" dirty={dirty} onClose={() => {}} />,
      );
    expect(dialog("pt", true)).toContain("Salve suas alterações primeiro");
    expect(dialog("fr", false)).toContain("Vérification de @platform/reviewer…");
    const group = (l: Locale) =>
      view(
        l,
        <GroupList
          itemName="@t/agent"
          members={[
            member("@t/skill", true, { inCycle: true }),
            member("@t/rule", false, { neededBy: ["@t/agent", "@t/skill", "@t/x"] }),
          ]}
        />,
      );
    expect(group("en")).toContain("Needed by @t/agent, @t/skill, and @t/x");
    expect(group("pt")).toContain("Vai junto com 2 dos seus rascunhos:");
    expect(group("pt")).toContain("Necessário para @t/agent, @t/skill e @t/x");
    expect(group("fr")).toContain(">interdépendants<");
    expect(group("fr")).toContain(">pas prêt<");
    expect(group("fr")).toContain("Requis par @t/agent, @t/skill et @t/x");
    expect(
      view("pt", <SubmitOutcome itemName="@t/agent" sent={["@t/skill", "@t/rule"]} />),
    ).toContain("@t/agent foi submetido para revisão, com @t/skill e @t/rule.");
    expect(
      view("fr", <SubmitOutcome itemName="@t/agent" sent={["@t/skill"]} personal />),
    ).toContain("@t/agent est soumis, avec @t/skill.");
  });

  it("words the withdraw, delete and restore controls, with counts", () => {
    const withdraw = (l: Locale, dependents: number, canDelete: boolean) =>
      view(
        l,
        <WithdrawDialog
          draftId="d"
          itemName="@t/a"
          dependents={dependents}
          canDelete={canDelete}
          onClose={() => {}}
        />,
      );
    expect(withdraw("en", 1, true)).toContain(
      "1 submission depends on this. It&#x27;s blocked until another submission of @t/a comes along.",
    );
    expect(withdraw("pt", 1, true)).toContain("1 submissão depende dele.");
    expect(withdraw("pt", 2, true)).toContain("2 submissões dependem dele.");
    expect(withdraw("fr", 0, false)).toContain("Des réviseurs l’ont commenté ou en ont décidé.");
    expect(withdraw("fr", 2, false)).toContain("2 soumissions en dépendent.");
    expect(withdraw("pt", 0, true)).toContain("Retirar @t/a?");
    expect(
      view("fr", <DeleteArchivedDialog draftId="d" itemName="@t/a" onClose={() => {}} />),
    ).toContain("Supprimer @t/a définitivement?");
    expect(view("pt", <WithdrawButton draftId="d" itemName="@t/a" />)).toContain(
      'aria-label="Retirar: @t/a"',
    );
    expect(view("fr", <RestoreButton draftId="d" />)).toContain(">Restaurer<");
  });

  it("words the proposal bar, fresh, stale and with conflicts", () => {
    const bar = (l: Locale, p: EditorProposal, status = "draft") =>
      view(l, <ProposalBar draftId="d" proposal={p} status={status} dirty />);
    expect(bar("pt", proposal())).toContain("Uma alteração de @platform/reviewer 1.0.0.");
    expect(bar("pt", proposal())).toContain(">Ver a 1.0.0<");
    const stale = proposal({ stale: "1.1.0" });
    expect(bar("fr", stale)).toContain(
      "La 1.1.0 a été publiée depuis le début de cette proposition.",
    );
    expect(bar("fr", stale)).toContain("Faire un rebase sur la 1.1.0");
    expect(bar("fr", stale)).toContain("Enregistrez d’abord vos modifications.");
    expect(bar("pt", stale, "submitted")).toContain("Ela volta para alterações solicitadas");
    expect(bar("pt", stale, "draft")).not.toContain("Ela volta para alterações solicitadas");
    const conflicts = proposal({
      conflicts: [
        { path: "a.md", change: null },
        { path: "b.md", change: { path: "b.md", status: "changed", hunks: [] } as never },
      ],
    });
    expect(bar("pt", conflicts)).toContain("Conflitos (2)");
    expect(bar("pt", conflicts)).toContain("Comparar com a 1.0.0");
    expect(bar("fr", conflicts)).toContain("Les fichiers de la 1.0.0 n’ont pas pu être lus");
    expect(bar("fr", conflicts)).toContain(">Marquer résolu<");
  });
});

for (const locale of ["pt", "fr"] as const) {
  it(`${locale}: no English left in the editor and its dialogs`, async () => {
    const html = withoutHelp(
      [
        editor(locale),
        editor(locale, {}, "logo.png"),
        editor(locale, submitted),
        editor(locale, { ...submitted, notMemberOf: "acme" }),
        editor(locale, {
          status: "withdrawn",
          readOnly: true,
          canSubmit: false,
          canRestore: true,
          canDelete: true,
        }),
        editor(locale, {
          status: "changes_requested",
          feedback: { kind: "request_changes", by: "Rae", at: T1, body: null },
        }),
        view(locale, <DeleteFileDialog path="a.md" onDone={() => {}} onClose={() => {}} />),
        view(locale, <ImportZipDialog draftId="d" dirty={false} onClose={() => {}} />),
        view(
          locale,
          <DraftSettingsDialog draftId="d" scope="p" name="r" dirty onClose={() => {}} />,
        ),
        view(locale, <SubmitDialog draftId="d" itemName="@t/a" dirty onClose={() => {}} />),
        view(
          locale,
          <WithdrawDialog draftId="d" itemName="@t/a" dependents={2} onClose={() => {}} />,
        ),
        view(
          locale,
          <GroupList itemName="@t/a" members={[member("@t/b", false, { inCycle: true })]} />,
        ),
        view(
          locale,
          <ProposalBar
            draftId="d"
            proposal={proposal({ stale: "1.1.0", conflicts: [{ path: "a.md", change: null }] })}
            status="draft"
            dirty={false}
          />,
        ),
      ].join("\n"),
    );
    expect(await englishLeaks(["author", "common"], locale, html)).toEqual([]);
    expect(await ownTextsShown(["author"], locale, html)).toBeGreaterThan(40);
  });
}
