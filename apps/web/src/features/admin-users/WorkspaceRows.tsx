"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { selectClasses } from "@/components/ui/Field";

/** A workspace someone can be added to (092). */
export type WorkspaceOption = { id: string; name: string; isGlobal: boolean };

export type WorkspaceRole = "user" | "moderator" | "admin";
export type WorkspaceRow = { workspaceId: string; role: WorkspaceRole };

const RoleSelect = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: WorkspaceRole;
  onChange: (role: WorkspaceRole) => void;
}) => {
  const t = useTranslations("admin.workspaceRows.roles");
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as WorkspaceRole)}
      className={selectClasses}
    >
      <option value="user">{t("user")}</option>
      <option value="moderator">{t("moderator")}</option>
      <option value="admin">{t("admin")}</option>
    </select>
  );
};

/**
 * A user's workspaces and roles (092): `global` first, always there, then the others, each with a
 * role select and Remove; Add workspace picks one not yet listed, as a user.
 */
export const WorkspaceRows = ({
  workspaces,
  rows,
  setRows,
}: {
  workspaces: readonly WorkspaceOption[];
  rows: WorkspaceRow[];
  setRows: (rows: WorkspaceRow[]) => void;
}) => {
  const t = useTranslations("admin.workspaceRows");
  const nameOf = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id;
  const unused = workspaces.filter((w) => !rows.some((row) => row.workspaceId === w.id));
  const update = (index: number, change: Partial<WorkspaceRow>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 flex items-center gap-2 text-sm font-medium text-fg">
        {t("legend")}
        <Help id="global-always" />
      </legend>
      <ul className="grid gap-2">
        {rows.map((row, index) => {
          const workspace = workspaces.find((w) => w.id === row.workspaceId);
          return (
            <li
              key={row.workspaceId}
              className="grid grid-cols-[minmax(0,1fr)_8rem_2.75rem] items-center gap-2"
            >
              {workspace?.isGlobal ? (
                <span className="truncate font-mono text-sm">{workspace.name}</span>
              ) : (
                <select
                  aria-label={t("workspaceN", { number: index + 1 })}
                  value={row.workspaceId}
                  onChange={(event) => update(index, { workspaceId: event.target.value })}
                  className={selectClasses}
                >
                  <option value={row.workspaceId}>{nameOf(row.workspaceId)}</option>
                  {unused.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              )}
              <RoleSelect
                label={t("roleIn", { workspace: nameOf(row.workspaceId) })}
                value={row.role}
                onChange={(role) => update(index, { role })}
              />
              {workspace?.isGlobal ? (
                <span className="text-xs text-muted">{t("always")}</span>
              ) : (
                <Button
                  variant="ghost"
                  aria-label={t("remove", { workspace: nameOf(row.workspaceId) })}
                  onClick={() => setRows(rows.filter((_, i) => i !== index))}
                >
                  <X size={16} aria-hidden="true" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {unused.length > 0 ? (
        <div>
          <Button
            variant="secondary"
            onClick={() =>
              setRows([...rows, { workspaceId: (unused[0] as WorkspaceOption).id, role: "user" }])
            }
          >
            <Plus size={16} aria-hidden="true" />
            {t("add")}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
};
