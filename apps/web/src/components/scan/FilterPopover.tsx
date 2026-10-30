"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Popover } from "@/components/ui/Popover";
import { toggleChoice } from "./summary";

/** How many chosen values the button names before it says "+N". */
const NAMED = 2;

export type FilterOption<T extends string> = {
  value: T;
  /** In the list, with its count. */
  label: string;
  /** On the button, once chosen: the name alone. */
  name: string;
  tone?: BadgeTone;
};

/**
 * One of the Security scan tab's filters (137): a button that names what it is narrowed to, as
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
  const t = useTranslations("author.scan.dialog");
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
              <Badge>{t("filterAll")}</Badge>
            ) : (
              <>
                {chosen.slice(0, NAMED).map((o) => (
                  <Badge key={o.value} tone={o.tone ?? "accent"}>
                    {o.name}
                  </Badge>
                ))}
                {chosen.length > NAMED ? (
                  <Badge>{t("filterMore", { count: chosen.length - NAMED })}</Badge>
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
          {options.map((o) => (
            <label
              key={o.value}
              className="flex min-h-6 cursor-pointer items-center gap-2 pointer-coarse:min-h-11"
            >
              <input
                type="checkbox"
                checked={value?.has(o.value) ?? false}
                onChange={() => onChange(toggleChoice(value, all, o.value))}
                className="size-4 accent-(--accent)"
              />
              {o.label}
            </label>
          ))}
        </fieldset>
      </Popover>
    </div>
  );
};
