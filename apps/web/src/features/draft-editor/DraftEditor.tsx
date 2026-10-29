"use client";

import {
  DEFAULT_LIMITS,
  formatItemName,
  formatScopeName,
  type ManifestIssue,
  mayHaveDependencies,
} from "@ronneai/core";
import { FilePlus, FolderPlus, History, Lock, Send, Settings, Undo2, Upload } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { CodeEditor } from "@/components/code/CodeEditor";
import { FileTree } from "@/components/code/FileTree";
import type { Mentions } from "@/components/code/mentions";
import { LAYOUT_PATH } from "@/components/dependency-canvas/layout";
import { Help } from "@/components/help/Help";
import { StatusBadge } from "@/components/submissions/StatusBadge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { DirtyMark } from "@/components/ui/DirtyMark";
import { Notice } from "@/components/ui/Notice";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { UnsavedChangesGuard } from "@/components/ui/UnsavedChangesGuard";
import { FileIssues, IssuesSummary } from "@/components/validation/IssuesPopover";
import { useBytes } from "@/i18n/bytes";
import type { DependencyOption } from "@/server/domains/submissions/actions/composer";
import {
  MANIFEST_PATH,
  toDraftContent,
  validateDraft,
} from "@/server/domains/submissions/models/submission";
import { startingFiles } from "@/server/domains/submissions/models/templates";
import { FeedbackNotice, ReadOnlyText, ReadOnlyTitle } from "./AuthorNotices";
import { saveDraftAction } from "./actions";
import { addDependency, hasCanvas } from "./composer-canvas/model";
import { findDependenciesAction } from "./dependency-picker/actions";
import { dependencyRows, rangeFor } from "./dependency-picker/model";
import { usePickerWords } from "./dependency-picker/words";
import {
  DeleteFileDialog,
  DraftSettingsDialog,
  ImportZipDialog,
  NewPathDialog,
  RenamePathDialog,
  usePathWords,
  useTooBig,
} from "./FileDialogs";
import {
  changesOf,
  type FilesAction,
  filesReducer,
  isDirty,
  newPathProblem,
  totalsOf,
} from "./files";
import { useDebounced, useSaveShortcut } from "./hooks";
import { editorProblems } from "./issues";
import { ManifestForm } from "./ManifestForm";
import { readManifest, renameDependency } from "./manifest-yaml";
import { ProposalBar } from "./ProposalBar";
import {
  DeleteArchivedDialog,
  RestoreButton,
  SubmitDialog,
  useSubmitWords,
  WithdrawDialog,
} from "./SubmitDialogs";
import type { EditorDraft, SaveResult } from "./types";

type Open =
  | { kind: "new-file"; folder: boolean }
  | { kind: "rename"; path: string }
  | { kind: "delete"; path: string }
  | { kind: "import" }
  | { kind: "settings" }
  | { kind: "submit" }
  | { kind: "withdraw" }
  | { kind: "delete-submission" }
  | null;

type Status =
  | { kind: "saved"; at: Date; issues: ManifestIssue[] }
  | { kind: "error"; message: string }
  | { kind: "stale"; message: string }
  | null;

type View = "form" | "yaml" | "canvas";

const VIEW_BUTTON =
  "h-7 rounded-control px-3 text-xs font-semibold text-muted hover:text-fg aria-pressed:border aria-pressed:border-hairline aria-pressed:bg-surface aria-pressed:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/** How ronne.yaml is shown: as a form, as YAML or as the canvas, in the person's language (131). */
export const ViewSwitch = ({
  views,
  view,
  onChange,
}: {
  views: readonly View[];
  view: View;
  onChange: (view: View) => void;
}) => {
  const t = useTranslations("author.form");
  return (
    <fieldset className="flex gap-1 rounded-control border border-hairline bg-canvas p-0.5">
      <legend className="sr-only">{t("viewsLegend")}</legend>
      {views.map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={view === mode}
          onClick={() => onChange(mode)}
          className={VIEW_BUTTON}
        >
          {t(`views.${mode}`)}
        </button>
      ))}
    </fieldset>
  );
};

const CanvasLoading = () => {
  const t = useTranslations("author.editor");
  return (
    <p role="status" className="grid h-full place-content-center bg-surface text-sm text-muted">
      {t("loadingCanvas")}
    </p>
  );
};

