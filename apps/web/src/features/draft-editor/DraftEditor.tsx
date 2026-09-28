"use client";

import { DEFAULT_LIMITS, formatBytes, type ManifestIssue } from "@ronneai/core";
import { FilePlus, FolderPlus, Settings, Upload } from "lucide-react";
import { useCallback, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { IssueList } from "@/components/validation/IssueList";
import {
  MANIFEST_PATH,
  toDraftContent,
  validateDraft,
} from "@/server/domains/submissions/models/submission";
import { saveDraftAction } from "./actions";
import { CodeEditor } from "./CodeEditor";
import { DeleteFileDialog, DraftSettingsDialog, ImportZipDialog, PathDialog } from "./FileDialogs";
import { FileTree } from "./FileTree";
import { changesOf, filesReducer, isDirty, newPathProblem, totalsOf } from "./files";
import { useDebounced, useSaveShortcut, useUnsavedWarning } from "./hooks";
import { ManifestForm } from "./ManifestForm";
import type { EditorDraft, SaveResult } from "./types";

type Open =
  | { kind: "new-file"; folder: boolean }
  | { kind: "rename"; path: string }
  | { kind: "delete"; path: string }
  | { kind: "import" }
  | { kind: "settings" }
  | null;

type Status =
  | { kind: "saved"; at: Date; issues: ManifestIssue[] }
  | { kind: "error"; message: string }
  | { kind: "stale"; message: string }
  | null;

const folderOf = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";

const toolClasses =
  "inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/**
 * The draft editor (feature 012): a file tree on the left, CodeMirror on the right, and one Save
 * for every change. Limits are checked here first and again on the server.
 */
export const DraftEditor = ({
  draft,
  limits = DEFAULT_LIMITS,
}: {
  draft: EditorDraft;
  limits?: typeof DEFAULT_LIMITS;
}) => {
  const [state, dispatch] = useReducer(filesReducer, { files: draft.files, removed: [] });
  const [selected, setSelected] = useState(MANIFEST_PATH);
  const [open, setOpen] = useState<Open>(null);
  const [status, setStatus] = useState<Status>(null);
  const [saving, startSave] = useTransition();
  const [view, setView] = useState<"form" | "yaml">("form");
  const [goTo, setGoTo] = useState<{ line: number; at: number } | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const replace = useRef<HTMLInputElement>(null);

  const dirty = isDirty(state);
  const file = state.files.find((f) => f.path === selected) ?? state.files[0];
  const totals = totalsOf(state.files);
  useUnsavedWarning(dirty);

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
          <h1 className="truncate font-mono text-xl font-semibold text-fg">
            @{draft.scope}/{draft.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{draft.type}</Badge>
            <Badge>{draft.status}</Badge>
            <span
              className={`font-mono text-xs ${overLimit ? "font-semibold text-fg" : "text-muted"}`}
            >
              {totals.count} of {limits.maxFiles} files · {formatBytes(totals.bytes)} of{" "}
              {formatBytes(limits.maxTotalBytes)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setOpen({ kind: "settings" })}>
            <Settings size={16} aria-hidden="true" />
            Settings
          </Button>
          <Button onClick={() => save()} loading={saving} disabled={!dirty}>
            {dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </header>

      <p role="status" aria-live="polite" className="min-h-5 text-sm text-fg">
        {status?.kind === "saved" && !dirty ? (
          <>
            <span className="mr-2 font-mono text-xs font-semibold">OK:</span>
            Saved at {status.at.toLocaleTimeString()}.
            {status.issues.some((issue) => issue.severity === "error")
              ? " Fix the problems below before you submit it."
              : ""}
          </>
        ) : status?.kind === "error" ? (
          <>
            <span className="mr-2 font-mono text-xs font-semibold">ERR:</span>
            {status.message}
          </>
        ) : dirty ? (
          <span className="text-muted">Unsaved changes. Save with Ctrl+S or ⌘S.</span>
        ) : null}
      </p>
      {status?.kind === "stale" ? (
        <Notice kind="info" title="Someone saved this draft elsewhere.">
          <div className="grid gap-3">
            <p>{status.message}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => window.location.reload()}>
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
            <div className="flex flex-wrap gap-1">
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
            <FileTree files={state.files} selected={file?.path ?? ""} onSelect={setSelected} />
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
                      {(["form", "yaml"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={view === mode}
                          onClick={() => setView(mode)}
                          className="h-7 rounded-control px-3 text-xs font-semibold text-muted hover:text-fg aria-pressed:border aria-pressed:border-hairline aria-pressed:bg-surface aria-pressed:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                        >
                          {mode === "form" ? "Form" : "YAML"}
                        </button>
                      ))}
                    </fieldset>
                  ) : (
                    <label className="flex items-center gap-1.5 px-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={file.executable}
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
                  {file.path !== MANIFEST_PATH ? (
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
              <div className="h-[60vh] overflow-hidden rounded-panel border border-hairline">
                {file.path === MANIFEST_PATH && view === "form" ? (
                  <div className="h-full overflow-y-auto bg-surface">
                    <ManifestForm
                      text={file.content}
                      type={draft.type}
                      itemName={`@${draft.scope}/${draft.name}`}
                      files={state.files
                        .map((f) => f.path)
                        .filter((path) => path !== MANIFEST_PATH)}
                      onChange={(content) => onChange(MANIFEST_PATH, content)}
                      onShowYaml={() => setView("yaml")}
                    />
                  </div>
                ) : file.encoding === "utf8" ? (
                  <CodeEditor
                    path={file.path}
                    value={file.content}
                    onChange={onChange}
                    goToLine={goTo}
                  />
                ) : (
                  <div className="grid h-full place-content-center justify-items-center gap-3 bg-surface p-6 text-center">
                    <p className="text-sm text-fg">
                      A binary file, {formatBytes(file.size)}. It can be replaced or deleted, but
                      not edited here.
                    </p>
                    <Button variant="secondary" onClick={() => replace.current?.click()}>
                      Replace
                    </Button>
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
          <section
            aria-label="Problems"
            className="grid gap-2 rounded-panel border border-hairline bg-surface p-3"
          >
            <h2 className="text-sm font-semibold text-fg">Problems</h2>
            <IssueList issues={issues} onSelect={openIssue} />
            <p className="text-xs text-muted">
              A draft can be saved with problems; it has to be free of errors to be submitted.
            </p>
          </section>
        </section>
      </div>

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
      {open?.kind === "settings" ? (
        <DraftSettingsDialog
          draftId={draft.id}
          scope={draft.scope}
          name={draft.name}
          dirty={dirty}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
};
