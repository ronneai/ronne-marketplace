import { formatBytes, type ManifestIssue } from "@ronneai/core";
import type { ApiClient } from "./api.js";
import type { Args } from "./cli.js";
import { RmkError, usage } from "./errors.js";
import {
  discoverLocalItems,
  type ExportedItem,
  type ExportPlan,
  type ExportRequest,
  fetchScopes,
  type PlannedItem,
  planExport,
  type Scopes,
  type SkipReason,
  uploadExport,
} from "./export.js";
import { scopeOf } from "./install.js";
import type { Io } from "./io.js";
import type { Output } from "./output.js";
import { itemPath } from "./registry-commands.js";

/**
 * `rmk export` (feature 038): the terminal around `planExport` and `uploadExport`. rmk prints only
 * when a command ends, so everything a person must see before answering is in the question itself.
 */

const str = (value: string | boolean | undefined) =>
  typeof value === "string" ? value : undefined;

const SKIP_WORDS: Record<SkipReason, string> = {
  not_item: "never part of an item",
  secret_file: "may hold a secret",
  link: "a symbolic link, never followed",
};

const issueLine = (issue: ManifestIssue) =>
  `    - ${issue.message}${issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ""})` : ""}`;

const indent = (text: string, by: string) =>
  text
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => `${by}${line}`)
    .join("\n");

const itemPreview = (registry: string, item: PlannedItem): string[] => {
  const lines = [`${item.name}  (from ${item.local})`, "  Files:"];
  for (const file of item.files)
    lines.push(
      `    ${file.path}  ${formatBytes(file.bytes.length)}${file.executable ? "  executable" : ""}`,
    );
  if (item.skipped.length > 0) {
    lines.push("  Left out:");
    for (const skip of item.skipped) lines.push(`    ${skip.path}  (${SKIP_WORDS[skip.reason]})`);
  }
  lines.push("  ronne.yaml:", indent(item.manifestText, "    "));
  if (item.warnings.length > 0) {
    lines.push("  Warnings:");
    for (const warning of item.warnings) lines.push(`    - ${warning.message}`);
  }
  const errors = item.issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    lines.push("  To fix in the web app before submitting:");
    for (const issue of errors) lines.push(issueLine(issue));
  }
  if (item.published)
    lines.push(
      `  ${item.name} is already published, so Submit will refuse this draft. To change that item, propose a change on its page: ${registry}${itemPath(item.name)}`,
    );
  return lines;
};

/** The whole plan, as the person reads it before saying yes. */
export const previewText = (plan: ExportPlan, account: string): string => {
  const lines = [`Registry: ${plan.registry}, as ${account}`, ""];
  for (const item of plan.items) lines.push(...itemPreview(plan.registry, item), "");
  if (plan.refused.length > 0) {
    lines.push("Not exported:");
    for (const refused of plan.refused) lines.push(`  ${refused.local}: ${refused.message}`);
    lines.push("");
  }
  return lines.join("\n");
};

const plannedJson = (item: PlannedItem) => ({
  local: item.local,
  name: item.name,
  type: item.type,
  files: item.files.map((f) => ({
    path: f.path,
    size: f.bytes.length,
    executable: f.executable ?? false,
  })),
  manifest: item.manifestText,
  skipped: item.skipped,
  warnings: item.warnings,
  issues: item.issues,
  published: item.published,
});

const refusedJson = (plan: ExportPlan) =>
  plan.refused.map((r) => ({ path: r.local, code: r.code, message: r.message }));

const scopeList = (scopes: Scopes) =>
  scopes.map((s, i) => `  ${i + 1}. @${s.name}${s.description ? `  ${s.description}` : ""}`);

/** Asks which scope, by number or name, listing them; never picks one itself. */
const askScope = async (io: Io, scopes: Scopes): Promise<string> => {
  const answer = (
    await io.prompt(
      `${["Which scope should the drafts go in?", ...scopeList(scopes)].join("\n")}\nScope (number or name): `,
    )
  ).trim();
  const byNumber = /^\d+$/.test(answer) ? scopes[Number(answer) - 1] : undefined;
  const chosen = byNumber?.name ?? answer.replace(/^@/, "");
  if (!chosen || !scopes.some((s) => s.name === chosen))
    throw usage(`${answer || "Nothing"} isn't one of the scopes. Run it again, or use --to.`);
  return chosen;
};

