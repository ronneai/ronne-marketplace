"use client";

import type { ItemType } from "@ronneai/core";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { DependencyStatusBadge } from "@/components/submissions/DependencyMarks";
import { Badge } from "@/components/ui/Badge";
import { inputClasses, Select } from "@/components/ui/Field";
import { TypeBadge } from "@/components/ui/TypeBadge";
import type { DependencyOption } from "@/server/domains/submissions/actions/composer";
import type { DependencyMark } from "@/server/domains/submissions/actions/submissions";
import { findDependenciesAction } from "./actions";
import { dependencyRows, rangeFor, statusText, versionChoices } from "./model";

/** The mark a dependency picked here gets, from what the list said of it: none once published. */
const markOfOption = (option: DependencyOption): DependencyMark | undefined =>
  option.status === "published"
    ? undefined
    : {
        kind: "waits",
        dependency: option.name,
        status: option.status === "draft" ? "not_submitted" : option.status,
      };

/** How long typing settles before the list is fetched. */
const DEBOUNCE_MS = 250;

/**
 * The options for what's typed (056), fetched as typing settles; the newest answer wins. Shared
 * by the form's picker and `@` in markdown.
 */
export const useDependencyOptions = (
  query: string | null,
  input: { type: ItemType; itemName: string; exclude: string[] },
) => {
  const [options, setOptions] = useState<DependencyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const exclude = input.exclude.join(" ");
  useEffect(() => {
    if (query === null) return;
    let current = true;
    const timer = setTimeout(async () => {
      const result = await findDependenciesAction({
        type: input.type,
        q: query,
        itemName: input.itemName,
        exclude: exclude ? exclude.split(" ") : [],
      });
      if (!current) return;
      if (result.ok) {
        setOptions(result.options);
        setError(null);
      } else setError(result.error);
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, input.type, input.itemName, exclude]);
  return { options: query === null ? [] : options, error };
};

/** One option as the list shows it: name, type and status. */
export const OptionLine = ({ option }: { option: DependencyOption }) => (
  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
    <span className="truncate font-mono text-sm text-fg">{option.name}</span>
    <TypeBadge type={option.type} />
    <span className="text-xs text-muted">{statusText(option)}</span>
  </span>
);

/** A row's range: the versions when the item was picked here, otherwise a range to type. */
const RangeInput = ({
  name,
  range,
  option,
  onChange,
}: {
  name: string;
  range: string;
  option: DependencyOption | undefined;
  onChange: (range: string) => void;
}) => {
  // Typed ranges are written when the field is left, so half a range never reaches the checks.
  const [typed, setTyped] = useState(range);
  useEffect(() => setTyped(range), [range]);
  if (option) {
    const choices = versionChoices(option).flatMap((group) => group.choices);
    const known = choices.some((choice) => choice.range === range);
    return (
      <Select
        aria-label={`Version of ${name}`}
        value={range}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 font-mono text-xs"
      >
        {known ? null : <option value={range}>{range}</option>}
        {choices.map((choice) => (
          <option key={choice.range} value={choice.range}>
            {choice.label}
          </option>
        ))}
      </Select>
    );
  }
  return (
    <input
      aria-label={`Range of ${name}`}
      value={typed}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={() => typed !== range && onChange(typed)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (typed !== range) onChange(typed);
        }
      }}
      className={`${inputClasses} h-8 font-mono text-xs`}
    />
  );
};

/**
 * The dependencies field of the manifest form (056). Items are picked from a list that searches
 * as you type (your own in any state, others' once published, 089), never typed by hand, so no half name
 * reaches ronne.yaml. A picked one starts on `latest`, with its versions to choose from.
 */
export const DependencyField = ({
  value,
  type,
  itemName,
  onChange,
  marks = [],
}: {
  /** What each saved dependency waits on (056): a badge beside its name. */
  marks?: readonly DependencyMark[];
  value: unknown;
  type: ItemType;
  itemName: string;
  onChange: (dependencies: Record<string, string>) => void;
}) => {
  const rows = dependencyRows(value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // What's known of items picked here, for their version lists and notes.
  const [picked, setPicked] = useState<Record<string, DependencyOption>>({});
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { options, error } = useDependencyOptions(open ? query : null, {
    type,
    itemName,
    exclude: rows.map(([name]) => name),
  });

  const write = (next: [string, string][]) => onChange(Object.fromEntries(next));
  const pick = (option: DependencyOption) => {
    setPicked((previous) => ({ ...previous, [option.name]: option }));
    write([...rows, [option.name, rangeFor(option)]]);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="grid gap-2">
      <div className="relative">
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          aria-label="Add a dependency"
          placeholder="Add a dependency: type part of its name"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((i) => Math.min(i + 1, options.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (event.key === "Enter") {
              const option = options[active];
              if (open && option) {
                event.preventDefault();
                pick(option);
              }
            } else if (event.key === "Escape") setOpen(false);
          }}
          className={`${inputClasses} font-mono text-sm`}
        />
        {open && (options.length > 0 || error || query) ? (
          <div
            id={listId}
            role="listbox"
            aria-label="Items to depend on"
            className="absolute right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-control border border-strong bg-surface py-1"
          >
            {error ? (
              <p className="px-3 py-2 text-sm text-error-text">{error}</p>
            ) : options.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">No item matches.</p>
            ) : (
              options.map((option, i) => (
                <div
                  key={option.name}
                  id={`${listId}-${i}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={i === active}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(option);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 aria-selected:bg-tint"
                >
                  <OptionLine option={option} />
                  {option.status === "draft" ? <Badge>draft</Badge> : null}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
      {rows.length > 0 ? (
        <ul className="grid gap-2">
          {rows.map(([name, range]) => {
            const option = picked[name];
            const mark = option ? markOfOption(option) : marks.find((m) => m.dependency === name);
            return (
              <li key={name} className="grid gap-1">
                <div className="flex items-center gap-2">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate font-mono text-sm text-fg">{name}</span>
                    {mark ? <DependencyStatusBadge mark={mark} /> : null}
                  </span>
                  <div className="w-44 shrink-0">
                    <RangeInput
                      name={name}
                      range={range}
                      option={option}
                      onChange={(next) => write(rows.map(([n, r]) => [n, n === name ? next : r]))}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    onClick={() => write(rows.filter(([n]) => n !== name))}
                    className="text-muted hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <X size={16} aria-hidden />
                  </button>
                </div>
                {option?.status === "draft" ? (
                  <p className="text-xs text-muted">
                    A draft: it&apos;s submitted with this item when you submit it.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};
