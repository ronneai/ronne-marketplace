import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dependenciesFirst, formatBytes, type ManifestIssue } from "@ronneai/core";
import { givenDescription } from "@ronneai/core/read";
import type { ApiClient } from "./api.js";
import type { Args } from "./cli.js";
import { RmkError, usage } from "./errors.js";
import {
  discoverLocalItems,
  EXPORT_TOOLS,
  EXPORT_TYPES,
  type ExportedItem,
  type ExportPlan,
  type ExportRequest,
  type ExportTool,
  type ExportType,
  fetchScopes,
  fromTool,
  type LocalItem,
  mcpConfigs,
  type PlannedItem,
  planExport,
  type Scopes,
  type SkipReason,
  uploadExport,
} from "./export.js";
import type { Finding } from "./export-dependencies.js";
import { scopeOf } from "./install.js";
import type { Io } from "./io.js";
import type { Output } from "./output.js";
import { itemPath } from "./registry-commands.js";
import { orderLine, togetherLine } from "./submit.js";

/**
 * `rmk export` (feature 038): the terminal around `planExport` and `uploadExport`. rmk prints only
 * when a command ends, so everything a person must see before answering is in the question itself.
 */

const str = (value: string | boolean | string[] | undefined) =>
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

/** A value as the preview shows it: short, on one line. */
const shown = (value: unknown) => {
  const text =
    value === undefined ? "(none)" : typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
};

/** What a proposal changes against its base (042), file by file and field by field. */
const proposalChanges = (changes: NonNullable<PlannedItem["proposal"]>["changes"]): string[] => {
  const lines = ["  Changes:"];
  for (const path of changes.added) lines.push(`    + ${path}`);
  for (const path of changes.removed) lines.push(`    - ${path}`);
  for (const path of changes.changed) lines.push(`    ~ ${path}`);
  for (const field of changes.fields)
    lines.push(`    ~ ronne.yaml ${field.field}: ${shown(field.from)} → ${shown(field.to)}`);
  return lines;
};

/** Where a description came from (053), as the preview says it; given text is the caller's. */
const DESCRIPTION_ORIGIN: Partial<Record<PlannedItem["description"]["origin"], string>> = {
  item: "from its files",
  base: "from the version it's based on",
  draft: "kept from your draft",
};

