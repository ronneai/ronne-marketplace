import { randomBytes } from "node:crypto";
import {
  applyOperation,
  connectRegistry,
  type Io,
  itemPath,
  type Operation,
  type OperationKind,
  operationFingerprint,
  output,
  planOperation,
  RmkError,
  report,
} from "@ronneai/rmk/lib";
import { answer, failure, type ToolAnswer } from "./text.js";

/**
 * Plan, then apply (MVP §7, feature 027). A `plan_*` tool works out exactly what `rmk` would do and
 * writes nothing; the person sees it in the conversation, and `apply_plan` writes that plan and
 * nothing else. Plans live in this server's memory for ten minutes, and one whose files changed
 * since is refused as stale.
 */
export const PLAN_TTL_MS = 10 * 60 * 1000;

type StoredPlan = { operation: Operation; fingerprint: string; expiresAt: number };

export const planStore = (now: () => number) => {
  const plans = new Map<string, StoredPlan>();
  const sweep = () => {
    for (const [id, plan] of plans) if (plan.expiresAt <= now()) plans.delete(id);
  };
  return {
    put: (operation: Operation, fingerprint: string) => {
      sweep();
      const id = randomBytes(9).toString("base64url");
      plans.set(id, { operation, fingerprint, expiresAt: now() + PLAN_TTL_MS });
      return id;
    },
    /** The plan, once: applying or refusing it forgets it. */
    take: (id: string) => {
      const plan = plans.get(id);
      plans.delete(id);
      return plan && plan.expiresAt > now() ? plan : null;
    },
  };
};

export type PlanStore = ReturnType<typeof planStore>;

type PlanInput = { items?: string[]; targets?: string[]; scope?: "project" | "user" };

const VERB: Record<OperationKind, string> = {
  install: "install",
  update: "update",
  remove: "remove",
};

/** The risk flags of each item the plan brings in or changes, for the person to see first. */
const newRisks = async (io: Io, operation: Operation) => {
  const { api } = connectRegistry(io);
  const risks: { item: string; version: string; message: string }[] = [];
  for (const [name, item] of Object.entries(operation.resolution.items)) {
    if (operation.lockedBefore[name] === item.version) continue;
    const detail = await api.get<{ riskFlags: { message: string }[] }>(
      `${itemPath(name)}/${encodeURIComponent(item.version)}`,
    );
    for (const flag of detail.riskFlags)
      risks.push({ item: name, version: item.version, message: flag.message });
  }
  return risks;
};

const keyOf = (key: string[] | string | undefined) =>
  key === undefined ? "" : ` (${Array.isArray(key) ? key.join(".") : key})`;

