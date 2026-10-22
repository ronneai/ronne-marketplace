"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { loadShelfAction, moveInShelfAction, unpinFromShelfAction } from "./actions";
import type { ShelfResult } from "./types";

/** What the list needs to draw a shelf and to change it. */
export type ShelfListProps = {
  state: ShelfResult;
  /** A change is under way: the buttons wait. */
  pending: boolean;
  onMove: (itemId: string, direction: "up" | "down") => void;
  onRemove: (itemId: string) => void;
};

/**
 * A shelf's pins in order (feature 125), with Move up, Move down and Remove on each: buttons, not
 * dragging, so touch and keyboard work the same. It shows the count against the limit, the first
 * can't move up and the last can't move down, and a pin that is not available now (the item has no
 * installable version) is marked, so it can still be removed.
 */
export const ShelfList = ({ state, pending, onMove, onRemove }: ShelfListProps) => {
  const t = useTranslations("shelves.manage");
  const entries = state.ok ? state.entries : [];
  return (
    <div className="grid gap-3">
      {state.ok ? (
        <p className="text-sm text-muted">
          {t("count", { count: entries.length, max: state.max })}
        </p>
      ) : (
        <p role="alert" className="text-sm text-error-text">
          {state.error}
        </p>
      )}
      {state.ok && entries.length === 0 ? <p className="text-sm text-muted">{t("empty")}</p> : null}
      <ol className="grid gap-2">
        {entries.map((entry, index) => (
          <li
            key={entry.itemId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-hairline px-3 py-2"
          >
            <div className="grid min-w-0 gap-1">
              <span className="font-mono text-sm break-all text-fg">{entry.name}</span>
              {entry.availability === "unavailable" ? (
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone="warning">{t("unavailable")}</Badge>
                  {t("unavailableHint")}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <IconButton
                label={t("up", { name: entry.name })}
                disabled={pending || index === 0}
                onClick={() => onMove(entry.itemId, "up")}
              >
                <ArrowUp size={16} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={t("down", { name: entry.name })}
                disabled={pending || index === entries.length - 1}
                onClick={() => onMove(entry.itemId, "down")}
              >
                <ArrowDown size={16} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={t("remove", { name: entry.name })}
                disabled={pending}
                onClick={() => onRemove(entry.itemId)}
              >
                <X size={16} aria-hidden="true" />
              </IconButton>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};

/** A shelf for the Manage view: loads it, and answers each button with the shelf as it is then. */
export const ManageShelf = ({ shelfKey }: { shelfKey: string }) => {
  const t = useTranslations("shelves.manage");
  const [state, setState] = useState<ShelfResult | null>(null);
  const [pending, start] = useTransition();
  const run = (work: () => Promise<ShelfResult>) => start(async () => setState(await work()));
  // biome-ignore lint/correctness/useExhaustiveDependencies: loads once per shelf; `run` is new every render.
  useEffect(() => run(() => loadShelfAction(shelfKey)), [shelfKey]);
  if (!state) return <p className="text-sm text-muted">{t("loading")}</p>;
  return (
    <ShelfList
      state={state}
      pending={pending}
      onMove={(itemId, direction) => run(() => moveInShelfAction(shelfKey, itemId, direction))}
      onRemove={(itemId) => run(() => unpinFromShelfAction(shelfKey, itemId))}
    />
  );
};
