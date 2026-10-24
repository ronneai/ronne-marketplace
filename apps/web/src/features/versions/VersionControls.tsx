"use client";

import { useTranslations } from "next-intl";
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
export const Reach = ({ reach }: { reach: VersionReach | null }) => {
  const t = useTranslations("author.versions");
  return reach ? <p className="text-sm text-fg">{t("reach", reach)}</p> : null;
};

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
  open,
}: {
  itemRef: ItemRef;
  version: string;
  deprecated: boolean;
  yanked: boolean;
  reach?: VersionReach | null;
  /** Which dialog opens at once: for a test, or a link that asks for it. */
  open?: "deprecate" | "yank";
}) => {
  const t = useTranslations("author.versions");
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {deprecated ? (
        <ChangeDialog
          itemRef={itemRef}
          label={t("undeprecate")}
          title={t("undeprecateTitle", { version })}
          confirm={t("undeprecate")}
          defaultOpen={open === "deprecate"}
          initial={{}}
          change={() => ({ kind: "undeprecate", version })}
        >
          <p className="text-sm text-fg">{t("undeprecateText")}</p>
        </ChangeDialog>
      ) : (
        <ChangeDialog
          itemRef={itemRef}
          label={t("deprecate")}
          title={t("deprecateTitle", { version })}
          confirm={t("deprecate")}
          defaultOpen={open === "deprecate"}
          initial={{ message: "" }}
          change={(v) => ({ kind: "deprecate", version, message: v.message })}
          fields={(v, set) => (
            <TextArea
              id="deprecate-message"
              label={t("message")}
              value={v.message}
              onChange={(message) => set({ message })}
              hint={t("deprecateHint")}
            />
          )}
        >
          <Reach reach={reach} />
        </ChangeDialog>
      )}
      {yanked ? (
        <ChangeDialog
          itemRef={itemRef}
          label={t("unyank")}
          title={t("unyankTitle", { version })}
          confirm={t("unyank")}
          defaultOpen={open === "yank"}
          initial={{}}
          change={() => ({ kind: "unyank", version })}
        >
          <p className="text-sm text-fg">{t("unyankText")}</p>
        </ChangeDialog>
      ) : (
        <ChangeDialog
          itemRef={itemRef}
          label={t("yank")}
          title={t("yankTitle", { version })}
          confirm={t("yank")}
          defaultOpen={open === "yank"}
          destructive
          initial={{ reason: "" }}
          change={(v) => ({ kind: "yank", version, reason: v.reason })}
          fields={(v, set) => (
            <TextArea
              id="yank-reason"
              label={t("reason")}
              value={v.reason}
              onChange={(reason) => set({ reason })}
              hint={t("yankHint")}
            />
          )}
        >
          <Reach reach={reach} />
        </ChangeDialog>
      )}
    </div>
  );
};

/** Moving a tag, or adding one, to a version chosen from the list. */
export const TagControls = ({
  itemRef,
  tag,
  versions,
  current,
  open,
}: {
  itemRef: ItemRef;
  /** The tag to move; empty to add a new one. */
  tag: string;
  versions: { version: string; yanked: boolean }[];
  current?: string;
  /** Which dialog opens at once: for a test, or a link that asks for it. */
  open?: "move" | "remove";
}) => {
  const t = useTranslations("author.versions");
  const choosable = versions.filter((v) => !v.yanked).map((v) => v.version);
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <ChangeDialog
        itemRef={itemRef}
        label={tag ? t("move") : t("addTag")}
        title={tag ? t("moveTitle", { tag }) : t("addTag")}
        confirm={tag ? t("move") : t("add")}
        defaultOpen={open === "move"}
        initial={{ tag, version: current ?? choosable[0] ?? "" }}
        change={(v) => ({ kind: "move_tag", tag: v.tag, version: v.version })}
        fields={(v, set) => (
          <>
            {tag ? null : (
              <div className="grid gap-1.5">
                <Label htmlFor="tag-name">{t("tag")}</Label>
                <input
                  id="tag-name"
                  required
                  maxLength={32}
                  value={v.tag}
                  onChange={(event) => set({ ...v, tag: event.target.value })}
                  className={`${inputClasses} font-mono`}
                />
                <p className="text-xs text-muted">{t("tagHint")}</p>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="tag-version">{t("versionLabel")}</Label>
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
          label={t("remove")}
          title={t("removeTitle", { tag })}
          confirm={t("remove")}
          defaultOpen={open === "remove"}
          destructive
          initial={{}}
          change={() => ({ kind: "remove_tag", tag })}
        >
          <p className="text-sm text-fg">
            {t.rich("removeText", {
              install: `@${itemRef.scope}/${itemRef.name}@${tag}`,
              mono: (chunks) => <>{chunks}</>,
            })}
          </p>
        </ChangeDialog>
      ) : null}
    </div>
  );
};
