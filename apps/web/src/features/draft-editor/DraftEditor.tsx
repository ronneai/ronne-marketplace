"use client";

import {
  DEFAULT_LIMITS,
  formatBytes,
  type ManifestIssue,
  mayHaveDependencies,
} from "@ronneai/core";
import { FilePlus, FolderPlus, History, Lock, Send, Settings, Undo2, Upload } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { CodeEditor } from "@/components/code/CodeEditor";
import { FileTree } from "@/components/code/FileTree";
import type { Mentions } from "@/components/code/mentions";
import { LAYOUT_PATH } from "@/components/dependency-canvas/layout";
import { StatusBadge } from "@/components/submissions/StatusBadge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { DirtyMark } from "@/components/ui/DirtyMark";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { UnsavedChangesGuard } from "@/components/ui/UnsavedChangesGuard";
import { FileIssues, IssuesSummary } from "@/components/validation/IssuesPopover";
import type { DependencyOption } from "@/server/domains/submissions/actions/composer";
import {
  MANIFEST_PATH,
  toDraftContent,
  validateDraft,
} from "@/server/domains/submissions/models/submission";
import { startingFiles } from "@/server/domains/submissions/models/templates";
import { saveDraftAction } from "./actions";
import { addDependency, hasCanvas } from "./composer-canvas/model";
import { findDependenciesAction } from "./dependency-picker/actions";
import { dependencyRows, rangeFor, statusText } from "./dependency-picker/model";
import { DeleteFileDialog, DraftSettingsDialog, ImportZipDialog, PathDialog } from "./FileDialogs";
import {
  changesOf,
  type FilesAction,
  filesReducer,
  isDirty,
  newPathProblem,
  totalsOf,
} from "./files";
import { useDebounced, useSaveShortcut } from "./hooks";
import { ManifestForm } from "./ManifestForm";
import { readManifest } from "./manifest-yaml";
import { ProposalBar } from "./ProposalBar";
import { DeleteArchivedDialog, RestoreButton, SubmitDialog, WithdrawDialog } from "./SubmitDialogs";
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
const VIEW_LABELS: Record<View, string> = { form: "Form", yaml: "YAML", canvas: "Canvas" };

/**
 * The canvas (feature 031) and React Flow with it, in a chunk of their own that loads when the
 * view is first chosen, so the editor is as fast as it was for everyone who never opens it.
 */
const ComposerView = dynamic(
  () => import("./composer-canvas/ComposerView").then((module) => module.ComposerView),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="grid h-full place-content-center bg-surface text-sm text-muted">
        Loading the canvas…
      </p>
    ),
  },
);

const folderOf = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";

const toolClasses =
  "inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/** The read-only notice's title, for each status the author can't edit (013, 058). */
const readOnlyTitle = (draft: EditorDraft): ReactNode => {
  if (!draft.mine) return "Someone else's submission.";
  if (draft.status === "approved") return "Approved.";
  if (draft.status === "published") return "Released.";
  return (
    <>
      Submitted for review
      {draft.submittedAt ? (
        <>
          {" "}
          on <LocalTime value={draft.submittedAt} precision="day" />
        </>
      ) : null}
      .
    </>
  );
};

const readOnlyText = (draft: EditorDraft): string => {
  if (!draft.mine) return "You can read it, but only its author can change or withdraw it.";
  if (draft.status === "approved")
    return "It's ready to release, by you or a moderator. Until then you can still withdraw it, and a reviewer can send it back.";
  if (draft.status === "published")
    return "A released version never changes: View versions lists them. To change the item, propose a change from its page.";
  return "Its files are frozen, so reviewers see exactly what you submitted. You can withdraw it until it's released.";
};

const FEEDBACK_TITLE = {
  request_changes: "Changes requested by",
  reject: "Rejected by",
  rebase: "Rebased by",
} as const;

/**
 * Why it was sent back or closed (058), at the top of the page: who, when, and their message,
 * with a link to the whole conversation below.
 */
