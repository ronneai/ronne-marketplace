"use client";

import { PATH_MAX } from "@ronneai/core";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { deleteDraftAction, importZipAction, renameDraftAction } from "./actions";
import type { PathIssue } from "./files";

/** A path's problem in the person's language (131), or null. */
export const usePathWords = () => {
  const t = useTranslations("author.editor.path");
  return (issue: PathIssue | null): string | null => {
    if (!issue) return null;
    switch (issue.kind) {
      case "path":
        return t(issue.problem, { max: PATH_MAX });
      case "exists":
      case "folder":
        return t(issue.kind, { path: issue.path });
      default:
        return t(issue.kind);
    }
  };
};

/** New file, new folder and rename: one path, checked as it's typed. */
export const PathDialog = ({
  title,
  label,
  hint,
  initial,
  confirm,
  problem,
  onDone,
  onClose,
}: {
  title: string;
  label: string;
  hint: string;
  initial: string;
  confirm: string;
  problem: (path: string) => string | null;
  onDone: (path: string) => void;
  onClose: () => void;
}) => {
  const t = useTranslations("author.editor");
  const [path, setPath] = useState(initial);
  const [touched, setTouched] = useState(false);
  const error = touched ? problem(path.trim()) : null;
  return (
    <Dialog open onClose={onClose} title={title}>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (!problem(path.trim())) onDone(path.trim());
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="file-path">{label}</Label>
          <input
            id="file-path"
            value={path}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setPath(event.target.value);
              setTouched(true);
            }}
            aria-describedby="file-path-hint file-path-error"
            aria-invalid={error ? true : undefined}
            className={`${inputClasses} font-mono`}
          />
          <p id="file-path-hint" className="text-xs text-muted">
            {hint}
          </p>
        </div>
        <FieldError id="file-path-error">{error}</FieldError>
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit">{confirm}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export const DeleteFileDialog = ({
  path,
  onDone,
  onClose,
}: {
  path: string;
  onDone: () => void;
  onClose: () => void;
}) => {
  const t = useTranslations("author.editor");
  return (
    <Dialog open onClose={onClose} title={t("deleteFileTitle")}>
      <div className="grid gap-4">
        <p className="text-sm text-fg">
          {t.rich("deleteFile", {
            path,
            mono: (chunks) => <span className="font-mono">{chunks}</span>,
          })}
        </p>
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="destructive" onClick={onDone}>
            {t("delete")}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
};

/** Imports a .zip on the server, then reloads the draft. */
export const ImportZipDialog = ({
  draftId,
  dirty,
  onClose,
}: {
  draftId: string;
  dirty: boolean;
  onClose: () => void;
}) => {
  const t = useTranslations("author.editor");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title={t("importTitle")}>
      {dirty ? (
        <div className="grid gap-4">
          <p className="text-sm text-fg">{t("unsaved")}</p>
          <DialogActions>
            <Button variant="ghost" onClick={onClose}>
              {t("close")}
            </Button>
          </DialogActions>
        </div>
      ) : (
        <form
          className="grid gap-4"
          action={(form) =>
            start(async () => {
              const result = await importZipAction(draftId, form);
              if (!result.ok) return setError(result.error);
              onClose();
              router.refresh();
            })
          }
        >
          <div className="grid gap-1.5">
            <Label htmlFor="zip-file">{t("archive")}</Label>
            <input
              id="zip-file"
              name="archive"
              type="file"
              accept=".zip,application/zip"
              required
              className="text-sm text-fg file:mr-3 file:rounded-control file:border file:border-hairline file:bg-tint file:px-3 file:py-1.5 file:text-sm file:text-fg"
            />
            <p className="text-xs text-muted">{t("importHint")}</p>
          </div>
          <fieldset className="grid gap-2">
            <legend className="pb-1 text-sm font-semibold text-fg">{t("existing")}</legend>
            <label className="flex items-start gap-2 text-sm text-fg">
              <input
                type="radio"
                name="mode"
                value="merge"
                defaultChecked
                className="mt-0.5 size-4 accent-(--accent)"
              />
              <span>{t("merge")}</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-fg">
              <input
                type="radio"
                name="mode"
                value="replace"
                className="mt-0.5 size-4 accent-(--accent)"
              />
              <span>{t("replaceAll")}</span>
            </label>
          </fieldset>
          <FieldError id="zip-error">{error}</FieldError>
          <DialogActions>
            <Button variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {t("import")}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
};

/** Renames the item (scope and name; the type stays) or deletes the draft for good. */
export const DraftSettingsDialog = ({
  draftId,
  scope,
  name,
  dirty,
  proposal = false,
  onClose,
}: {
  draftId: string;
  scope: string;
  name: string;
  dirty: boolean;
  /** A change proposal (017) keeps its item's scope and name: only deleting is offered. */
  proposal?: boolean;
  onClose: () => void;
}) => {
  const t = useTranslations("author.editor");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title={t("settingsTitle")}>
      <div className="grid gap-6">
        {proposal ? (
          <p className="text-sm text-fg">
            {t.rich("proposalName", {
              name: `@${scope}/${name}`,
              mono: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </p>
        ) : null}
        <form
          hidden={proposal}
          className="grid gap-4"
          action={(form) =>
            start(async () => {
              const result = await renameDraftAction(draftId, form);
              if (!result.ok) return setError(result.error);
              onClose();
              router.refresh();
            })
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="draft-scope">{t("scope")}</Label>
              <input
                id="draft-scope"
                name="scope"
                defaultValue={`@${scope}`}
                required
                className={`${inputClasses} font-mono`}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="draft-name">{t("name")}</Label>
              <input
                id="draft-name"
                name="name"
                defaultValue={name}
                required
                maxLength={64}
                className={`${inputClasses} font-mono`}
              />
            </div>
          </div>
          <p className="text-xs text-muted">
            {t.rich("renameNote", {
              mono: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </p>
          {dirty ? <p className="text-xs text-fg">{t("unsaved")}</p> : null}
          <FieldError id="rename-error">{error}</FieldError>
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" loading={pending} disabled={dirty}>
              {t("rename")}
            </Button>
          </div>
        </form>
        <div className="grid gap-3 border-t border-hairline pt-4">
          <p className="text-sm text-fg">{t("deleteNote")}</p>
          <div className="flex justify-end gap-2">
            {confirmDelete ? (
              <>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  {t("keep")}
                </Button>
                <Button
                  variant="destructive"
                  loading={pending}
                  onClick={() =>
                    start(async () => {
                      const result = await deleteDraftAction(draftId);
                      if (!result.ok) setError(result.error);
                    })
                  }
                >
                  {t("deleteForGood")}
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                {t("deleteDraft")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
