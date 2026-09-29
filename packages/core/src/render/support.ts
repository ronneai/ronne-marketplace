import { isItemType } from "../item-types.js";
import type { Manifest } from "../manifest.js";
import { record } from "./helpers.js";
import { RENDERERS } from "./registry.js";
import type { SupportLevel } from "./types.js";

/**
 * Which AI tools an item works in (feature 026): for every built-in renderer, its level for the
 * item's type, or `off` when the item's manifest turns that tool off. Straight from the renderers,
 * so it's always what `rmk` would do.
 */
export type ToolSupport = SupportLevel | "off";

/** The tools a manifest turns off (`targets.<id>.enabled: false`), sorted; any key counts. */
export const disabledTargets = (manifest: Manifest | Record<string, unknown>): string[] =>
  Object.entries(record((manifest as Record<string, unknown>).targets))
    .filter(([, target]) => record(target).enabled === false)
    .map(([id]) => id)
    .sort();

/**
 * Each renderer's level for a type, with the tools in `disabled` as `off`. A type the tool can't
 * take stays `none` even when turned off: the item couldn't go there either way.
 */
export const supportFor = (
  type: string,
  disabled: readonly string[],
): Record<string, ToolSupport> =>
  Object.fromEntries(
    RENDERERS.map((renderer) => {
      const level: SupportLevel = isItemType(type) ? renderer.supports(type) : "none";
      return [renderer.id, level !== "none" && disabled.includes(renderer.id) ? "off" : level];
    }),
  );

/** `supportFor` from a manifest and its type. */
export const supportOf = (
  manifest: Manifest | Record<string, unknown>,
  type: string,
): Record<string, ToolSupport> => supportFor(type, disabledTargets(manifest));

/** Whether an item installs into a tool: `native` or `degraded`. */
export const installsIn = (level: ToolSupport | undefined): boolean =>
  level === "native" || level === "degraded";
