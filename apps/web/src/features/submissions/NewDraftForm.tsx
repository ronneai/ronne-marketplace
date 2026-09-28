"use client";

import { ITEM_TYPES, NAME_PROBLEM_MESSAGES, nameProblem } from "@ronneai/core";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { createDraftFromForm } from "./actions";
import { HIGH_RISK_NOTE, TYPE_INFO } from "./item-types";
import type { NewDraftState, ScopeOption } from "./types";

const optionClasses =
  "flex cursor-pointer gap-3 rounded-control border border-hairline p-3 has-[:checked]:border-accent has-[:checked]:bg-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus";

/**
 * New item (feature 012): a scope, a name and a type. Creating it writes the type's starter files and
 * opens the editor. `mine` are the item names of your drafts, to warn (not block) about a repeat.
 */
export const NewDraftForm = ({ scopes, mine }: { scopes: ScopeOption[]; mine: string[] }) => {
  const [state, action, pending] = useActionState<NewDraftState, FormData>(createDraftFromForm, {});
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState(scopes.length === 1 ? (scopes[0]?.name ?? "") : "");
  const [typed, setTyped] = useState("");
  const name = typed.trim().toLowerCase();
  const problem = name ? nameProblem(name, "item") : null;
  const itemName = `@${scope || "scope"}/${name || "name"}`;
  const shown = scopes.filter(
    (option) =>
      option.name === scope ||
      option.name.includes(search.trim().toLowerCase().replace(/^@/, "")) ||
      option.description.toLowerCase().includes(search.trim().toLowerCase()),
  );

  if (scopes.length === 0)
    return (
      <Notice kind="info" title="There are no scopes yet.">
        Every item lives in a scope, and root creates them. Ask root to create one, then come back.
      </Notice>
    );

  return (
    <form action={action} className="grid gap-8">
      <fieldset className="grid gap-3">
        <legend className="pb-1 text-sm font-semibold text-fg">Scope</legend>
        <p className="text-xs text-muted">
          Where the item lives. Anyone can propose items in any scope; review is the gate.{" "}
          <Link href="/scopes" className="text-link underline underline-offset-2">
            About scopes
          </Link>
        </p>
        {scopes.length > 6 ? (
          <input
            type="search"
            aria-label="Search scopes"
            placeholder="Search scopes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={inputClasses}
          />
        ) : null}
        <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
          {shown.map((option) => (
            <label key={option.name} className={optionClasses}>
              <input
                type="radio"
                name="scope"
                value={option.name}
                required
                checked={scope === option.name}
                onChange={() => setScope(option.name)}
                className="mt-0.5 size-4 shrink-0 accent-(--accent)"
              />
              <span className="grid min-w-0 gap-0.5">
                <span className="font-mono text-sm text-fg">@{option.name}</span>
                <span className="text-xs text-muted">{option.description}</span>
              </span>
            </label>
          ))}
          {shown.length === 0 ? <p className="text-sm text-muted">No scope matches.</p> : null}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="item-name">Name</Label>
        <input
          id="item-name"
          name="name"
          required
          maxLength={64}
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-describedby="item-name-hint"
          aria-invalid={problem ? true : undefined}
          className={inputClasses}
        />
        <p id="item-name-hint" className="text-xs text-muted">
          {problem ? (
            NAME_PROBLEM_MESSAGES[problem]
          ) : (
            <>
              The item will be <span className="font-mono text-fg">{itemName}</span>. Lowercase
              letters, digits and hyphens.
            </>
          )}
        </p>
        {scope && name && mine.includes(itemName) ? (
          <p className="text-xs text-fg">
            <span className="mr-2 font-mono font-semibold">NOTE:</span>You already have a draft
            named {itemName}. You can still create another.
          </p>
        ) : null}
      </div>

      <fieldset className="grid gap-3">
        <legend className="pb-1 text-sm font-semibold text-fg">Type</legend>
        <p className="text-xs text-muted">
          It can't be changed later: another type means a new item.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ITEM_TYPES.map((type) => (
            <label key={type} className={optionClasses}>
              <input
                type="radio"
                name="type"
                value={type}
                required
                className="mt-0.5 size-4 shrink-0 accent-(--accent)"
              />
              <span className="grid min-w-0 gap-0.5">
                <span className="font-mono text-sm text-fg">{type}</span>
                <span className="text-xs text-muted">{TYPE_INFO[type].description}</span>
                {TYPE_INFO[type].highRisk ? (
                  <span className="text-xs text-fg">
                    <span className="mr-1.5 font-mono font-semibold">RISK:</span>
                    {HIGH_RISK_NOTE}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <FieldError id="new-draft-error">{state.error}</FieldError>
      <div className="flex justify-end gap-2">
        <Link href="/submissions" className={buttonClasses("ghost")}>
          Cancel
        </Link>
        <Button type="submit" loading={pending}>
          Create draft
        </Button>
      </div>
    </form>
  );
};
