import {
  connectRegistry,
  describeLocalItems,
  type ExportPlan,
  type ExportRequest,
  fetchScopes,
  type Io,
  type Ownership,
  planExport,
  previewText,
  RmkError,
  type Scopes,
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
  input: { scope?: "project" | "user"; type?: string },
): Promise<ToolAnswer> => {
  const scope = input.scope ?? "project";
  const found = (await describeLocalItems(io, scope)).filter(
    ({ item }) => !input.type || item.type === input.type,
  );
  const items = found.map(({ item, ownership }) => ({
    name: item.name,
    type: item.type,
    folder: item.display,
    ...originOf(ownership),
  }));
  if (items.length === 0)
    return answer(
      [
        `No skills found in .claude/skills/ or .agents/skills/${scope === "user" ? " in the home folder" : ""}. Items from the registry are installed with install tools, not exported.`,
      ],
      { scope, items },
    );
  const lines = [
    `Items found${scope === "user" ? " in the home folder" : ""}:`,
    ...items.map(
      (i) =>
        `  ${i.name}  ${i.type}  ${i.folder}  ${ORIGIN_WORDS[i.origin]}${i.item ? ` (${i.item}${i.version ? `@${i.version}` : ""})` : ""}`,
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
  }));

/**
 * 038's plan for items `list_local_items` found, sending nothing. Only names or folders from that
 * list are taken, never another path, and there's no force. Without `to` it answers the scopes and
 * no `planId`: the scope is the person's choice.
 */
export const planExportTool = async (
  io: Io,
  store: PlanStore<StoredExport>,
  input: { items: string[]; to?: string; name?: string; scope?: "project" | "user" },
): Promise<ToolAnswer> => {
  const scope = input.scope ?? "project";
  const listed = await describeLocalItems(io, scope);
  const unknown = input.items.filter(
    (wanted) => !listed.some(({ item }) => item.name === wanted || item.display === wanted),
  );
  if (unknown.length > 0)
    return failure(
      "not_listed",
      `${unknown.join(", ")} ${unknown.length === 1 ? "isn't" : "aren't"} among the items list_local_items finds${scope === "user" ? " in the home folder" : ""}. Only those can be exported from here; for another folder, the person runs rmk export in a terminal.`,
    );

  const { api } = connectRegistry(io);
  if (!input.to) return askForScope(await fetchScopes(api), "Which scope should the drafts go in?");

  const request: ExportRequest = {
    items: input.items,
    to: input.to,
    name: input.name,
    scope,
    force: false,
  };
  let plan: ExportPlan;
  try {
    plan = await planExport(io, api, request);
  } catch (error) {
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
