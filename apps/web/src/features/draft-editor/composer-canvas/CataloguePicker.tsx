"use client";

import { DEPENDENCY_TYPES, type ItemType } from "@ronneai/core";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { startDrag } from "@/components/dependency-canvas/drag";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { inputClasses, selectClasses } from "@/components/ui/Field";
import { useDebounced } from "../hooks";
import { searchDependenciesAction } from "./actions";
import type { PickerEntry } from "./types";

/**
 * The picker's results: published items the draft may depend on, each added with its button or by
 * dragging it onto the canvas. One that's already a dependency says so instead.
 */
export const PickerResults = ({
  entries,
  added,
  onAdd,
}: {
  entries: readonly PickerEntry[];
  added: ReadonlySet<string>;
  onAdd: (entry: PickerEntry) => void;
}) => (
  <ul aria-label="Catalogue results" className="grid gap-1.5">
    {entries.map((entry) => {
      const has = added.has(entry.name);
      return (
        <li
          key={entry.name}
          draggable={!has}
          onDragStart={(event) => startDrag(event, entry)}
          className={cn(
            "flex items-center justify-between gap-2 rounded-control border border-hairline p-2",
            has ? "" : "cursor-grab hover:border-strong",
          )}
        >
          <div className="grid min-w-0 gap-1">
            <p className="font-mono text-xs font-semibold break-all text-fg">{entry.name}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge>{entry.type}</Badge>
              <span className="font-mono text-[11px] text-muted">v{entry.version}</span>
            </div>
            {entry.description ? (
              <p className="line-clamp-2 text-xs text-fg">{entry.description}</p>
            ) : null}
          </div>
          {has ? (
            <span className="shrink-0 px-2 font-mono text-[11px] text-muted">added</span>
          ) : (
            <Button
              variant="secondary"
              aria-label={`Add ${entry.name}`}
              onClick={() => onAdd(entry)}
              className="h-7 shrink-0 gap-1 px-2 text-xs"
            >
              <Plus size={14} aria-hidden="true" />
              Add
            </Button>
          )}
        </li>
      );
    })}
  </ul>
);

type Found =
  | { state: "loading"; entries: PickerEntry[]; nextCursor: null }
  | { state: "ready"; entries: PickerEntry[]; nextCursor: string | null }
  | { state: "failed"; entries: PickerEntry[]; nextCursor: null };

/**
 * The catalogue, for adding dependencies (feature 031): 018's search over the types this draft may
 * depend on, and only items with a version to install. The draft's own item is never offered.
 */
export const CataloguePicker = ({
  itemName,
  type,
  added,
  onAdd,
}: {
  itemName: string;
  type: ItemType;
  added: ReadonlySet<string>;
  onAdd: (entry: PickerEntry) => void;
}) => {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<ItemType | "">("");
  const [found, setFound] = useState<Found>({ state: "loading", entries: [], nextCursor: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const search = useDebounced(q, 250);
  // Only the latest search's answer is shown.
  const asked = useRef(0);

  useEffect(() => {
    const request = ++asked.current;
    setFound((current) => ({ state: "loading", entries: current.entries, nextCursor: null }));
    searchDependenciesAction({ type, q: search, only: only || null })
      .then((result) => {
        if (request !== asked.current) return;
        setFound(
          result.ok
            ? { state: "ready", entries: result.entries, nextCursor: result.nextCursor }
            : { state: "failed", entries: [], nextCursor: null },
        );
      })
      .catch(() => {
        if (request === asked.current) setFound({ state: "failed", entries: [], nextCursor: null });
      });
  }, [type, search, only]);

  const more = async () => {
    if (found.state !== "ready" || !found.nextCursor) return;
    const request = asked.current;
    setLoadingMore(true);
    try {
      const result = await searchDependenciesAction({
        type,
        q: search,
        only: only || null,
        cursor: found.nextCursor,
      });
      if (request === asked.current && result.ok)
        setFound({
          state: "ready",
          entries: [...found.entries, ...result.entries],
          nextCursor: result.nextCursor,
        });
    } finally {
      setLoadingMore(false);
    }
  };

  const entries = found.entries.filter((entry) => entry.name !== itemName);
  return (
    <section aria-label="Add from the catalogue" className="grid content-start gap-2">
      <h2 className="text-sm font-semibold text-fg">Add from the catalogue</h2>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input
          type="search"
          aria-label="Search the catalogue"
          placeholder="Name or keyword"
          maxLength={100}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className={cn(inputClasses, "h-8")}
        />
        <select
          aria-label="Type"
          value={only}
          onChange={(event) => setOnly(event.target.value as ItemType | "")}
          className={cn(selectClasses, "h-8 w-auto font-mono text-xs")}
        >
          <option value="">Any type</option>
          {DEPENDENCY_TYPES[type].map((allowed) => (
            <option key={allowed} value={allowed}>
              {allowed}
            </option>
          ))}
        </select>
      </div>
      <p role="status" className="text-xs text-muted">
        {found.state === "failed"
          ? "The catalogue couldn't be reached. Change the search to try again."
          : found.state === "loading"
            ? "Searching…"
            : entries.length === 0
              ? search || only
                ? "Nothing published matches."
                : "Nothing published yet that this item may depend on."
              : "Add one, or drag it onto the canvas."}
      </p>
      <PickerResults entries={entries} added={added} onAdd={onAdd} />
      {found.state === "ready" && found.nextCursor ? (
        <div>
          <Button
            variant="ghost"
            loading={loadingMore}
            onClick={() => void more()}
            className="h-7 px-2 text-xs"
          >
            Show more
          </Button>
        </div>
      ) : null}
    </section>
  );
};