const FeedbackNotice = ({
  feedback,
  mine,
}: {
  feedback: NonNullable<EditorDraft["feedback"]>;
  mine: boolean;
}) => (
  <Notice
    kind={feedback.kind === "reject" ? "error" : "warn"}
    title={
      <>
        {FEEDBACK_TITLE[feedback.kind]} {feedback.by},{" "}
        <LocalTime value={feedback.at} precision="day" />
        {feedback.kind === "rebase" && feedback.body ? ` onto ${feedback.body}` : ""}.
      </>
    }
  >
    <div className="grid gap-2">
      {feedback.body && feedback.kind !== "rebase" ? (
        <p className="whitespace-pre-wrap break-words">{feedback.body}</p>
      ) : null}
      <p className="text-muted">
        {feedback.kind === "reject"
          ? "Rejected is final: start a new draft to try again."
          : mine
            ? "Edit the files, then Resubmit for review."
            : "It's back with its author."}{" "}
        <a href="#conversation" className="underline underline-offset-2">
          See the conversation
        </a>
      </p>
    </div>
  </Notice>
);

/**
 * The draft editor (feature 012): a file tree on the left, CodeMirror on the right, and one Save
 * for every change. Limits are checked here first and again on the server. Once submitted, or
 * when someone else's submission is opened, the same page shows it read-only (feature 013).
 */
