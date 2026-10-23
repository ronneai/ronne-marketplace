"use client";

import { ITEM_TYPES, type ItemType, NAME_MAX_LENGTH, nameProblem } from "@ronneai/core";
import { ArrowRight, CircleCheck, FileCode, Info, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode, useActionState, useMemo, useState } from "react";
import { Help } from "@/components/help/Help";
import { docsHref } from "@/components/help/topics";
import { TYPE_GROUPS, TYPE_INFO, type TypeGroup } from "@/components/submissions/item-types";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { FieldError, inputClasses, touchFieldClasses } from "@/components/ui/Field";
import { NewTabLink } from "@/components/ui/NewTabLink";
import { Notice } from "@/components/ui/Notice";
import { MANIFEST_PATH } from "@/server/domains/submissions/models/submission";
import { draftTemplate } from "@/server/domains/submissions/models/templates";
import { createDraftFromForm } from "./actions";
import type { NewDraftState, ScopeOption } from "./types";

/** With more scopes than this, the chips get a search box. */
const SCOPE_SEARCH_FROM = 8;

const Section = ({
  step,
  title,
  aside,
  children,
}: {
  step: number;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) => (
  <section
    aria-labelledby={`step-${step}`}
    className="grid gap-4 rounded-panel border border-hairline bg-surface p-6"
  >
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={`step-${step}`} className="flex items-center gap-3 text-lg font-semibold text-fg">
        <span className="grid size-6 place-content-center rounded-full border border-strong text-xs text-fg">
          {step}
        </span>
        {title}
      </h2>
      {aside}
    </div>
    {children}
  </section>
);

// A long scope name (64 characters, no hyphen) breaks rather than widen the page (115).
const chipClasses =
  "max-w-full min-w-0 cursor-pointer rounded-control border border-transparent px-3 py-1.5 font-mono text-xs [overflow-wrap:anywhere] text-muted hover:text-fg has-[:checked]:border-hairline has-[:checked]:bg-surface has-[:checked]:font-semibold has-[:checked]:text-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus";

const filterClasses =
  "rounded-full border border-hairline px-3 py-1 text-xs text-muted hover:text-fg aria-pressed:border-transparent aria-pressed:bg-fg aria-pressed:text-canvas outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/**
 * New item (feature 012, after the Stitch mock): 1, the scope and name; 2, the type. The side
 * panel previews the starter files the draft will get (the real template), says whether reviewers
 * will see a risk flag, and creates the draft. `mine` are the item names of your drafts, to warn
 * (not block) about a repeat.
 */
/** A scope option's workspace: `acme` for `acme/infra`, `global` for `infra` (118). */
const workspaceOf = (name: string) =>
  name.includes("/") ? (name.split("/", 1)[0] ?? "") : "global";

export const NewDraftForm = ({
  scopes,
  mine,
  initialScope,
}: {
  scopes: ScopeOption[];
  mine: string[];
  /** The scope it starts on: the current workspace's first (120). Every scope stays choosable. */
  initialScope?: string;
}) => {
  const typeText = useTranslations("types");
  const t = useTranslations("author.newDraft");
  const nameText = useTranslations("common.nameProblem");
  const [state, action, pending] = useActionState<NewDraftState, FormData>(createDraftFromForm, {});
  const [scope, setScope] = useState(
    initialScope && scopes.some((option) => option.name === initialScope)
      ? initialScope
      : scopes.length === 1
        ? (scopes[0]?.name ?? "")
        : "",
  );
  const [scopeSearch, setScopeSearch] = useState("");
  const [typed, setTyped] = useState("");
  const [type, setType] = useState<ItemType | null>(null);
  const [typeSearch, setTypeSearch] = useState("");
  const [group, setGroup] = useState<TypeGroup | null>(null);

  const name = typed.trim().toLowerCase();
  const problem = name ? nameProblem(name, "item") : null;
  const itemName = `@${scope || t("scopeWord")}/${name || t("nameWord")}`;
  const chosenScope = scopes.find((option) => option.name === scope);

  const query = scopeSearch.trim().toLowerCase().replace(/^@/, "");
  // A heading starts each workspace's scopes once there's more than one, or the one is personal.
  const grouped =
    new Set(scopes.map((option) => workspaceOf(option.name))).size > 1 ||
    scopes.some((option) => option.personal);
  const shownScopes = scopes.filter(
    (option) =>
      option.name === scope ||
      option.name.includes(query) ||
      option.description.toLowerCase().includes(query),
  );
  const typeQuery = typeSearch.trim().toLowerCase();
  const shownTypes = ITEM_TYPES.filter(
    (candidate) =>
      (group === null || TYPE_INFO[candidate].group === group) &&
      (candidate.includes(typeQuery) ||
        typeText(`description.${candidate}`).toLowerCase().includes(typeQuery) ||
        typeText(`tag.${candidate}`).toLowerCase().includes(typeQuery)),
  );
  const starter = useMemo(() => (type ? draftTemplate(type, itemName) : []), [type, itemName]);
  const manifest = starter.find((file) => file.path === MANIFEST_PATH);
  const others = starter.filter((file) => file.path !== MANIFEST_PATH);

  if (scopes.length === 0)
    return (
      <Notice kind="info" title={t("noScopesTitle")}>
        {t.rich("noScopes", {
          link: (chunks) => (
            <Link href="/workspaces" className="text-link underline underline-offset-2">
              {chunks}
            </Link>
          ),
        })}
      </Notice>
    );

  return (
    <form
      action={action}
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]"
    >
      <div className="grid min-w-0 gap-6">
        <Section
          step={1}
          title={t("step1")}
          aside={
            <NewTabLink
              href={docsHref("scopes")}
              className="text-sm text-link underline underline-offset-2"
            >
              {t("aboutScopes")}
            </NewTabLink>
          }
        >
          <fieldset className="grid gap-2">
            <legend className="pb-2 text-sm font-semibold text-fg">{t("scope")}</legend>
            <Help id="scope" />
            {scopes.length > SCOPE_SEARCH_FROM ? (
              <input
                type="search"
                aria-label={t("searchScopes")}
                placeholder={t("searchScopes")}
                value={scopeSearch}
                onChange={(event) => setScopeSearch(event.target.value)}
                className={inputClasses}
              />
            ) : null}
            <div className="flex flex-wrap gap-1 rounded-control border border-hairline bg-canvas p-1">
              {shownScopes.map((option, i) => {
                // Grouped by workspace (118): `acme/infra` is acme's; a heading starts each group
                // once there's more than one.
                const workspace = workspaceOf(option.name);
                const heading =
                  grouped && (i === 0 || workspaceOf(shownScopes[i - 1]?.name ?? "") !== workspace);
                return (
                  <Fragment key={option.name}>
                    {heading ? (
                      <span className="w-full px-2 pt-1 font-mono text-xs text-muted [overflow-wrap:anywhere]">
                        {option.personal ? t("personal", { workspace }) : workspace}
                      </span>
                    ) : null}
                    <label className={chipClasses}>
                      <input
                        type="radio"
                        name="scope"
                        value={option.name}
                        required
                        checked={scope === option.name}
                        onChange={() => setScope(option.name)}
                        className="sr-only"
                      />
                      @{option.name}
                    </label>
                  </Fragment>
                );
              })}
              {shownScopes.length === 0 ? (
                <p className="px-3 py-1.5 text-xs text-muted">{t("noScope")}</p>
              ) : null}
            </div>
            <p className="min-h-4 text-xs text-muted [overflow-wrap:anywhere]">
              {chosenScope ? (
                <>
                  <span className="font-mono text-fg">@{chosenScope.name}</span> —{" "}
                  {chosenScope.description}
                </>
              ) : (
                t("scopeHint")
              )}
            </p>
          </fieldset>

          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex items-center gap-1">
                <label htmlFor="item-name" className="text-sm font-semibold text-fg">
                  {t("name")}
                </label>
                <Help id="item-name" />
              </span>
              <span className="font-mono text-xs text-muted">{itemName}</span>
            </div>
            <div
              className={`flex h-10 pointer-coarse:h-11 items-center rounded-control border bg-surface px-3 focus-within:border-fg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus ${problem ? "border-fg" : "border-strong"}`}
            >
              <span
                className="shrink-0 font-mono text-sm text-muted pointer-coarse:text-base"
                aria-hidden="true"
              >
                @{scope || t("scopeWord")}/
              </span>
              <input
                id="item-name"
                name="name"
                required
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                aria-describedby="item-name-hint"
                aria-invalid={problem ? true : undefined}
                // biome-ignore lint/plugin: an example item name, written as names are
                placeholder="code-reviewer"
                className={cn(
                  "h-full min-w-0 flex-1 bg-transparent font-mono text-sm text-fg outline-none placeholder:text-muted/50",
                  touchFieldClasses,
                )}
              />
              {name && !problem ? (
                <CircleCheck
                  size={18}
                  className="ml-2 shrink-0 text-fg"
                  aria-label={t("validName")}
                  role="img"
                />
              ) : null}
            </div>
            <p id="item-name-hint" className="text-xs text-muted">
              {problem ? nameText(problem, { max: NAME_MAX_LENGTH }) : t("nameHint")}
            </p>
            <Help id="name" />
            {scope && name && mine.includes(itemName) ? (
              <p className="text-xs text-fg">
                <span className="mr-2 font-mono font-semibold">{t("note")}</span>
                {t("repeat", { name: itemName })}
              </p>
            ) : null}
          </div>
        </Section>

        <Section
          step={2}
          title={t("step2")}
          aside={
            <span className="font-mono text-xs text-muted">
              {t("typesCount", { count: ITEM_TYPES.length })}
            </span>
          }
        >
          <div className="grid gap-3">
            <Help id="type" />
            <div className="relative">
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                aria-label={t("filterTypes")}
                placeholder={t("filterPlaceholder")}
                value={typeSearch}
                onChange={(event) => setTypeSearch(event.target.value)}
                className={`${inputClasses} pl-9`}
              />
            </div>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">{t("groups")}</legend>
              <button
                type="button"
                aria-pressed={group === null}
                onClick={() => setGroup(null)}
                className={filterClasses}
              >
                {t("all", { count: ITEM_TYPES.length })}
              </button>
              {TYPE_GROUPS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={group === option.id}
                  onClick={() => setGroup(group === option.id ? null : option.id)}
                  className={filterClasses}
                >
                  {typeText(`group.${option.id}`)}
                </button>
              ))}
            </fieldset>
          </div>
          <p className="text-xs text-muted">{t("fixed")}</p>
          <fieldset>
            <legend className="sr-only">{t("type")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ITEM_TYPES.map((candidate) => {
                const info = TYPE_INFO[candidate];
                const shown = shownTypes.includes(candidate) || candidate === type;
                return (
                  <label
                    key={candidate}
                    hidden={!shown}
                    className="relative grid cursor-pointer content-start gap-1.5 rounded-control border border-hairline bg-canvas p-3 hover:border-strong has-[:checked]:border-accent has-[:checked]:bg-tint has-[:checked]:outline has-[:checked]:outline-1 has-[:checked]:outline-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
                  >
                    <input
                      type="radio"
                      name="type"
                      value={candidate}
                      required
                      checked={type === candidate}
                      onChange={() => setType(candidate)}
                      className="sr-only"
                    />
                    <span className="flex flex-wrap items-center gap-2 pr-6">
                      <span className="font-mono text-sm font-semibold text-fg">{candidate}</span>
                      <Badge>{typeText(`tag.${candidate}`)}</Badge>
                      {info.highRisk ? <Badge tone="warning">{t("risk")}</Badge> : null}
                    </span>
                    <span className="text-xs text-muted">
                      {typeText(`description.${candidate}`)}
                    </span>
                    {type === candidate ? (
                      <CircleCheck
                        size={18}
                        aria-hidden="true"
                        className="absolute top-3 right-3 text-fg"
                      />
                    ) : null}
                  </label>
                );
              })}
            </div>
            {shownTypes.length === 0 ? (
              <p className="text-sm text-muted">{t("noType", { count: ITEM_TYPES.length })}</p>
            ) : null}
          </fieldset>
        </Section>
      </div>

      <aside aria-label={t("starter")} className="grid gap-4 lg:sticky lg:top-20">
        <div className="grid gap-4 rounded-panel border border-hairline bg-surface p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <FileCode size={16} aria-hidden="true" />
            {t("starter")}
          </h2>
          {manifest ? (
            <>
              <div className="overflow-hidden rounded-control bg-code-bg">
                <div className="flex items-center justify-between border-b border-code-muted/20 px-3 py-2 font-mono text-xs text-code-muted">
                  <span>{MANIFEST_PATH}</span>
                  <span>{t("template")}</span>
                </div>
                <pre className="max-h-96 overflow-auto p-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-code-fg">
                  {manifest.content}
                </pre>
              </div>
              {others.length > 0 ? (
                <p className="text-xs text-muted">
                  {t("others", { files: others.map((file) => file.path).join(", ") })}
                </p>
              ) : (
                <p className="text-xs text-muted">{t("one")}</p>
              )}
              <div className="grid gap-1.5 rounded-control bg-canvas p-3">
                <p className="flex items-center justify-between gap-2 text-sm font-semibold text-fg">
                  <span className="flex items-center gap-2">
                    <ShieldCheck size={16} aria-hidden="true" />
                    {t("review")}
                  </span>
                  <Badge tone={TYPE_INFO[type as ItemType].highRisk ? "warning" : "muted"}>
                    {t(TYPE_INFO[type as ItemType].highRisk ? "riskFlag" : "standard")}
                  </Badge>
                </p>
                <p className="text-xs text-muted">
                  {t(TYPE_INFO[type as ItemType].highRisk ? "highRisk" : "standardRisk")}
                </p>
              </div>
            </>
          ) : (
            <p className="rounded-control bg-canvas p-3 text-xs text-muted">{t("pick")}</p>
          )}
          <FieldError id="new-draft-error">{state.error}</FieldError>
          <div className="flex gap-2">
            <Button type="submit" loading={pending} className="flex-1">
              {t("create")}
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
            <Link href="/submissions" className={buttonClasses("secondary")}>
              {t("cancel")}
            </Link>
          </div>
          <p className="text-center text-xs text-muted">{t("onlyYou")}</p>
        </div>
        <div className="flex gap-3 rounded-panel border border-hairline bg-surface p-4">
          <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
          <div className="grid gap-1">
            <p className="text-sm font-semibold text-fg">{t("checkedTitle")}</p>
            <p className="text-xs text-muted">{t("checked")}</p>
          </div>
        </div>
      </aside>
    </form>
  );
};
