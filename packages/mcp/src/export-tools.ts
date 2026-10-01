import {
  connectRegistry,
  describeLocalItems,
  type ExportedItem,
  type ExportPlan,
  type ExportRequest,
  type ExportTool,
  type Finding,
  fetchScopes,
  fromTool,
  type Io,
  type LocalItem,
  type Ownership,
  planExport,
  previewText,
  RmkError,
  releaseOrder,
  type Scopes,
  uploadExport,
} from "@ronneai/rmk/lib";
import type { PlanStore } from "./plan-tools.js";
import { answer, failure, type ToolAnswer } from "./text.js";

/**
 * Exporting from inside the AI tool (feature 039, MVP §7): 038's pipeline behind three tools. Only
 * items found in the tools' own folders can be exported, never a path, and nothing leaves the
 * machine until the person has seen the plan and approved `export_items`.
 */

export type Origin = "yours" | "installed" | "installed_edited" | "registry_copy" | "rendered";

const originOf = (ownership: Ownership): { origin: Origin; item?: string; version?: string } => {
  switch (ownership.owner) {
    case "local":
      return { origin: "yours" };
    case "installed":
      return {
        origin: ownership.edited ? "installed_edited" : "installed",
        item: ownership.item,
        version: ownership.version,
      };
    case "registry_copy":
      return {
        origin: "registry_copy",
        ...(ownership.item ? { item: ownership.item } : {}),
        version: ownership.version,
      };
    case "rendered":
      return { origin: "rendered", item: ownership.item, version: ownership.version };
  }
};

const ORIGIN_WORDS: Record<Origin, string> = {
  yours: "yours",
  installed: "installed",
  installed_edited: "installed and edited",
  registry_copy: "a registry copy",
  rendered: "written by rmk",
};

/** The items in the project (or the home folder), and whose each is. Reads no network. */
export const listLocalItems = async (
  io: Io,
  input: { scope?: "project" | "user"; type?: string; from?: ExportTool },
): Promise<ToolAnswer> => {
  const scope = input.scope ?? "project";
  const found = (await describeLocalItems(io, scope)).filter(
    ({ item }) => (!input.type || item.type === input.type) && fromTool(item, input.from),
  );
  const items = found.map(({ item, ownership }) => ({
    name: item.name,
    type: item.type,
    tool: item.tool,
    folder: item.display,
    ...originOf(ownership),
  }));
  if (items.length === 0)
    return answer(
      [
        `No ${input.type ?? "skills, agents, commands, rules or MCP servers"} found in the AI tool folders${scope === "user" ? " of the home folder" : ""}. Items from the registry are installed with install tools, not exported.`,
      ],
      { scope, items },
    );
  const lines = [
    `Items found${scope === "user" ? " in the home folder" : ""}:`,
    ...items.map(
      (i) =>
        `  ${i.name}  ${i.type}  ${i.tool}  ${i.folder}  ${ORIGIN_WORDS[i.origin]}${i.item ? ` (${i.item}${i.version ? `@${i.version}` : ""})` : ""}`,
    ),
  ];
  if (items.some((i) => i.origin !== "yours"))
    lines.push(
      "Only items marked yours can be exported. To change an installed item, the person proposes a change on its page in the web app.",
    );
  return answer(lines, { scope, items });
};

/** What an export plan keeps until `export_items`: the request, to plan again and compare. */
export type StoredExport = { request: ExportRequest };

const scopesLines = (scopes: Scopes) =>
  scopes.map((s) => `  @${s.name}${s.description ? `  ${s.description}` : ""}`);

/** The answer when the person hasn't chosen a scope: the choices, and no plan to apply. */
const askForScope = (scopes: Scopes, reason: string): ToolAnswer =>
  answer(
    [
      reason,
      ...scopesLines(scopes),
      "Ask the person which scope to export to, then call plan_export again with to. Never choose it yourself.",
    ],
    { needs: ["to"], scopes },
  );

