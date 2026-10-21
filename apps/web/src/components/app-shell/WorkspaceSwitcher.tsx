"use client";

import { ArrowRight, ArrowUpRight, Building2, Check, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { chooseHref } from "@/features/current-workspace/current-workspace";
import { DismissibleDetails } from "./DismissibleDetails";
import type { ShellWorkspace } from "./nav";

const focus = "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

const choice = `flex min-h-9 pointer-coarse:min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control px-3 text-left text-sm text-fg hover:bg-tint aria-[current=true]:font-semibold ${focus}`;

/**
 * The workspace switcher (119, 120): it shows the current workspace, the one the Catalogue, Reviews
 * and My submissions show, or All workspaces. Opened, it lists All workspaces and the workspaces
 * you're a member of, the current one marked; choosing one sets it and comes back to this page
 * (the `/current-workspace` route). The choices are plain links, not Next's `Link`: the route sets a
 * cookie, so it must never be prefetched, and the page must load again for the shell to show the
 * new choice. Each row also opens the workspace's page, and Manage
 * workspaces opens the list. A native <details> of links, so it works without JavaScript. In the
 * folded rail it's an icon, and the list opens to its right.
 */
export const WorkspaceSwitcher = ({
  workspaces,
  current = null,
  folded = false,
}: {
  workspaces: ShellWorkspace[];
  /** The current workspace's name (120), or null for All workspaces. */
  current?: string | null;
  folded?: boolean;
}) => {
  const t = useTranslations("shell.workspace");
  const tCommon = useTranslations("common");
  const path = usePathname() ?? "/";
  const search = useSearchParams()?.toString() ?? "";
  const here = search ? `${path}?${search}` : path;
  const chosen = workspaces.find((w) => w.name === current) ?? null;
  const title = chosen
    ? t("title", { name: chosen.name, personal: String(chosen.personal) })
    : t("all");
  const mark = (on: boolean) =>
    on ? (
      <Check size={14} aria-hidden className="shrink-0 text-muted" />
    ) : (
      <span aria-hidden className="w-3.5 shrink-0" />
    );
  return (
    <DismissibleDetails className="relative">
      <summary
        aria-label={folded ? t("label", { title }) : undefined}
        title={title}
        className={`flex w-full cursor-pointer list-none items-center overflow-hidden rounded-control border border-hairline bg-surface text-left text-fg transition-[padding,min-height] duration-200 hover:border-strong motion-reduce:transition-none [&::-webkit-details-marker]:hidden ${focus} ${folded ? "min-h-10 justify-center px-0 py-0" : "min-h-11 justify-between px-3 py-1.5"}`}
      >
        {/* One structure for both states, so folding is a morph: the icon grows in as the text and
            the chevrons narrow away (see Sidebar). */}
        <Building2
          size={18}
          aria-hidden
          className={`shrink-0 transition-[width,opacity] duration-200 motion-reduce:transition-none ${folded ? "w-[18px]" : "w-0 opacity-0"}`}
        />
        <span
          aria-hidden={folded}
          className={`grid min-w-0 flex-1 transition-[max-width,opacity] duration-200 motion-reduce:transition-none ${folded ? "max-w-0 opacity-0" : "max-w-64"}`}
        >
          <span className="truncate text-sm font-semibold">{chosen?.name ?? t("all")}</span>
          <span className="truncate font-mono text-xs text-muted">
            {chosen ? (chosen.personal ? t("personalKind") : t("kind")) : t("every")}
          </span>
        </span>
        <ChevronsUpDown
          size={16}
          aria-hidden
          className={`shrink-0 text-muted transition-[width,margin,opacity] duration-200 motion-reduce:transition-none ${folded ? "ml-0 w-0 opacity-0" : "ml-2 w-4"}`}
        />
      </summary>
      <div
        className={`absolute z-40 grid grid-cols-[minmax(0,1fr)] gap-0.5 rounded-panel border border-strong bg-surface p-1 ${folded ? "top-0 left-full ml-2 w-72" : "inset-x-0 top-full mt-1"}`}
      >
        <p className="px-3 pt-1.5 pb-1 font-mono text-xs uppercase text-muted">{t("show")}</p>
        <a
          href={chooseHref(null, here)}
          aria-current={chosen ? undefined : "true"}
          className={choice}
        >
          {mark(!chosen)}
          <span className="truncate">{t("all")}</span>
        </a>
        {workspaces.map((w) => (
          <div key={w.name} className="flex min-w-0 items-center gap-0.5">
            <a
              href={chooseHref(w.name, here)}
              aria-current={w.name === chosen?.name ? "true" : undefined}
              title={w.name}
              className={choice}
            >
              {mark(w.name === chosen?.name)}
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <span className="shrink-0 font-mono text-xs font-normal text-muted">
                {w.personal ? t("personal") : tCommon(`roles.${w.role}`)}
              </span>
            </a>
            <Link
              href={`/workspaces/${encodeURIComponent(w.name)}`}
              aria-label={t("open", { name: w.name })}
              title={t("open", { name: w.name })}
              className={`flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-tint hover:text-fg ${focus}`}
            >
              <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
        ))}
        <Link
          href="/workspaces"
          className={`flex min-h-9 pointer-coarse:min-h-11 w-full items-center justify-between gap-3 rounded-control border-t border-hairline px-3 text-left text-sm text-fg hover:bg-tint ${focus}`}
        >
          {t("manage")}
          <ArrowRight size={14} aria-hidden className="shrink-0 text-muted" />
        </Link>
      </div>
    </DismissibleDetails>
  );
};