const itemPreview = (registry: string, item: PlannedItem, given: string): string[] => {
  const lines = item.proposal
    ? [
        `Proposal to ${item.proposal.item}, from ${item.proposal.baseVersion}  ${item.type}  (from ${item.local})`,
        ...(item.proposal.stale
          ? [
              `  ${item.proposal.stale} is out since ${item.proposal.baseVersion}, so it arrives stale: rebase it in the web app after uploading.`,
            ]
          : []),
        ...proposalChanges(item.proposal.changes),
      ]
    : [
        `${item.name}  ${item.type}  (from ${item.local})${item.asDependency ? "  used by another item" : ""}`,
      ];
  if (item.description.text)
    lines.push(
      `  Description: ${item.description.text}  (${DESCRIPTION_ORIGIN[item.description.origin] ?? given})`,
    );
  if (item.updates)
    lines.push(
      `  Updates your draft ${item.updates.url} (${item.updates.status === "draft" ? "a draft" : "sent back for changes"}, last changed ${item.updates.updatedAt.slice(0, 16).replace("T", " ")} UTC): its files are replaced, including edits made in the web app since. --new-draft makes a separate draft instead.`,
    );
  const depends = Object.entries(item.dependencies);
  if (depends.length > 0) {
    lines.push("  Depends on:");
    for (const [name, range] of depends)
      lines.push(
        `    ${name} ${range}${item.dependsOn.includes(name) ? "  (exported with it)" : "  (already in the registry)"}`,
      );
  }
  lines.push("  Files:");
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
export const previewText = (
  plan: ExportPlan,
  account: string,
  /** Who gave the descriptions that weren't on disk: you, in a terminal; the AI tool, by MCP. */
  given = "you gave it",
): string => {
  const lines = [`Registry: ${plan.registry}, as ${account}`, ""];
  for (const item of plan.items) lines.push(...itemPreview(plan.registry, item, given), "");
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
  dependencies: item.dependencies,
  usedByAnother: item.asDependency,
  proposal: item.proposal ?? null,
  updates: item.updates ?? null,
  description: item.description,
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

/** `--with-deps` or `--no-deps`: what to do with the person's own items an export uses (041). */
const dependenciesOption = (args: Args): "include" | "omit" | undefined => {
  const withDeps = args.values["with-deps"] === true;
  const noDeps = args.values["no-deps"] === true;
  if (withDeps && noDeps) throw usage("Use --with-deps or --no-deps, not both.");
  return withDeps ? "include" : noDeps ? "omit" : undefined;
};

/**
 * Descriptions for items that don't describe themselves (053): `--descriptions <file.json>`, an
 * object from item to text, then each `--describe <item>=<text>` over it.
 */
const descriptionsOption = (io: Io, args: Args): Record<string, string> | undefined => {
  const out: Record<string, string> = {};
  const file = str(args.values.descriptions);
  if (file !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(resolve(io.cwd, file), "utf8"));
    } catch (error) {
      throw usage(`--descriptions ${file} can't be read as JSON: ${(error as Error).message}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw usage(`--descriptions ${file} is a JSON object from item to description.`);
    for (const [item, text] of Object.entries(parsed)) {
      if (typeof text !== "string")
        throw usage(`--descriptions ${file}: ${item}'s description isn't text.`);
      out[item] = text;
    }
  }
  const given = args.values.describe;
  for (const value of Array.isArray(given) ? given : typeof given === "string" ? [given] : []) {
    const at = value.indexOf("=");
    if (at <= 0) throw usage(`--describe takes <item>=<text>, such as --describe style="Tabs."`);
    out[value.slice(0, at).trim()] = value.slice(at + 1);
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

/** `--from`, checked: one of the tools export reads (043). */
const fromOption = (args: Args): ExportTool | undefined => {
  const value = str(args.values.from);
  if (value === undefined) return undefined;
  if (!(EXPORT_TOOLS as readonly string[]).includes(value))
    throw usage(`--from is one of ${EXPORT_TOOLS.join(", ")}.`);
  return value as ExportTool;
};

/** `--type`, checked: one of the types export reads. */
const typeOption = (args: Args): ExportType | undefined => {
  const value = str(args.values.type);
  if (value === undefined) return undefined;
  if (!(EXPORT_TYPES as readonly string[]).includes(value))
    throw usage(`--type is one of ${EXPORT_TYPES.join(", ")}.`);
  return value as ExportType;
};

/** With no items named: what's found (of `--type`), and in a terminal, which to export. */
const chooseItems = async (
  io: Io,
  args: Args,
  out: Output,
): Promise<(string | LocalItem)[] | null> => {
  const scope = scopeOf(str(args.values.scope));
  const type = typeOption(args);
  const from = fromOption(args);
  const found = discoverLocalItems(io, scope).filter(
    (f) => (!type || f.type === type) && fromTool(f, from),
  );
  out.set(
    "found",
    found.map((f) => ({ name: f.name, type: f.type, tool: f.tool, path: f.display })),
  );
  for (const { problem } of mcpConfigs(io, scope)) if (problem) out.say(problem);
  if (found.length === 0) {
    out.say(
      `No ${type ?? "skills, agents, commands, rules or MCP servers"} found in this ${scope === "user" ? "home folder" : "project"}'s AI tool folders${from ? ` for ${from}` : ""}. Give a folder or file: rmk export <path>`,
    );
    return null;
  }
  const list = found.map((f, i) => `  ${i + 1}. ${f.name}  ${f.type}  (${f.display})`);
  if (!io.interactive || out.json) {
    out.say(["Found here:", ...list].join("\n"));
    out.say("Export one with rmk export <name or path>, and --type when a name is taken twice.");
    return null;
  }
  const answer = (
    await io.prompt(
      `${["Found here:", ...list].join("\n")}\nWhich to export? (numbers or names, comma-separated; nothing to stop) `,
    )
  ).trim();
  if (!answer) {
    out.say("Nothing exported.");
    return null;
  }
  return answer.split(",").map((part) => {
    const value = part.trim();
    return (/^\d+$/.test(value) ? found[Number(value) - 1] : undefined) ?? value;
  });
};

/** The order to submit in (041): an item's dependencies go into review first (056). */
export const releaseOrder = (plan: ExportPlan, exported: readonly ExportedItem[]) =>
  plan.items
    .filter((item) => exported.some((e) => e.name === item.name))
    .map((item) => ({
      item: item.name,
      after: item.dependsOn.filter((name) => exported.some((e) => e.name === name)),
    }))
    .filter((step) => step.after.length > 0);

/** The exported items that need each other (112), by name: each cycle once. */
export const togetherOf = (plan: ExportPlan, exported: readonly ExportedItem[]) =>
  dependenciesFirst(
    plan.items
      .filter((item) => exported.some((e) => e.name === item.name))
      .map((item) => ({ name: item.name, dependsOn: item.dependsOn })),
  ).groups;

/** What `rmk export` says about the order once it's uploaded (056, 112). */
export const reportOrder = (
  out: Output,
  order: ReturnType<typeof releaseOrder>,
  together: readonly string[][],
) => {
  if (order.length > 0) out.set("order", order);
  if (together.length > 0) out.set("together", together);
  for (const step of order) out.say(orderLine(step));
  for (const names of together) out.say(togetherLine(names));
};

/** The order for what was exported: what Submit takes along, and each cycle (112). */
export const reportExportOrder = (
  out: Output,
  plan: ExportPlan,
  exported: readonly ExportedItem[],
) => reportOrder(out, releaseOrder(plan, exported), togetherOf(plan, exported));

/** A finding as the question lists it. */
const findingLine = (finding: Finding): string => {
  const what = `${finding.reference.kind === "mcp-server" ? "MCP server" : finding.reference.kind} ${finding.reference.name}`;
  switch (finding.status) {
    case "yours":
      return `  - ${what}  (${finding.item?.display}): yours`;
    case "installed":
    case "published":
      return `  - ${what}: ${finding.registry?.name} ${finding.registry?.version} from the registry, declared either way`;
    case "selected":
      return `  - ${what}: already being exported`;
    default:
      return `  - ${what}: can't be declared (${finding.note})`;
  }
};

/** Asks what to do with the person's own items the exported ones use; exporting them is the default. */
const askDependencies = async (
  io: Io,
  findings: readonly Finding[],
): Promise<"include" | "omit" | "cancel"> => {
  const answer = (
    await io.prompt(
      `${[
        "What you're exporting uses:",
        ...findings.map(findingLine),
        "Items of yours need to be in the registry too, or it won't work for whoever installs it.",
        "  1. Export them too (recommended)",
        "  2. Export without them",
        "  3. Cancel",
      ].join("\n")}\nChoice [1]: `,
    )
  ).trim();
  if (answer === "" || answer === "1") return "include";
  if (answer === "2") return "omit";
  return "cancel";
};

const reportExported = (out: Output, exported: ExportedItem[]) => {
  for (const item of exported) {
    out.say(
      item.proposal
        ? `${item.name}: proposal from ${item.proposal.baseVersion} ${item.updated ? "updated" : "created"} at ${item.url}. Once reviewed and approved, it's released as the item's next version.${item.proposal.stale ? ` It's stale (${item.proposal.stale} is out): rebase it first.` : ""}`
        : `${item.name}: draft ${item.updated ? "updated" : "created"} at ${item.url}`,
    );
    const left = [...item.issues, ...item.submitIssues].filter((i) => i.severity === "error");
    if (left.length > 0) {
      out.say("  Fix before submitting:");
      for (const issue of left) out.say(issueLine(issue));
    }
  }
  out.say("Nothing is submitted: open each draft, check it, and submit it in the web app.");
};

/** An item `planExport` needs a description for (053), as `descriptions_required` lists it. */
type NeededDescription = { local: string; name: string; type: string; suggestion: string | null };

/** How many empty answers before an item without a suggestion is left out. */
const DESCRIPTION_TRIES = 3;

/**
 * Asks for each item's description (053): Enter takes the suggestion (its first line) when there is
 * one; text over 300 characters is asked again; three empty answers leave the item out.
 */
const askDescriptions = async (io: Io, items: readonly NeededDescription[]) => {
  const descriptions: Record<string, string> = {};
  const leaveOut: string[] = [];
  for (const item of items) {
    const offer = item.suggestion ? ` [Enter for: "${item.suggestion}"]` : "";
    let answer: string | null = null;
    let note = "";
    for (let tries = 0; answer === null && tries < DESCRIPTION_TRIES; ) {
      const typed = await io.prompt(
        `${note}${item.name} (${item.type}, ${item.local}) has no description.\nIn one sentence, what does it do?${offer} `,
      );
      const given = givenDescription(typed.trim() || (item.suggestion ?? ""));
      note = "";
      if (given.tooLong)
        note = `That was ${given.text?.length} characters; a description can be at most 300.\n`;
      else if (given.text) answer = given.text;
      else tries += 1;
    }
    if (answer === null) leaveOut.push(item.local);
    else descriptions[item.name] = answer;
  }
  return { descriptions, leaveOut };
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
    new: args.values.new === true,
    newDraft: args.values["new-draft"] === true,
    descriptions: descriptionsOption(io, args),
    dependencies: dependenciesOption(args),
    type: typeOption(args),
    from: fromOption(args),
    description: str(args.values.description),
  };
  // In a terminal, the scope, the dependencies and the descriptions are asked for as they come up.
  let plan: ExportPlan | null = null;
  while (!plan) {
    try {
      plan = await planExport(io, api, request);
    } catch (error) {
      if (!(error instanceof RmkError) || !asking) throw error;
      if (error.code === "scope_required")
        request.to = await askScope(io, error.details.scopes as Scopes);
      else if (error.code === "dependencies_required") {
        const choice = await askDependencies(io, error.details.findings as Finding[]);
        if (choice === "cancel") {
          out.set("exported", []);
          out.say("Nothing exported.");
          return;
        }
        request.dependencies = choice;
      } else if (error.code === "descriptions_required") {
        const asked = await askDescriptions(io, error.details.items as NeededDescription[]);
        request.descriptions = { ...request.descriptions, ...asked.descriptions };
        request.leaveOut = [...(request.leaveOut ?? []), ...asked.leaveOut];
      } else throw error;
    }
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
    reportExportOrder(out, plan, exported);
  } catch (error) {
    if (error instanceof RmkError && Array.isArray(error.details.exported)) {
      const exported = error.details.exported as ExportedItem[];
      out.set("exported", exported);
      reportExported(out, exported);
      reportExportOrder(out, plan, exported);
    }
    throw error;
  }
};