const findingText = (finding: Finding): string => {
  const what = `${finding.reference.kind === "mcp-server" ? "the MCP server" : "the skill"} ${finding.reference.name}`;
  switch (finding.status) {
    case "yours":
      return `  ${what} (${finding.item?.display}): the person's own, not in the registry`;
    case "installed":
    case "published":
      return `  ${what}: ${finding.registry?.name} ${finding.registry?.version}, from the registry; declared either way`;
    case "selected":
      return `  ${what}: already in this export`;
    default:
      return `  ${what}: can't be declared (${finding.note})`;
  }
};

/** The answer when the items use the person's own items and they haven't said what to do. */
const askForDependencies = (findings: Finding[]): ToolAnswer =>
  answer(
    [
      "What's being exported uses:",
      ...findings.map(findingText),
      'Show these to the person and ask whether to export their own items too; recommend it, since without them the item won\'t work for whoever installs it. Then call plan_export again with dependencies: "include" (export them too) or "omit" (without them).',
    ],
    {
      needs: ["dependencies"],
      findings: findings.map((f) => ({
        status: f.status,
        reference: f.reference,
        usedBy: f.usedBy,
        ...(f.item
          ? { item: { name: f.item.name, type: f.item.type, folder: f.item.display } }
          : {}),
        ...(f.registry ? { registry: f.registry } : {}),
        ...(f.note ? { note: f.note } : {}),
      })),
    },
  );

const plannedData = (plan: ExportPlan) =>
  plan.items.map((item) => ({
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
  }));

/**
 * 038's plan for items `list_local_items` found, sending nothing. Only names or folders from that
 * list are taken, never another path, and there's no force. Without `to` it answers the scopes and
 * no `planId`: the scope is the person's choice.
 */
export const planExportTool = async (
  io: Io,
  store: PlanStore<StoredExport>,
  input: {
    items: string[];
    to?: string;
    name?: string;
    scope?: "project" | "user";
    type?: string;
    from?: ExportTool;
    description?: string;
    dependencies?: "include" | "omit";
    new?: boolean;
    newDraft?: boolean;
  },
): Promise<ToolAnswer> => {
  const { api } = connectRegistry(io);
  const scope = input.scope ?? "project";
  const listed = await describeLocalItems(io, scope);
  const chosen: LocalItem[] = [];
  const unknown: string[] = [];
  for (const wanted of input.items) {
    const matches = listed
      .map(({ item }) => item)
      .filter(
        (item) =>
          (item.name === wanted || item.display === wanted) &&
          (!input.type || item.type === input.type) &&
          fromTool(item, input.from),
      );
    if (matches.length === 0) unknown.push(wanted);
    else if (matches.length > 1)
      return failure(
        "ambiguous",
        `${wanted} is more than one item: ${matches.map((m) => `${m.display} (${m.type}, ${m.tool})`).join(", ")}. Say which with type or from, or use the folder or file as list_local_items shows it.`,
      );
    else chosen.push(matches[0] as LocalItem);
  }
  if (unknown.length > 0)
    return failure(
      "not_listed",
      `${unknown.join(", ")} ${unknown.length === 1 ? "isn't" : "aren't"} among the items list_local_items finds${scope === "user" ? " in the home folder" : ""}${input.type ? ` of type ${input.type}` : ""}. Only those can be exported from here; for anything else, the person runs rmk export in a terminal.`,
    );

  if (!input.to) return askForScope(await fetchScopes(api), "Which scope should the drafts go in?");

  const request: ExportRequest = {
    items: chosen,
    to: input.to,
    name: input.name,
    scope,
    force: false,
    ...(input.description ? { description: input.description } : {}),
    ...(input.dependencies ? { dependencies: input.dependencies } : {}),
    ...(input.new ? { new: true } : {}),
    ...(input.newDraft ? { newDraft: true } : {}),
  };
  let plan: ExportPlan;
  try {
    plan = await planExport(io, api, request);
  } catch (error) {
    if (error instanceof RmkError && error.code === "dependencies_required")
      return askForDependencies(error.details.findings as Finding[]);
    if (error instanceof RmkError && error.code === "scope_not_found")
      return {
        ...askForScope(error.details.scopes as Scopes, `${error.message} These are the scopes:`),
        isError: true,
        structuredContent: {
          error: { code: "scope_not_found", message: error.message },
          needs: ["to"],
          scopes: error.details.scopes,
        },
      };
    throw error;
  }

  const me = await api.me();
  const lines = [previewText(plan, me.email).trimEnd()];
  const planId = plan.items.length > 0 ? store.put({ request }, plan.fingerprint) : null;
  if (planId)
    lines.push(
      `To upload ${plan.items.length === 1 ? "it" : "them"} as private drafts, once the person has seen this plan, call export_items with planId "${planId}". It expires in 10 minutes. Nothing is submitted: the person reviews and submits each draft in the web app.`,
    );
  else lines.push("Nothing here can be exported, so there is no plan to upload.");
  return answer(lines, {
    ...(planId ? { planId } : {}),
    registry: plan.registry,
    to: plan.to,
    items: plannedData(plan),
    refused: plan.refused.map((r) => ({ path: r.local, code: r.code, message: r.message })),
  });
};

