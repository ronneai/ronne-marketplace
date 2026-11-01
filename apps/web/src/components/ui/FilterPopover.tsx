"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Badge, type BadgeTone } from "./Badge";
import { toggleChoice } from "./filter-choice";
import { Popover } from "./Popover";

/** How many chosen values the button names before it says "+N". */
const NAMED = 2;

export type FilterOption<T extends string> = {
  value: T;
  /** In the list, with its count. */
  label: string;
  /** On the button, once chosen: the name alone. */
  name: string;
  tone?: BadgeTone;
  /** A heading the option is listed under: options that follow each other with one share it. */
  group?: string;
};

/**
 * A multi-select filter (137, shared since 139): a button that names what it is narrowed to, as
 * badges, or "All", and opens a popover of checkboxes. `value` is `null` for all, else the chosen
 * values (see `toggleChoice`).
 */
export const FilterPopover = <T extends string>({
  label,
  allLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  /** The "All (n)" row's text. */
  allLabel: string;
  options: readonly FilterOption<T>[];
  value: ReadonlySet<T> | null;
  onChange: (value: ReadonlySet<T> | null) => void;
}) => {
  const t = useTranslations("common.filter");
  const chosen = value === null ? [] : options.filter((o) => value.has(o.value));
  const all = options.map((o) => o.value);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <Popover
        label={label}
        placement="bottom-start"
        maxWidth={320}
        buttonClassName="px-1 py-1 text-xs text-fg hover:underline pointer-coarse:min-h-11"
        button={
          <>
            {chosen.length === 0 ? (
              <Badge>{t("all")}</Badge>
            ) : (
              <>
                {chosen.slice(0, NAMED).map((o) => (
                  <Badge key={o.value} tone={o.tone ?? "accent"}>
                    {o.name}
                  </Badge>
                ))}
                {chosen.length > NAMED ? (
                  <Badge>{t("more", { count: chosen.length - NAMED })}</Badge>
                ) : null}
              </>
            )}
            <ChevronDown aria-hidden="true" className="size-3.5 text-muted" />
          </>
        }
      >
        <fieldset className="grid gap-1 border-0 p-0">
          <legend className="sr-only">{label}</legend>
          <label className="flex min-h-6 cursor-pointer items-center gap-2 pointer-coarse:min-h-11">
            <input
              type="checkbox"
              checked={value === null}
              // "All" is how the filter is cleared: unticking it does nothing by itself.
              onChange={() => onChange(null)}
              className="size-4 accent-(--accent)"
            />
            {allLabel}
          </label>
          {options.map((o, index) => (
            <Fragment key={o.value}>
              {o.group && o.group !== options[index - 1]?.group ? (
                <span className="mt-1 text-xs font-semibold text-muted">{o.group}</span>
              ) : null}
              <label className="flex min-h-6 cursor-pointer items-center gap-2 pointer-coarse:min-h-11">
                <input
                  type="checkbox"
                  checked={value?.has(o.value) ?? false}
                  onChange={() => onChange(toggleChoice(value, all, o.value))}
                  className="size-4 accent-(--accent)"
                />
                {o.label}
              </label>
            </Fragment>
          ))}
        </fieldset>
      </Popover>
    </div>
  );
};
