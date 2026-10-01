"use client";

import { inputClasses, Label } from "@/components/ui/Field";
import type { ItemRef } from "@/server/domains/items/actions/versions";
import { ChangeDialog } from "./ChangeDialog";

const TextArea = ({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
}) => (
  <div className="grid gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    <textarea
      id={id}
      rows={3}
      maxLength={300}
      required
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${inputClasses} h-auto py-2`}
    />
    <p className="text-xs text-muted">{hint}</p>
  </div>
);

/** Runs and installs of one version over 30 days (047). */
export type VersionReach = { runs: number; installs: number };

/** What the deprecate and yank dialogs say about who still uses the version (047). */
export const reachLine = ({ runs, installs }: VersionReach) =>
  `Reported in the last 30 days: ${runs.toLocaleString("en-US")} ${runs === 1 ? "run" : "runs"}, ${installs.toLocaleString("en-US")} ${installs === 1 ? "install" : "installs"}.`;

const Reach = ({ reach }: { reach: VersionReach | null }) =>
  reach ? <p className="text-sm text-fg">{reachLine(reach)}</p> : null;

/**
 * The actions on one version: deprecate or undeprecate, yank or unyank (feature 016). `reach` is the
 * version's usage when the item has enough to show (047), so the dialogs say what still uses it.
 */
export const VersionControls = ({
  itemRef,
  version,
  deprecated,
  yanked,
  reach = null,
}: {
  itemRef: ItemRef;
  version: string;
  deprecated: boolean;
  yanked: boolean;
  reach?: VersionReach | null;
}) => (
  <div className="flex flex-wrap justify-end gap-1">
    {deprecated ? (
      <ChangeDialog
        itemRef={itemRef}
        label="Undeprecate"
        title={`Undeprecate ${version}?`}
        confirm="Undeprecate"
        initial={{}}
        change={() => ({ kind: "undeprecate", version })}
      >
        <p className="text-sm text-fg">Its deprecation message goes away.</p>
      </ChangeDialog>
    ) : (
      <ChangeDialog
        itemRef={itemRef}
        label="Deprecate"
        title={`Deprecate ${version}`}
        confirm="Deprecate"
        initial={{ message: "" }}
        change={(v) => ({ kind: "deprecate", version, message: v.message })}
        fields={(v, set) => (
          <TextArea
            id="deprecate-message"
            label="Message"
            value={v.message}
            onChange={(message) => set({ message })}
            hint="Shown wherever this version is installed, such as “Use 1.2.0 or later.” It stays installable."
          />
        )}
      >
        <Reach reach={reach} />
      </ChangeDialog>
    )}
    {yanked ? (
      <ChangeDialog
        itemRef={itemRef}
        label="Unyank"
        title={`Unyank ${version}?`}
        confirm="Unyank"
        initial={{}}
        change={() => ({ kind: "unyank", version })}
      >
        <p className="text-sm text-fg">
          New installs can resolve it again. Tags stay where they are.
        </p>
      </ChangeDialog>
    ) : (
      <ChangeDialog
        itemRef={itemRef}
        label="Yank"
        title={`Yank ${version}`}
        confirm="Yank"
        destructive
        initial={{ reason: "" }}
        change={(v) => ({ kind: "yank", version, reason: v.reason })}
        fields={(v, set) => (
          <TextArea
            id="yank-reason"
            label="Reason"
            value={v.reason}
            onChange={(reason) => set({ reason })}
            hint="New installs can't resolve it; projects that pin it in their lockfile still get it. If latest points to it, latest moves back."
          />
        )}
      >
        <Reach reach={reach} />
      </ChangeDialog>
    )}
  </div>
);

/** Moving a tag, or adding one, to a version chosen from the list. */
export const TagControls = ({
  itemRef,
  tag,
  versions,
  current,
}: {
  itemRef: ItemRef;
  /** The tag to move; empty to add a new one. */
  tag: string;
  versions: { version: string; yanked: boolean }[];
  current?: string;
}) => {
  const choosable = versions.filter((v) => !v.yanked).map((v) => v.version);
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <ChangeDialog
        itemRef={itemRef}
        label={tag ? "Move" : "Add a tag"}
        title={tag ? `Move ${tag}` : "Add a tag"}
        confirm={tag ? "Move" : "Add"}
        initial={{ tag, version: current ?? choosable[0] ?? "" }}
        change={(v) => ({ kind: "move_tag", tag: v.tag, version: v.version })}
        fields={(v, set) => (
          <>
            {tag ? null : (
              <div className="grid gap-1.5">
                <Label htmlFor="tag-name">Tag</Label>
                <input
                  id="tag-name"
                  required
                  maxLength={32}
                  value={v.tag}
                  onChange={(event) => set({ ...v, tag: event.target.value })}
                  className={`${inputClasses} font-mono`}
                />
                <p className="text-xs text-muted">
                  Lowercase letters, digits and hyphens, such as beta or stable-1.
                </p>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="tag-version">Version</Label>
              <select
                id="tag-version"
                value={v.version}
                onChange={(event) => set({ ...v, version: event.target.value })}
                className={`${inputClasses} font-mono`}
              >
                {choosable.map((version) => (
                  <option key={version} value={version}>
                    {version}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      />
      {tag && tag !== "latest" ? (
        <ChangeDialog
          itemRef={itemRef}
          label="Remove"
          title={`Remove ${tag}?`}
          confirm="Remove"
          destructive
          initial={{}}
          change={() => ({ kind: "remove_tag", tag })}
        >
          <p className="text-sm text-fg">
            Installing @{itemRef.scope}/{itemRef.name}@{tag} stops working.
          </p>
        </ChangeDialog>
      ) : null}
    </div>
  );
};