export const planTool = async (
  io: Io,
  store: PlanStore,
  kind: OperationKind,
  input: PlanInput,
): Promise<ToolAnswer> => {
  const { api } = connectRegistry(io);
  let operation: Operation;
  try {
    operation = await planOperation(io, api, {
      kind,
      items: input.items ?? [],
      target: input.targets?.length ? input.targets.join(",") : undefined,
      scope: input.scope,
    });
  } catch (error) {
    if (error instanceof RmkError && error.code === "no_target")
      return failure(
        "no_target",
        `${error.message.replace(/: say which with --target.*$/, ".")} Pass targets, such as ["claude-code"].`,
      );
    throw error;
  }
  const { plan, resolution, rendered } = operation;
  const writes = plan.writes.map((w) => ({
    item: w.wanted.item,
    version: w.wanted.version,
    kind: w.entry.kind,
    path: w.entry.path,
    key: w.entry.key,
  }));
  const removes = plan.removes.map((e) => ({
    item: e.item,
    kind: e.kind,
    path: e.path,
    key: e.key,
  }));
  const warnings = rendered.flatMap((r) => r.warnings.map((w) => ({ item: r.item, ...w })));
  const risks = await newRisks(io, operation);
  const missingEnv = [...new Set(rendered.flatMap((r) => r.envNames))]
    .filter((name) => !io.env[name])
    .sort();
  const items = Object.entries(resolution.items)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, item]) => ({
      name,
      version: item.version,
      before: operation.lockedBefore[name] ?? null,
    }));
  const conflicts = plan.conflicts;
  const planId = store.put(operation, await operationFingerprint(io, operation));

  const lines = [
    `Plan to ${VERB[kind]}${input.items?.length ? ` ${input.items.join(", ")}` : ""} for ${operation.targets.join(", ")}${operation.scope === "user" ? ", in your home folder" : ""}:`,
    ...items.map((i) =>
      i.before === null
        ? `  ${i.name}@${i.version} (new)`
        : i.before === i.version
          ? `  ${i.name}@${i.version}`
          : `  ${i.name}: ${i.before} → ${i.version}`,
    ),
  ];
  const gone = Object.keys(operation.lockedBefore).filter((n) => !(n in resolution.items));
  if (gone.length) lines.push(`  removed: ${gone.sort().join(", ")}`);
  if (writes.length)
    lines.push("Would write:", ...writes.map((w) => `  ${w.path}${keyOf(w.key)} (${w.item})`));
  if (removes.length)
    lines.push("Would remove:", ...removes.map((r) => `  ${r.path}${keyOf(r.key)} (${r.item})`));
  if (!writes.length && !removes.length && !conflicts.length)
    lines.push("Nothing would change on disk.");
  for (const d of resolution.warnings)
    lines.push(`Deprecated: ${d.item}@${d.version}: ${d.message}`);
  for (const w of warnings) lines.push(`Warning: ${w.message}`);
  for (const r of risks) lines.push(`What ${r.item}@${r.version} can do: ${r.message}`);
  if (missingEnv.length)
    lines.push(
      `The MCP servers need these environment variables, not set here: ${missingEnv.join(", ")}.`,
    );
  if (conflicts.length)
    lines.push(
      "This plan can't be applied: these files or settings aren't rmk's, or changed since rmk wrote them.",
      ...conflicts.map(
        (c) =>
          `  ${c.path}${keyOf(c.key)}: ${c.reason === "unmanaged" ? "not written by rmk" : "edited since rmk wrote it"} (${c.item})`,
      ),
      "The person can move them aside and plan again, or run rmk with --force at the terminal.",
      `(Its planId, "${planId}", is refused by apply_plan while the conflicts stand.)`,
    );
  else
    lines.push(
      `To apply it, once the person has seen this plan, call apply_plan with planId "${planId}". It expires in 10 minutes.`,
    );
  return answer(lines, {
    planId,
    kind,
    targets: operation.targets,
    scope: operation.scope,
    items,
    writes,
    removes,
    warnings: warnings.map((w) => ({ item: w.item, code: w.code, message: w.message })),
    deprecated: resolution.warnings,
    risks,
    missingEnv,
    conflicts,
  });
};

export const applyPlanTool = async (
  io: Io,
  store: PlanStore,
  input: { planId: string },
): Promise<ToolAnswer> => {
  const stored = store.take(input.planId);
  if (!stored)
    return failure(
      "plan_expired",
      "There's no such plan: plans last 10 minutes and are applied once. Make a new plan.",
    );
  const conflicts = stored.operation.plan.conflicts.length;
  if (conflicts)
    return failure(
      "conflicts",
      `This plan has ${conflicts} conflict${conflicts === 1 ? "" : "s"}: files or settings rmk didn't write, or that changed since. Move them aside and plan again; --force is only for rmk at the terminal.`,
    );
  if ((await operationFingerprint(io, stored.operation)) !== stored.fingerprint)
    return failure(
      "plan_stale",
      "Something this plan touches changed since it was made (another install, or an edit). Make a new plan.",
    );
  applyOperation(io, stored.operation);
  const out = output(false);
  report(out, stored.operation, io);
  return answer(out.lines, { applied: true, ...out.data });
};
