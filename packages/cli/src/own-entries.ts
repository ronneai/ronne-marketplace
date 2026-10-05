import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  applyPlan,
  mustStayInside,
  type Plan,
  planChanges,
  readState,
  type Wanted,
  writeState,
} from "./apply.js";
import { RmkError } from "./errors.js";
import { places, type Scope } from "./install.js";
import type { Output } from "./output.js";

/**
 * Writes the changes of a setup command that isn't an item (`rmk mcp-setup`, 027; `rmk
 * plugin-setup`, 077) through the applier. Only the command's own state entries, under `item`, are
 * planned: every item's stay as they are. A conflict (an entry the person made, or edited since)
 * writes nothing, says where, and fails with exit 3, unless `force`.
 */
export const applyOwnEntries = async (
  scope: Scope,
  io: Parameters<typeof places>[0],
  item: string,
  wanted: Wanted[],
  { force, out, what }: { force: boolean; out: Output; what: string },
): Promise<Plan> => {
  const { root, state: statePath } = places(io, scope);
  const all = readState(statePath);
  const own = { version: 1 as const, entries: all.entries.filter((e) => e.item === item) };
  const others = all.entries.filter((e) => e.item !== item);
  const plan = await planChanges(root, own, wanted, { force, contain: scope === "project" });
  out.set("conflicts", plan.conflicts);
  if (plan.conflicts.length) {
    for (const c of plan.conflicts)
      out.say(
        `  ${c.path}${c.key ? ` (${Array.isArray(c.key) ? c.key.join(".") : c.key})` : ""}: ${c.reason === "unmanaged" ? "not written by rmk" : "edited since rmk wrote it"}`,
      );
    throw new RmkError(
      `Nothing was written: ${what} there isn't rmk's. Move it aside, or run again with --force.`,
      3,
      "conflicts",
      { conflicts: plan.conflicts },
    );
  }
  if (scope === "project") mustStayInside(root, ".rmk/state.json", "It would write");
  const next = applyPlan(root, own, plan, { contain: scope === "project" });
  next.entries.push(...others);
  mkdirSync(join(statePath, ".."), { recursive: true });
  writeState(statePath, next);
  return plan;
};