const draftLines = (exported: ExportedItem[]) =>
  exported.flatMap((item) => {
    const left = [...item.issues, ...item.submitIssues].filter((i) => i.severity === "error");
    return [
      item.proposal
        ? `${item.name}: proposal from ${item.proposal.baseVersion} ${item.updated ? "updated" : "created"} at ${item.url}${item.proposal.stale ? `, stale (${item.proposal.stale} is out): the person rebases it in the web app first` : ""}`
        : `${item.name}: draft ${item.updated ? "updated" : "created"} at ${item.url}`,
      ...left.map((issue) => `  To fix before submitting: ${issue.message}`),
    ];
  });

const orderLines = (order: ReturnType<typeof releaseOrder>) =>
  order.map(
    (step) =>
      `Submit and release ${step.after.join(" and ")} first; then ${step.item} can be submitted.`,
  );

const REMINDER =
  "Nothing is submitted: the person opens each draft, checks it, and submits it in the web app.";

/**
 * Uploads exactly the plan the person saw, once: the folders are planned again, and a plan whose
 * files changed since is refused as stale. One draft per item (037). If one fails, the drafts
 * already uploaded are named; the plan is used up either way.
 */
export const exportItemsTool = async (
  io: Io,
  store: PlanStore<StoredExport>,
  input: { planId: string },
): Promise<ToolAnswer> => {
  const { api } = connectRegistry(io);
  const stored = store.take(input.planId);
  if (!stored)
    return failure(
      "plan_expired",
      "There's no such export plan: plans last 10 minutes and are used once, and install plans aren't export plans. Make a new plan with plan_export.",
    );
  const plan = await planExport(io, api, stored.value.request);
  if (plan.fingerprint !== stored.fingerprint)
    return failure(
      "plan_stale",
      "The files changed since this plan was made. Make a new plan with plan_export and show it to the person.",
    );
  try {
    const exported = await uploadExport(api, plan);
    const order = releaseOrder(plan, exported);
    return answer([...draftLines(exported), ...orderLines(order), REMINDER], {
      exported,
      ...(order.length > 0 ? { order } : {}),
    });
  } catch (error) {
    if (!(error instanceof RmkError) || !Array.isArray(error.details.exported)) throw error;
    const exported = error.details.exported as ExportedItem[];
    const failed = plan.items.slice(exported.length).map((item) => item.name);
    return {
      ...answer(
        [
          ...draftLines(exported),
          `Not uploaded: ${failed.join(", ")}. ${error.message}`,
          "This plan is used up; plan_export again for what's left.",
          ...(exported.length > 0 ? [REMINDER] : []),
        ],
        { exported, error: { code: error.code, message: error.message }, notUploaded: failed },
      ),
      isError: true,
    };
  }
};