/** With no items named: the skills found, and in a terminal, which to export. */
const chooseItems = async (io: Io, args: Args, out: Output): Promise<string[] | null> => {
  const found = discoverLocalItems(io, scopeOf(str(args.values.scope)));
  out.set(
    "found",
    found.map((f) => ({ name: f.name, type: f.type, path: f.display })),
  );
  if (found.length === 0) {
    out.say(
      "No skills found in .claude/skills/ or .agents/skills/. Give a folder: rmk export <folder>",
    );
    return null;
  }
  const list = found.map((f, i) => `  ${i + 1}. ${f.name}  (${f.display})`);
  if (!io.interactive || out.json) {
    out.say(["Skills found here:", ...list].join("\n"));
    out.say("Export one with rmk export <name or folder>.");
    return null;
  }
  const answer = (
    await io.prompt(
      `${["Skills found here:", ...list].join("\n")}\nWhich to export? (numbers or names, comma-separated; nothing to stop) `,
    )
  ).trim();
  if (!answer) {
    out.say("Nothing exported.");
    return null;
  }
  return answer.split(",").map((part) => {
    const value = part.trim();
    const byNumber = /^\d+$/.test(value) ? found[Number(value) - 1] : undefined;
    return byNumber ? byNumber.display : value;
  });
};

const reportExported = (out: Output, exported: ExportedItem[]) => {
  for (const item of exported) {
    out.say(`${item.name}: draft created at ${item.url}`);
    const left = [...item.issues, ...item.submitIssues].filter((i) => i.severity === "error");
    if (left.length > 0) {
      out.say("  Fix before submitting:");
      for (const issue of left) out.say(issueLine(issue));
    }
  }
  out.say("Nothing is submitted: open each draft, check it, and submit it in the web app.");
};

export const exportCommand = async (io: Io, args: Args, out: Output, api: ApiClient) => {
  const dryRun = args.values["dry-run"] === true;
  const yes = args.values.yes === true;
  const asking = io.interactive && !out.json;
  const me = await api.me();
  out.set("registry", api.registry);

  const items = args.positionals.length > 0 ? args.positionals : await chooseItems(io, args, out);
  if (!items) return;
  if (!asking && !dryRun && !yes)
    throw new RmkError(
      "Without a terminal to ask, add --yes to upload (after checking with --dry-run).",
      2,
      "usage",
      { scopes: await fetchScopes(api) },
    );

  const request: ExportRequest = {
    items,
    to: str(args.values.to),
    name: str(args.values.name),
    scope: str(args.values.scope),
    force: args.values.force === true,
  };
  let plan: ExportPlan;
  try {
    plan = await planExport(io, api, request);
  } catch (error) {
    if (!(error instanceof RmkError) || error.code !== "scope_required" || !asking) throw error;
    request.to = await askScope(io, error.details.scopes as Scopes);
    plan = await planExport(io, api, request);
  }
  out.set("to", plan.to);
  out.set("refused", refusedJson(plan));
  const preview = previewText(plan, me.email);

  if (plan.items.length === 0) {
    out.say(preview.trimEnd());
    throw new RmkError("Nothing to export.", 1, "nothing_to_export");
  }
  if (dryRun) {
    out.set("planned", plan.items.map(plannedJson));
    out.set("exported", []);
    out.say(preview.trimEnd());
    out.say("Dry run: nothing was uploaded.");
    return;
  }
  if (!yes) {
    const answer = await io.prompt(
      `${preview}Upload ${plan.items.length} item${plan.items.length === 1 ? "" : "s"} as drafts to ${plan.registry}? [y/N] `,
    );
    if (!/^y(es)?$/i.test(answer.trim())) {
      out.set("exported", []);
      out.say("Nothing uploaded.");
      return;
    }
  }
  for (const refused of plan.refused) out.say(`Not exported: ${refused.local}: ${refused.message}`);
  try {
    const exported = await uploadExport(api, plan);
    out.set("exported", exported);
    reportExported(out, exported);
  } catch (error) {
    if (error instanceof RmkError && Array.isArray(error.details.exported)) {
      out.set("exported", error.details.exported);
      reportExported(out, error.details.exported as ExportedItem[]);
    }
    throw error;
  }
};