/**
 * The canvas (feature 031) and React Flow with it, in a chunk of their own that loads when the
 * view is first chosen, so the editor is as fast as it was for everyone who never opens it.
 */
const ComposerView = dynamic(
  () => import("./composer-canvas/ComposerView").then((module) => module.ComposerView),
  {
    ssr: false,
    loading: () => <CanvasLoading />,
  },
);

const folderOf = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";

const toolClasses =
  "inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/**
 * After a save: when, on the reader's own clock as the browser tells it (the provider's zone is
 * the server's), and whether errors are left to fix before submitting.
 */
export const SavedLine = ({ at, withErrors }: { at: Date; withErrors: boolean }) => {
  const t = useTranslations("author.editor");
  const format = useFormatter();
  const time = format.dateTime(at, {
    timeStyle: "medium",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  return (
    <>
      <span className="mr-2 font-mono text-xs font-semibold">{t("ok")}</span>
      {t(withErrors ? "savedWithErrors" : "savedAt", { time })}
    </>
  );
};

/**
 * The draft editor (feature 012): a file tree on the left, CodeMirror on the right, and one Save
 * for every change. Limits are checked here first and again on the server. Once submitted, or
 * when someone else's submission is opened, the same page shows it read-only (feature 013).
 */
export const DraftEditor = ({
  draft,
  limits = DEFAULT_LIMITS,
  initialPath = MANIFEST_PATH,
}: {
  draft: EditorDraft;
  limits?: typeof DEFAULT_LIMITS;
  /** The file it opens on: ronne.yaml unless another is asked for. */
  initialPath?: string;
}) => {
  const router = useRouter();
  const formText = useTranslations("author.form");
  const fieldText = useTranslations("common.field");
  const t = useTranslations("author.editor");
  const bytes = useBytes();
  const pathWords = usePathWords();
  const tooBig = useTooBig();
  const submitWords = useSubmitWords();
  const [state, dispatch] = useReducer(filesReducer, { files: draft.files, removed: [] });
  const [selected, setSelected] = useState(initialPath);
  const [open, setOpen] = useState<Open>(null);
  const [status, setStatus] = useState<Status>(null);
  // What Submit would refuse (#142): the registry's checks, from the page load, then each save.
  const [checked, setChecked] = useState<ManifestIssue[]>(draft.submitIssues ?? []);
  const [saving, startSave] = useTransition();
  const [view, setView] = useState<View>("form");
  const [goTo, setGoTo] = useState<{ line: number; at: number } | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const replace = useRef<HTMLInputElement>(null);

  const dirty = isDirty(state);
  const readOnly = draft.readOnly;
  // The files New item started the type with: they stay (owner, 2026-10-01).
  const starting = useMemo(
    () => new Set([MANIFEST_PATH, ...startingFiles(draft.type)]),
    [draft.type],
  );
  const itemName = formatItemName({
    workspace: draft.workspace,
    scope: draft.scope,
    name: draft.name,
  });
  const file = state.files.find((f) => f.path === selected) ?? state.files[0];
  // Every item may be composed from others, so every type has a canvas (031, 096).
  const views: readonly View[] = hasCanvas(draft.type)
    ? ["form", "yaml", "canvas"]
    : ["form", "yaml"];
  const composing = file?.path === MANIFEST_PATH && view === "canvas" && hasCanvas(draft.type);
  const layout = state.files.find((f) => f.path === LAYOUT_PATH && f.encoding === "utf8");
  const totals = totalsOf(state.files);

  // 011's checks, in the browser, once typing pauses: the same function the server runs on save.
  const settled = useDebounced(state.files, 300);
  const identity = useMemo(
    () => ({
      workspace: { name: draft.workspace },
      scope: { name: draft.scope },
      name: draft.name,
      type: draft.type,
    }),
    [draft.workspace, draft.scope, draft.name, draft.type],
  );
  const issues = useMemo(
    () => validateDraft(identity, settled, limits),
    [identity, settled, limits],
  );

  // The registry's next to 011's, each once; set apart while there are unsaved changes (#142).
  const problems = useMemo(
    () =>
      editorProblems(issues, checked, {
        paths: state.files.map((f) => f.path),
        dirty,
        readOnly,
      }),
    [issues, checked, state.files, dirty, readOnly],
  );
  // Why Submit is off (owner, 2026-10-01): the checks only see what's saved, and errors stop it.
  // Only 011's: the registry's may be out of date, so Submit's dialog checks them again (#142).
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const notReady = dirty
    ? t("notReadyUnsaved")
    : errorCount > 0
      ? t("notReadyErrors", { count: errorCount })
      : null;

  /** Opens the file and line an issue is about; in ronne.yaml, that's the YAML view. */
  const openIssue = (issue: ManifestIssue) => {
    const path = issue.file ?? MANIFEST_PATH;
    if (!state.files.some((f) => f.path === path)) return;
    setSelected(path);
    if (path === MANIFEST_PATH) setView("yaml");
    if (issue.line) setGoTo({ line: issue.line, at: Date.now() });
  };

  const save = useCallback(
    (overwrite = false) => {
      if (!isDirty(state) || saving) return;
      const changes = changesOf(state);
      startSave(async () => {
        const result: SaveResult = await saveDraftAction(draft.id, { ...changes, overwrite });
        if (!result.ok) {
          setStatus(
            result.stale
              ? { kind: "stale", message: result.error }
              : { kind: "error", message: result.error },
          );
          return;
        }
        dispatch({
          type: "saved",
          saved: result.saved,
          rewritten: result.rewritten,
          sent: changes.writes,
          removed: changes.deletes.map((f) => f.path),
        });
        setChecked(result.submitIssues);
        setStatus({
          kind: "saved",
          at: new Date(),
          issues: [...result.issues, ...result.submitIssues],
        });
      });
    },
    [state, saving, draft.id],
  );
  useSaveShortcut(() => save());

  const onChange = useCallback((path: string, content: string) => {
    dispatch({ type: "edit", path, content });
  }, []);
  const onCompose = useCallback((actions: FilesAction[]) => {
    for (const action of actions) dispatch(action);
  }, []);
  const showYaml = useCallback(() => setView("yaml"), []);
  // Use the new name (118): a dependency named by an old name, written under its name now.
  const writeNewName = useCallback(
    ({ from, to }: { from: string; to: string }) => {
      const manifest = state.files.find((f) => f.path === MANIFEST_PATH);
      if (manifest?.encoding === "utf8")
        onChange(MANIFEST_PATH, renameDependency(manifest.content, from, to));
    },
    [state.files, onChange],
  );

  // `@` in markdown files (056): the list is the dependency search; a pick adds the dependency to
  // ronne.yaml on latest, unless it's there already. Read through refs, so the list sees the
  // manifest as it is now.
  const manifestText =
    state.files.find((f) => f.path === MANIFEST_PATH && f.encoding === "utf8")?.content ?? "";
  const manifestNow = useRef(manifestText);
  manifestNow.current = manifestText;
  const offered = useRef(new Map<string, DependencyOption>());
  // Read when the list opens: the words follow the language without rebuilding the mentions.
  const words = usePickerWords();
  const wordsNow = useRef(words);
  wordsNow.current = words;
  const mentions = useMemo<Mentions | null>(
    () =>
      readOnly || !mayHaveDependencies(draft.type)
        ? null
        : {
            find: async (q) => {
              const result = await findDependenciesAction({
                type: draft.type,
                q,
                itemName,
                exclude: [],
              });
              if (!result.ok) return [];
              for (const option of result.options) offered.current.set(option.name, option);
              return result.options.map((option) => ({
                name: option.name,
                detail: `${option.type} · ${wordsNow.current.statusText(option)}`,
              }));
            },
            pick: (name) => {
              const text = manifestNow.current;
              const listed = dependencyRows(readManifest(text)?.dependencies);
              if (listed.some(([n]) => n === name)) return;
              const option = offered.current.get(name);
              dispatch({
                type: "edit",
                path: MANIFEST_PATH,
                content: addDependency(text, name, option ? rangeFor(option) : "^1.0.0"),
              });
            },
          },
    [readOnly, draft.type, itemName],
  );

  /** Reads chosen files in the browser; each goes into the selected file's folder. */
  const addFiles = async (list: FileList | null, target?: string) => {
    for (const chosen of Array.from(list ?? [])) {
      if (chosen.size > limits.maxFileBytes) {
        setStatus({
          kind: "error",
          message: tooBig(chosen.name, chosen.size, limits.maxFileBytes),
        });
        continue;
      }
      const path = target ?? `${folderOf(file?.path ?? "")}${chosen.name}`;
      const problem = target ? null : pathWords(newPathProblem(state, path, path));
      if (problem) {
        setStatus({ kind: "error", message: problem });
        continue;
      }
      const content = toDraftContent(new Uint8Array(await chosen.arrayBuffer()));
      dispatch({ type: "put", path, ...content });
      setSelected(path);
    }
  };

  const overLimit = totals.count > limits.maxFiles || totals.bytes > limits.maxTotalBytes;

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate font-mono text-xl font-semibold text-fg">{itemName}</h1>
            {dirty && !readOnly ? <DirtyMark /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={draft.type} />
            <StatusBadge status={draft.status} />
            <IssuesSummary
              issues={issues}
              saved={problems.saved}
              savedLabel={problems.asOfSave ? formText("asOfSave") : undefined}
              note={t(readOnly ? "issuesNoteReadOnly" : "issuesNote")}
              onSelect={openIssue}
              onRename={readOnly ? undefined : writeNewName}
            />
            <span
              className={`font-mono text-xs ${overLimit ? "font-semibold text-fg" : "text-muted"}`}
            >
              {t("totals", {
                count: totals.count,
                max: limits.maxFiles,
                bytes: bytes(totals.bytes),
                maxBytes: bytes(limits.maxTotalBytes),
              })}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draft.versionsHref ? (
            <Link href={draft.versionsHref} className={buttonClasses("secondary")}>
              <History size={16} aria-hidden="true" />
              {t("viewVersions")}
            </Link>
          ) : null}
          {draft.canWithdraw ? (
            <Button variant="ghost" onClick={() => setOpen({ kind: "withdraw" })}>
              <Undo2 size={16} aria-hidden="true" />
              {t("withdraw")}
            </Button>
          ) : null}
          {readOnly ? null : (
            <>
              {/* Renaming and deleting are for drafts; under review the name is held. */}
              {draft.status === "draft" ? (
                <Button variant="ghost" onClick={() => setOpen({ kind: "settings" })}>
                  <Settings size={16} aria-hidden="true" />
                  {t("settings")}
                </Button>
              ) : null}
              <Button
                variant={draft.canSubmit ? "secondary" : "primary"}
                onClick={() => save()}
                loading={saving}
                disabled={!dirty}
              >
                {t(dirty ? "save" : "saved")}
              </Button>
            </>
          )}
          {draft.canSubmit ? (
            <Button onClick={() => setOpen({ kind: "submit" })} disabledReason={notReady}>
              <Send size={16} aria-hidden="true" />
              {submitWords.label(draft.status === "changes_requested", [], draft.personal)}
            </Button>
          ) : null}
        </div>
      </header>

      {draft.proposal ? (
        <ProposalBar
          draftId={draft.id}
          proposal={draft.proposal}
          status={draft.status}
          dirty={dirty}
        />
      ) : null}

      {draft.status === "withdrawn" && draft.mine ? (
        <Notice kind="info" title={t("archivedTitle")}>
          <div className="grid gap-3">
            <p className="flex items-start gap-2">
              <Lock size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
              {t("archived")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {draft.canRestore ? <RestoreButton draftId={draft.id} /> : null}
              {draft.canDelete ? (
                <Button variant="ghost" onClick={() => setOpen({ kind: "delete-submission" })}>
                  {t("deleteForGood")}
                </Button>
              ) : null}
            </div>
          </div>
        </Notice>
      ) : draft.feedback ? (
        <FeedbackNotice
          feedback={draft.feedback}
          mine={draft.mine}
          draftId={draft.id}
          personal={draft.personal}
        />
      ) : readOnly ? (
        <Notice kind="info" title={<ReadOnlyTitle draft={draft} />}>
          <p className="flex items-start gap-2">
            <Lock size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            <ReadOnlyText draft={draft} />
          </p>
          {draft.status === "approved" && draft.selfApproved ? (
            <Help id="personal-review" className="mt-2" />
          ) : null}
        </Notice>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className={readOnly ? "sr-only" : "min-h-5 text-sm text-fg"}
      >
        {status?.kind === "saved" && !dirty ? (
          <SavedLine
            at={status.at}
            withErrors={status.issues.some((issue) => issue.severity === "error")}
          />
        ) : status?.kind === "error" ? (
          <span className="text-error-text">
            <span className="mr-2 font-mono text-xs font-semibold">{fieldText("error")}</span>
            {status.message}
          </span>
        ) : null}
      </p>
      {status?.kind === "stale" ? (
        <Notice kind="info" title={t("staleTitle")}>
          <div className="grid gap-3">
            <p>{status.message}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => router.refresh()}>
                {t("reload")}
              </Button>
              <Button onClick={() => save(true)} loading={saving}>
                {t("overwrite")}
              </Button>
            </div>
          </div>
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <details
          open
          className="group min-w-0 rounded-panel border border-hairline bg-surface lg:self-start"
        >
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-fg lg:hidden">
            {t("files", { count: totals.count })}
          </summary>
          <div className="grid gap-2 border-t border-hairline p-2 lg:border-t-0">
            <div className={readOnly ? "hidden" : "flex flex-wrap gap-1"}>
              <button
                type="button"
                className={toolClasses}
                onClick={() => setOpen({ kind: "new-file", folder: false })}
              >
                <FilePlus size={14} aria-hidden="true" />
                {t("newFile")}
              </button>
              <button
                type="button"
                className={toolClasses}
                onClick={() => setOpen({ kind: "new-file", folder: true })}
              >
                <FolderPlus size={14} aria-hidden="true" />
                {t("newFolder")}
              </button>
              <button type="button" className={toolClasses} onClick={() => upload.current?.click()}>
                <Upload size={14} aria-hidden="true" />
                {t("upload")}
              </button>
              <button
                type="button"
                className={toolClasses}
                onClick={() => setOpen({ kind: "import" })}
              >
                {t("importZip")}
              </button>
              <input
                ref={upload}
                type="file"
                multiple
                hidden
                aria-label={t("uploadLabel")}
                onChange={(event) => {
                  void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>
            <FileTree
              files={state.files}
              selected={file?.path ?? ""}
              onSelect={setSelected}
              after={(f) => (
                <FileIssues
                  path={f.path}
                  issues={problems.byFile.get(f.path)?.live ?? []}
                  saved={problems.byFile.get(f.path)?.saved}
                  savedLabel={problems.asOfSave ? formText("asOfSave") : undefined}
                  onSelect={openIssue}
                  onRename={readOnly ? undefined : writeNewName}
                />
              )}
            />
          </div>
        </details>

        <section aria-label={t("editor")} className="grid min-w-0 content-start gap-2">
          {file ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate font-mono text-sm text-fg">{file.path}</span>
                <div className="flex flex-wrap items-center gap-1">
                  {file.path === MANIFEST_PATH ? (
                    <ViewSwitch views={views} view={view} onChange={setView} />
                  ) : (
                    <label className="flex items-center gap-1.5 px-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={file.executable}
                        disabled={readOnly}
                        onChange={(event) =>
                          dispatch({
                            type: "executable",
                            path: file.path,
                            executable: event.target.checked,
                          })
                        }
                        className="size-4 accent-(--accent)"
                      />
                      {t("executable")}
                    </label>
                  )}
                  {starting.has(file.path) && file.path !== MANIFEST_PATH && !readOnly ? (
                    <span
                      className="px-2 text-xs text-muted"
                      title={t("startingFileTitle", { type: draft.type })}
                    >
                      {t("startingFile")}
                    </span>
                  ) : null}
                  {!starting.has(file.path) && !readOnly ? (
                    <>
                      <button
                        type="button"
                        className={toolClasses}
                        onClick={() => setOpen({ kind: "rename", path: file.path })}
                      >
                        {t("rename")}
                      </button>
                      <button
                        type="button"
                        className={toolClasses}
                        onClick={() => setOpen({ kind: "delete", path: file.path })}
                      >
                        {t("delete")}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div
                className={cn(
                  "rounded-panel border border-hairline bg-surface",
                  // The canvas needs a frame of its own; a file or the form grows with its content,
                  // and the page scrolls instead of the card (owner, 2026-10-01).
                  composing ? "h-[85dvh] min-h-[38rem] overflow-hidden" : "min-h-80",
                )}
              >
                {file.path === MANIFEST_PATH && view === "form" ? (
                  <fieldset disabled={readOnly} className="min-w-0 rounded-panel bg-surface">
                    <legend className="sr-only">
                      {/* biome-ignore lint/plugin: a file name, the same in every language */}
                      ronne.yaml
                    </legend>
                    <ManifestForm
                      text={file.content}
                      type={draft.type}
                      itemName={itemName}
                      files={state.files
                        .map((f) => f.path)
                        .filter((path) => path !== MANIFEST_PATH)}
                      onChange={(content) => onChange(MANIFEST_PATH, content)}
                      onShowYaml={showYaml}
                      readOnly={readOnly}
                      dependencyMarks={draft.dependencyMarks}
                    />
                  </fieldset>
                ) : composing ? (
                  <ComposerView
                    itemName={itemName}
                    type={draft.type}
                    manifest={file.content}
                    layout={layout?.content}
                    issues={issues}
                    readOnly={readOnly}
                    onChange={onCompose}
                    onShowYaml={showYaml}
                  />
                ) : file.encoding === "utf8" ? (
                  <CodeEditor
                    path={file.path}
                    value={file.content}
                    onChange={onChange}
                    goToLine={goTo}
                    readOnly={readOnly}
                    mentions={mentions}
                  />
                ) : (
                  <div className="grid h-full place-content-center justify-items-center gap-3 bg-surface p-6 text-center">
                    <p className="text-sm text-fg">{t("binary", { size: bytes(file.size) })}</p>
                    {readOnly ? null : (
                      <Button variant="secondary" onClick={() => replace.current?.click()}>
                        {t("replace")}
                      </Button>
                    )}
                    <input
                      ref={replace}
                      type="file"
                      hidden
                      aria-label={t("replaceLabel", { path: file.path })}
                      onChange={(event) => {
                        void addFiles(event.target.files, file.path);
                        event.target.value = "";
                      }}
                    />
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>
      </div>

      <UnsavedChangesGuard dirty={dirty} message={t("leave")} />
      {open?.kind === "new-file" ? (
        <NewPathDialog
          folder={open.folder}
          initial={open.folder ? "" : folderOf(file?.path ?? "")}
          problem={(path) => pathWords(newPathProblem(state, path))}
          onDone={(path) => {
            dispatch({ type: "put", path, encoding: "utf8", content: "" });
            setSelected(path);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open?.kind === "rename" ? (
        <RenamePathDialog
          initial={open.path}
          problem={(path) => pathWords(newPathProblem(state, path, open.path))}
          onDone={(path) => {
            dispatch({ type: "rename", from: open.path, to: path });
            setSelected(path);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open?.kind === "delete" ? (
        <DeleteFileDialog
          path={open.path}
          onDone={() => {
            dispatch({ type: "remove", path: open.path });
            setSelected(MANIFEST_PATH);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open?.kind === "import" ? (
        <ImportZipDialog draftId={draft.id} dirty={dirty} onClose={() => setOpen(null)} />
      ) : null}
      {open?.kind === "submit" ? (
        <SubmitDialog
          resubmit={draft.status === "changes_requested"}
          draftId={draft.id}
          itemName={itemName}
          dirty={dirty}
          onClose={() => setOpen(null)}
          personal={draft.personal}
        />
      ) : null}
      {open?.kind === "withdraw" ? (
        <WithdrawDialog
          draftId={draft.id}
          itemName={itemName}
          dependents={draft.dependents}
          canDelete={draft.canDelete}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open?.kind === "delete-submission" ? (
        <DeleteArchivedDialog
          draftId={draft.id}
          itemName={itemName}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open?.kind === "settings" ? (
        <DraftSettingsDialog
          draftId={draft.id}
          // With its workspace outside global (118), so saving keeps it there.
          scope={formatScopeName({ workspace: draft.workspace, scope: draft.scope }).slice(1)}
          name={draft.name}
          dirty={dirty}
          proposal={draft.proposal !== null}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
};
