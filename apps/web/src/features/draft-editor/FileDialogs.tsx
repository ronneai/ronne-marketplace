"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { deleteDraftAction, importZipAction, renameDraftAction } from "./actions";

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
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{confirm}</Button>
        </div>
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
}) => (
  <Dialog open onClose={onClose} title="Delete file">
    <div className="grid gap-4">
      <p className="text-sm text-fg">
        Delete <span className="font-mono">{path}</span>? It's removed from the draft when you save.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onDone}>
          Delete
        </Button>
      </div>
    </div>
  </Dialog>
);

const UNSAVED = "Save or undo your changes first: this replaces what the editor holds.";

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
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title="Import a .zip">
      {dirty ? (
        <div className="grid gap-4">
          <p className="text-sm text-fg">{UNSAVED}</p>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
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
            <Label htmlFor="zip-file">Archive</Label>
            <input
              id="zip-file"
              name="archive"
              type="file"
              accept=".zip,application/zip"
              required
              className="text-sm text-fg file:mr-3 file:rounded-control file:border file:border-hairline file:bg-tint file:px-3 file:py-1.5 file:text-sm file:text-fg"
            />
            <p className="text-xs text-muted">
              A single top folder is unwrapped. Links, paths outside the item and files over the
              limits are refused, and then nothing changes.
            </p>
          </div>
          <fieldset className="grid gap-2">
            <legend className="pb-1 text-sm font-semibold text-fg">Existing files</legend>
            <label className="flex items-start gap-2 text-sm text-fg">
              <input
                type="radio"
                name="mode"
                value="merge"
                defaultChecked
                className="mt-0.5 size-4 accent-(--accent)"
              />
              <span>
                Merge: the archive's files replace the draft's with the same path; the rest stay.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-fg">
              <input
                type="radio"
                name="mode"
                value="replace"
                className="mt-0.5 size-4 accent-(--accent)"
              />
              <span>Replace: only the archive's files are left. It must have a ronne.yaml.</span>
            </label>
          </fieldset>
          <FieldError id="zip-error">{error}</FieldError>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Import
            </Button>
          </div>
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
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title="Draft settings">
      <div className="grid gap-6">
        {proposal ? (
          <p className="text-sm text-fg">
            A change proposal keeps its item&apos;s scope and name:{" "}
            <span className="font-mono">
              @{scope}/{name}
            </span>
            . To use another name, start a new item.
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
              <Label htmlFor="draft-scope">Scope</Label>
              <input
                id="draft-scope"
                name="scope"
                defaultValue={`@${scope}`}
                required
                className={`${inputClasses} font-mono`}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="draft-name">Name</Label>
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
            The type can't change. <span className="font-mono">name</span> in ronne.yaml follows the
            new name.
          </p>
          {dirty ? <p className="text-xs text-fg">{UNSAVED}</p> : null}
          <FieldError id="rename-error">{error}</FieldError>
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" loading={pending} disabled={dirty}>
              Rename
            </Button>
          </div>
        </form>
        <div className="grid gap-3 border-t border-hairline pt-4">
          <p className="text-sm text-fg">
            Deleting removes the draft and its files for good. It was never submitted, so there's no
            history to keep.
          </p>
          <div className="flex justify-end gap-2">
            {confirmDelete ? (
              <>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep it
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
                  Delete for good
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                Delete draft
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