export const DraftEditor = ({
  draft,
  limits = DEFAULT_LIMITS,
}: {
  draft: EditorDraft;
  limits?: typeof DEFAULT_LIMITS;
}) => {
  const router = useRouter();
  const [state, dispatch] = useReducer(filesReducer, { files: draft.files, removed: [] });
  const [selected, setSelected] = useState(MANIFEST_PATH);
  const [open, setOpen] = useState<Open>(null);
  const [status, setStatus] = useState<Status>(null);
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
  const itemName = `@${draft.scope}/${draft.name}`;
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
    () => ({ scope: { name: draft.scope }, name: draft.name, type: draft.type }),
    [draft.scope, draft.name, draft.type],
  );
  const issues = useMemo(
    () => validateDraft(identity, settled, limits),
    [identity, settled, limits],
  );

  // Each file's problems, for the icon next to it in the tree. One about a file that isn't there
  // (a missing SKILL.md) belongs to ronne.yaml, which names it.
  const issuesByFile = useMemo(() => {
    const paths = new Set(state.files.map((f) => f.path));
    const byFile = new Map<string, ManifestIssue[]>();
    for (const issue of issues) {
      const path = issue.file && paths.has(issue.file) ? issue.file : MANIFEST_PATH;
      byFile.set(path, [...(byFile.get(path) ?? []), issue]);
    }
    return byFile;
  }, [issues, state.files]);
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  // Why Submit is off (owner, 2026-10-01): the checks only see what's saved, and errors stop it.
  const notReady = dirty
    ? "Save your changes first: the checks, and reviewers, see what's saved."
    : errorCount > 0
      ? `Fix ${errorCount === 1 ? "the error" : `the ${errorCount} errors`} first.`
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
        setStatus({ kind: "saved", at: new Date(), issues: result.issues });
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

  // `@` in markdown files (056): the list is the dependency search; a pick adds the dependency to
  // ronne.yaml on latest, unless it's there already. Read through refs, so the list sees the
  // manifest as it is now.
  const manifestText =
    state.files.find((f) => f.path === MANIFEST_PATH && f.encoding === "utf8")?.content ?? "";
  const manifestNow = useRef(manifestText);
  manifestNow.current = manifestText;
  const offered = useRef(new Map<string, DependencyOption>());
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
                detail: `${option.type} · ${statusText(option)}`,
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
          message: `${chosen.name} is ${formatBytes(chosen.size)}; a file can be at most ${formatBytes(limits.maxFileBytes)}.`,
        });
        continue;
      }
      const path = target ?? `${folderOf(file?.path ?? "")}${chosen.name}`;
      const problem = target ? null : newPathProblem(state, path, path);
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
              note={
                readOnly
                  ? "The same checks that ran when it was submitted."
                  : "A draft can be saved with problems; it has to be free of errors to be submitted."
              }
              onSelect={openIssue}
            />
            <span
              className={`font-mono text-xs ${overLimit ? "font-semibold text-fg" : "text-muted"}`}
            >
              {totals.count} of {limits.maxFiles} files · {formatBytes(totals.bytes)} of{" "}
              {formatBytes(limits.maxTotalBytes)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draft.versionsHref ? (
            <Link href={draft.versionsHref} className={buttonClasses("secondary")}>
              <History size={16} aria-hidden="true" />
              View versions
            </Link>
          ) : null}
          {draft.canWithdraw ? (
            <Button variant="ghost" onClick={() => setOpen({ kind: "withdraw" })}>
              <Undo2 size={16} aria-hidden="true" />
              Withdraw
            </Button>
          ) : null}
          {readOnly ? null : (
            <>
              {/* Renaming and deleting are for drafts; under review the name is held. */}
              {draft.status === "draft" ? (
                <Button variant="ghost" onClick={() => setOpen({ kind: "settings" })}>
                  <Settings size={16} aria-hidden="true" />
                  Settings
                </Button>
              ) : null}
              <Button
                variant={draft.canSubmit ? "secondary" : "primary"}
                onClick={() => save()}
                loading={saving}
                disabled={!dirty}
              >
                {dirty ? "Save" : "Saved"}
              </Button>
            </>
          )}
          {draft.canSubmit ? (
            <Button onClick={() => setOpen({ kind: "submit" })} disabledReason={notReady}>
              <Send size={16} aria-hidden="true" />
              {draft.status === "changes_requested" ? "Resubmit for review" : "Submit for review"}
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
        <Notice kind="info" title="Archived.">
          <div className="grid gap-3">
            <p className="flex items-start gap-2">
              <Lock size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
              It's out of review and doesn't hold its name. Restore it to edit and submit it again.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {draft.canRestore ? <RestoreButton draftId={draft.id} /> : null}
              {draft.canDelete ? (
                <Button variant="ghost" onClick={() => setOpen({ kind: "delete-submission" })}>
                  Delete for good
                </Button>
              ) : null}
            </div>
          </div>
        </Notice>
      ) : draft.feedback ? (
        <FeedbackNotice feedback={draft.feedback} mine={draft.mine} />
      ) : readOnly ? (
        <Notice kind="info" title={readOnlyTitle(draft)}>
          <p className="flex items-start gap-2">
            <Lock size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            {readOnlyText(draft)}
          </p>
        </Notice>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className={readOnly ? "sr-only" : "min-h-5 text-sm text-fg"}
      >
        {status?.kind === "saved" && !dirty ? (
          <>
            <span className="mr-2 font-mono text-xs font-semibold">OK:</span>
            Saved at {status.at.toLocaleTimeString()}.
            {status.issues.some((issue) => issue.severity === "error")
              ? " Fix its errors before you submit it: the icons in the file list show where."
              : ""}
          </>
        ) : status?.kind === "error" ? (
          <span className="text-error-text">
            <span className="mr-2 font-mono text-xs font-semibold">ERR:</span>
            {status.message}
          </span>
        ) : null}
      </p>
      {status?.kind === "stale" ? (
        <Notice kind="info" title="Someone saved this draft elsewhere.">
          <div className="grid gap-3">
            <p>{status.message}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => router.refresh()}>
                Reload and lose my changes
              </Button>
              <Button onClick={() => save(true)} loading={saving}>
                Overwrite with mine
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
            Files ({totals.count})
          </summary>
          <div className="grid gap-2 border-t border-hairline p-2 lg:border-t-0">
            <div className={readOnly ? "hidden" : "flex flex-wrap gap-1"}>
              <button
                type="button"
                className={toolClasses}
                onClick={() => setOpen({ kind: "new-file", folder: false })}
              >
                <FilePlus size={14} aria-hidden="true" />
                File
              </button>
              <button
                type="button"
                className={toolClasses}
                onClick={() => setOpen({ kind: "new-file", folder: true })}
              >
                <FolderPlus size={14} aria-hidden="true" />
                Folder
              </button>
              <button type="button" className={toolClasses} onClick={() => upload.current?.click()}>
                <Upload size={14} aria-hidden="true" />
                Upload
              </button>
              <button
                type="button"
                className={toolClasses}
                onClick={() => setOpen({ kind: "import" })}
              >
                Import .zip
              </button>
              <input
                ref={upload}
                type="file"
                multiple
                hidden
                aria-label="Upload files"
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
                  issues={issuesByFile.get(f.path) ?? []}
                  onSelect={openIssue}
                />
              )}
            />
          </div>
        </details>

        <section aria-label="Editor" className="grid min-w-0 content-start gap-2">
          {file ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate font-mono text-sm text-fg">{file.path}</span>
                <div className="flex flex-wrap items-center gap-1">
                  {file.path === MANIFEST_PATH ? (
                    <fieldset className="flex gap-1 rounded-control border border-hairline bg-canvas p-0.5">
                      <legend className="sr-only">ronne.yaml view</legend>
                      {views.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={view === mode}
                          onClick={() => setView(mode)}
                          className="h-7 rounded-control px-3 text-xs font-semibold text-muted hover:text-fg aria-pressed:border aria-pressed:border-hairline aria-pressed:bg-surface aria-pressed:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                        >
                          {VIEW_LABELS[mode]}
                        </button>
                      ))}
                    </fieldset>
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
                      Executable
                    </label>
                  )}
                  {starting.has(file.path) && file.path !== MANIFEST_PATH && !readOnly ? (
                    <span
                      className="px-2 text-xs text-muted"
                      title={`One of the ${draft.type}'s starting files: edit it, but it can't be deleted or renamed.`}
                    >
                      Starting file
                    </span>
                  ) : null}
                  {!starting.has(file.path) && !readOnly ? (
                    <>
                      <button
                        type="button"
                        className={toolClasses}
                        onClick={() => setOpen({ kind: "rename", path: file.path })}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className={toolClasses}
                        onClick={() => setOpen({ kind: "delete", path: file.path })}
                      >
                        Delete
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
                    <legend className="sr-only">ronne.yaml</legend>
                    <ManifestForm
                      text={file.content}
                      type={draft.type}
                      itemName={`@${draft.scope}/${draft.name}`}
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
                    <p className="text-sm text-fg">
                      A binary file, {formatBytes(file.size)}. It can be replaced or deleted, but
                      not edited here.
                    </p>
                    {readOnly ? null : (
                      <Button variant="secondary" onClick={() => replace.current?.click()}>
                        Replace
                      </Button>
                    )}
                    <input
                      ref={replace}
                      type="file"
                      hidden
                      aria-label={`Replace ${file.path}`}
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

      <UnsavedChangesGuard
        dirty={dirty}
        message="Your changes to this draft aren't saved. If you leave now, they're lost."
      />
      {open?.kind === "new-file" ? (
        <PathDialog
          title={open.folder ? "New folder" : "New file"}
          label={open.folder ? "Folder and first file" : "Path"}
          hint={
            open.folder
              ? "A folder exists once it has a file, so name one: docs/usage.md."
              : "Use / for folders, such as docs/usage.md."
          }
          initial={open.folder ? "" : folderOf(file?.path ?? "")}
          confirm="Create"
          problem={(path) => newPathProblem(state, path)}
          onDone={(path) => {
            dispatch({ type: "put", path, encoding: "utf8", content: "" });
            setSelected(path);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open?.kind === "rename" ? (
        <PathDialog
          title="Rename file"
          label="New path"
          hint="Use / to move it into a folder."
          initial={open.path}
          confirm="Rename"
          problem={(path) => newPathProblem(state, path, open.path)}
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
          scope={draft.scope}
          name={draft.name}
          dirty={dirty}
          proposal={draft.proposal !== null}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
};
