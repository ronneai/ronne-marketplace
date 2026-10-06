import { nameProblem, normalizeScopeName } from "@ronneai/core";
import { InvalidScopeDescriptionError, InvalidScopeNameError } from "../exceptions/errors";

/** A scope, the `@name` items live in (feature 010). `name` has no `@`. */
export type Scope = {
  id: string;
  name: string;
  description: string;
  /** The workspace it belongs to (feature 090): `global` unless root chose another. */
  workspace: { id: string; name: string };
  createdBy: { id: string; email: string | null } | null;
  createdAt: Date;
};

export const SCOPE_DESCRIPTION_MAX_LENGTH = 300;

/** What was typed, as a valid scope name, or InvalidScopeNameError naming the rule it broke. */
export const scopeNameFrom = (value: string): string => {
  const name = normalizeScopeName(value);
  const problem = nameProblem(name, "scope");
  if (problem) throw new InvalidScopeNameError(problem);
  return name;
};

export const scopeDescriptionFrom = (value: string): string => {
  const description = value.trim();
  if (description.length === 0 || [...description].length > SCOPE_DESCRIPTION_MAX_LENGTH)
    throw new InvalidScopeDescriptionError();
  return description;
};
