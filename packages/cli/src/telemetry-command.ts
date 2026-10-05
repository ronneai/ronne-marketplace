import { readUserConfig, tokenFor, writeUserConfig } from "./config.js";
import { usage } from "./errors.js";
import { type Io, nowOf } from "./io.js";
import type { Output } from "./output.js";
import {
  clearChoiceQueues,
  flushUsage,
  queuedUsage,
  type ReportingReason,
  refreshPolicy,
  usageSummary,
} from "./telemetry.js";
import { HOOK_FILES, hookedTools, removeUsageHooks, runHook } from "./usage-hooks.js";

/**
 * `rmk telemetry on | off | status | preview | flush` (feature 046). The registry's policy decides
 * first; `on` and `off` are the person's choice where the policy lets them choose.
 */
const REASONS: Record<ReportingReason, string> = {
  "policy unknown": "rmk hasn't learned this registry's usage policy yet",
  "policy off": "this registry doesn't collect usage",
  required: "this registry requires usage reporting",
  "RMK_TELEMETRY=0": "RMK_TELEMETRY=0 is set",
  "you turned it off": "you turned it off (rmk telemetry on to turn it back on)",
  "on by default": "this registry collects usage unless you turn it off (rmk telemetry off)",
};

const POLICY_WORDS = { off: "off", choice: "people choose", required: "required" } as const;

/** Checks the policy of every registry rmk is logged in to, now. */
const refreshAll = async (io: Io) => {
  const config = readUserConfig(io);
  for (const url of Object.keys(config.registries))
    await refreshPolicy(io, url, tokenFor(io, config, url), { force: true });
};

const choose = (io: Io, enabled: boolean) => {
  const config = readUserConfig(io);
  config.telemetry = { enabled, decidedAt: nowOf(io).toISOString() };
  writeUserConfig(io, config);
};

const status = (io: Io, out: Output) => {
  const registries = usageSummary(io);
  const hooks = hookedTools(io);
  out.set("registries", registries);
  out.set("hooks", hooks);
  if (registries.length === 0) {
    out.say("rmk isn't logged in to any registry, so it reports usage nowhere.");
    return;
  }
  for (const r of registries) {
    const policy = r.policy ? POLICY_WORDS[r.policy] : "unknown";
    out.say(
      `${r.registry}: ${r.reporting ? "reporting" : "not reporting"} (policy: ${policy}; ${REASONS[r.reason]}).`,
    );
    if (r.queued || r.lastSent)
      out.say(
        `  ${r.queued} line${r.queued === 1 ? "" : "s"} queued${r.lastSent ? `; last sent ${r.lastSent.slice(0, 16).replace("T", " ")} UTC` : ""}.`,
      );
  }
  out.say(
    hooks.length
      ? `Usage hook in: ${hooks.map((tool) => `~/${HOOK_FILES[tool]}`).join(", ")}.`
      : "No usage hook is installed; rmk install adds one where it reports.",
  );
};

export const telemetryCommand = async (
  io: Io,
  args: { positionals: string[]; values?: Record<string, string | boolean | string[] | undefined> },
  out: Output,
): Promise<void> => {
  const [sub = "status", tool = ""] = args.positionals;
  if (sub === "hook") {
    // Run by an AI tool: prints nothing, whatever happens.
    await runHook(io, tool);
    return;
  }
  if (sub === "status") {
    await refreshAll(io);
    status(io, out);
    return;
  }
  if (sub === "on") {
    choose(io, true);
    await refreshAll(io);
    out.say("Usage reporting is on wherever the registry's policy lets you choose.");
    status(io, out);
    return;
  }
  if (sub === "off") {
    choose(io, false);
    await refreshAll(io);
    clearChoiceQueues(io);
    out.say("Usage reporting is off wherever the registry's policy lets you choose.");
    const required = usageSummary(io).filter((s) => s.policy === "required");
    for (const r of required)
      out.say(`${r.registry} requires usage reporting, so rmk keeps reporting to it.`);
    if (required.length === 0 && hookedTools(io).length) {
      const result = await removeUsageHooks(io, args.values?.force === true);
      if (result.conflicts.length)
        out.say(
          `rmk's usage hook stays in ${result.conflicts.join(", ")}: it changed since rmk wrote it. Run again with --force to remove it.`,
        );
      else for (const path of result.removed) out.say(`Removed rmk's usage hook from ~/${path}.`);
    }
    status(io, out);
    return;
  }
  if (sub === "preview") {
    const queues = queuedUsage(io);
    out.set("queues", queues);
    if (queues.length === 0) out.say("Nothing is queued.");
    for (const queue of queues) {
      out.say(`POST ${queue.registry}/api/v1/usage`);
      out.say(JSON.stringify({ events: queue.events }, null, 2));
    }
    return;
  }
  if (sub === "flush") {
    const results = await flushUsage(io);
    out.set("results", results);
    if (results.length === 0) out.say("Nothing to send.");
    for (const r of results)
      out.say(
        r.outcome === "sent"
          ? `${r.registry}: sent ${r.sent} line${r.sent === 1 ? "" : "s"}${r.kept ? `, ${r.kept} left for later` : ""}.`
          : r.outcome === "kept"
            ? `${r.registry}: kept ${r.kept} line${r.kept === 1 ? "" : "s"} for later (${r.message}).`
            : `${r.registry}: dropped the queue (${r.message}).`,
      );
    return;
  }
  throw usage("rmk telemetry on | off | status | preview | flush");
};
