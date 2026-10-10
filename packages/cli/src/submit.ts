import { dependenciesFirst, type ManifestIssue } from "@ronneai/core";
import { type ApiClient, joinUrl } from "./api.js";
import type { Args } from "./cli.js";
import { RmkError, usage } from "./errors.js";
import type { Io } from "./io.js";
import type { Output } from "./output.js";

/**
 * `rmk submit` (feature 052): sends the person's own drafts for review, one, several or all of
 * them. It checks first (`POST /drafts/check`), shows what's ready and what's in the way of the
 * rest, asks, then submits the ready ones (`POST /drafts/submit`). "Ready" is exactly what Submit
 * checks in the web app; nothing is fixed from here. The person's own drafts that a named one
 * depends on are included and go with it, all or none (056, 112), unless `--no-deps`.
 */

type Place = {
  path: string;
  url: string | null;
  name: string;
  type: string;
  status: string;
  /** Its scope's workspace (095); missing from a registry older than workspaces. */
  workspace?: string;
  /** Where to ask to join that workspace, on a `not_a_member` result (095). */
  joinUrl?: string;
};

export type CheckedDraft = {
  id: string;
  result: string;
  ready: boolean;
  issues?: ManifestIssue[];
  /** A dependency draft included for these (056). */
  includedFor?: string[];
  /** The ids of its own dependency drafts in the batch (056): they go with it (112). */
  needs?: string[];
} & Partial<Place>;

export type SubmitResult = {
  id: string;
  result: string;
  revision?: number;
  issues?: ManifestIssue[];
} & Partial<Place>;

type OpenDraft = { id: string; status: string; updatedAt: string };

/** An id as the registry makes them (a ULID), rather than an item name. */
const looksLikeId = (value: string) => /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value);

/**
 * The drafts the person named: ids as they are, and each `@scope/name` as their one open draft of
 * that item (a draft, or one sent back for changes). A name with none is reported; a name with
 * several needs an id, since submitting the wrong one can't be undone from here.
 */
const resolveNames = async (api: ApiClient, refs: readonly string[]) => {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const ref of refs) {
    if (!ref.startsWith("@")) {
      if (!looksLikeId(ref))
        throw usage(`${ref} is neither an item (@scope/name) nor a draft's id.`);
      ids.push(ref);
      continue;
    }
    const { drafts } = await api.get<{ drafts: OpenDraft[] }>(
      `/drafts?name=${encodeURIComponent(ref)}`,
    );
    const open = drafts.filter((d) => d.status === "draft" || d.status === "changes_requested");
    if (open.length === 0) unknown.push(ref);
    else if (open.length > 1)
      throw new RmkError(
        `You have ${open.length} drafts of ${ref}: ${open.map((d) => `${d.id} (changed ${d.updatedAt.slice(0, 16).replace("T", " ")} UTC)`).join(", ")}. Say which by its id.`,
        2,
        "ambiguous",
        { item: ref, drafts: open },
      );
    else if (!ids.includes(open[0]?.id ?? "")) ids.push(open[0]?.id ?? "");
  }
  return { ids, unknown };
};

const label = (draft: Partial<Place> & { id: string }) =>
  draft.name ? `${draft.name}  ${draft.type}  ${draft.url ?? draft.path ?? ""}` : draft.id;

const errorsOf = (issues: readonly ManifestIssue[] = []) =>
  issues.filter((issue) => issue.severity === "error");

/** "@a", "@a and @b", "@a, @b and @c". */
const listed = (names: readonly string[]) =>
  names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/**
 * Which drafts a not-ready one waits for: a draft of this batch it goes with (112) that isn't
 * ready, or one it needs that isn't in the batch. Once they're fixed, Submit takes them with it.
 */
const releaseOrder = (drafts: readonly CheckedDraft[]) => {
  const names = new Set(drafts.flatMap((d) => (d.name ? [d.name] : [])));
  return drafts.flatMap((draft) => {
    if (draft.ready || !draft.name) return [];
    const after = errorsOf(draft.issues)
      .filter((issue) =>
        ["dependency_not_found", "dependency_draft", "group_member_not_ready"].includes(issue.code),
      )
      .map((issue) => [...names].find((name) => issue.message.startsWith(`${name} `)))
      .filter((name): name is string => name !== undefined && name !== draft.name);
    return after.length > 0 ? [{ item: draft.name, after: [...new Set(after)] }] : [];
  });
};

/** The drafts of a batch that need each other (112), by name: each cycle once. */
const togetherIn = (drafts: readonly CheckedDraft[]) => {
  const named = new Map(drafts.flatMap((d) => (d.name ? [[d.id, d.name] as const] : [])));
  return dependenciesFirst(
    drafts.flatMap((d) =>
      d.name
        ? [
            {
              name: d.name,
              dependsOn: (d.needs ?? []).flatMap((id) => {
                const name = named.get(id);
                return name ? [name] : [];
              }),
            },
          ]
        : [],
    ),
  ).groups;
};

/** A not-ready draft and what it waits on (112): fixed, they go in together. */
const waitLine = (step: { item: string; after: string[] }) => {
  const one = step.after.length === 1;
  return `${step.item} waits on ${listed(step.after)}: once ${one ? "it is" : "they are"} ready, rmk submit ${step.item} takes ${one ? "it" : "them"} with it.`;
};

/** One step of an export's order (056, 112): Submit takes the item's own drafts with it. */
export const orderLine = (step: { item: string; after: string[] }) =>
  `rmk submit ${step.item} takes ${listed(step.after)} with it, all or none.`;

/** Items that need each other (112): one line for each cycle. */
export const togetherLine = (names: readonly string[]) =>
  `${listed(names)} need each other: they're submitted and released together.`;

/** What the person reads before saying yes: ready ones, then each other one with why. */
const previewLines = (drafts: readonly CheckedDraft[], unknown: readonly string[]) => {
  const ready = drafts.filter((d) => d.ready && !d.includedFor);
  const included = drafts.filter((d) => d.ready && d.includedFor);
  const other = drafts.filter((d) => !d.ready);
  const lines: string[] = [];
  if (ready.length > 0) {
    lines.push(`Ready to submit (${ready.length}):`);
    for (const draft of ready) lines.push(`  ${label(draft)}`);
  }
  if (included.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`Included, as dependencies, and submitted with them (${included.length}):`);
    for (const draft of included)
      lines.push(`  ${label(draft)}`, `    - for ${draft.includedFor?.join(", ")}`);
  }
  if (other.length + unknown.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`Not ready (${other.length + unknown.length}):`);
    for (const draft of other) {
      lines.push(`  ${label(draft)}`);
      if (draft.result === "not_found") lines.push("    - You have no draft with this id.");
      else if (draft.result === "not_submittable")
        lines.push(`    - It's ${draft.status?.replace("_", " ")}, so it can't be submitted.`);
      else for (const issue of errorsOf(draft.issues)) lines.push(`    - ${issue.message}`);
      if (draft.joinUrl) lines.push(`    - Ask here: ${draft.joinUrl}`);
    }
    for (const name of unknown) lines.push(`  ${name}`, "    - You have no draft of this item.");
  }
  const order = releaseOrder(drafts);
  const together = togetherIn(drafts);
  if (order.length + together.length > 0) {
    lines.push("");
    for (const step of order) lines.push(waitLine(step));
    for (const names of together) lines.push(togetherLine(names));
  }
  return lines;
};

/** What a submit would do (052): each draft checked, names with no draft, and the preview. */
export type SubmitPlan = {
  checked: CheckedDraft[];
  ready: CheckedDraft[];
  /** Not ready, not submittable, not found, and names the person has no draft of. */
  notReady: CheckedDraft[];
  /** With `all`: how many open drafts were left for another run. */
  more: number;
  preview: string[];
  order: { item: string; after: string[] }[];
  /** The drafts that need each other (112), by name: submitted and released together. */
  together: string[][];
};

/**
 * Checks the drafts named (`@scope/name` or ids) or `all` of them, sending nothing for review:
 * `rmk submit` and the MCP server's `check_drafts` both start here.
 */
export const planSubmit = async (
  api: ApiClient,
  selection: { refs: readonly string[] } | { all: true },
  /** Include the person's own dependency drafts (056); `false` is `--no-deps`. */
  dependencies = true,
): Promise<SubmitPlan> => {
  const all = "all" in selection;
  const { ids, unknown } = all ? { ids: [], unknown: [] } : await resolveNames(api, selection.refs);
  const checked =
    all || ids.length > 0
      ? await api.post<{ drafts: CheckedDraft[]; more: number }>("/drafts/check", {
          ...(all ? { all: true } : { ids }),
          ...(dependencies ? {} : { dependencies: false }),
        })
      : { drafts: [], more: 0 };
  // Outside your workspaces (091): where to ask to join, in the web app (094, 095).
  for (const draft of checked.drafts)
    if (draft.result === "not_a_member" && draft.workspace)
      draft.joinUrl = joinUrl(api.registry, draft.workspace);
  const more =
    checked.more > 0
      ? [`${checked.more} more of your drafts weren't looked at: run it again for those.`]
      : [];
  return {
    checked: checked.drafts,
    ready: checked.drafts.filter((d) => d.ready),
    notReady: [
      ...checked.drafts.filter((d) => !d.ready),
      ...unknown.map((name) => ({ id: name, name, result: "not_found", ready: false })),
    ],
    more: checked.more,
    preview: [...previewLines(checked.drafts, unknown), ...more],
    order: releaseOrder(checked.drafts),
    together: togetherIn(checked.drafts),
  };
};

/** Submits the ready drafts of a plan (`POST /drafts/submit`), and splits what went from what didn't. */
export const sendSubmit = async (api: ApiClient, plan: SubmitPlan) => {
  // The check's order, dependencies first; the included ones are named, so none is added again.
  const { results } = await api.post<{ results: SubmitResult[] }>("/drafts/submit", {
    ids: plan.ready.map((d) => d.id),
    dependencies: false,
  });
  for (const result of results)
    if (result.result === "not_a_member" && result.workspace)
      result.joinUrl = joinUrl(api.registry, result.workspace);
  const submitted = results.filter((r) => r.result === "submitted" || r.result === "resubmitted");
  const refusedAtSubmit = results.filter((r) => !submitted.includes(r));
  return {
    submitted,
    refusedAtSubmit,
    notSubmitted: [...refusedAtSubmit, ...plan.notReady],
  };
};

/** The lines that say what happened, for `rmk` and the MCP server alike. */
export const submitLines = (outcome: Awaited<ReturnType<typeof sendSubmit>>, plan: SubmitPlan) => {
  const lines: string[] = [];
  for (const result of outcome.submitted)
    lines.push(
      `${result.name}: ${result.result} for review (revision ${result.revision}) at ${result.url ?? result.path}`,
    );
  for (const result of outcome.refusedAtSubmit) {
    lines.push(`Not submitted: ${label(result)}`);
    for (const issue of errorsOf(result.issues)) lines.push(`  - ${issue.message}`);
    if (result.joinUrl) lines.push(`  - Ask here: ${result.joinUrl}`);
  }
  // Outside your workspaces (091) is nothing to fix in the draft: its line says to ask to join.
  const fixable = plan.notReady.filter((d) => d.result !== "not_a_member");
  if (fixable.length > 0)
    lines.push(
      `Not ready, so not submitted: ${fixable.map((d) => d.name ?? d.id).join(", ")}. Fix them in the web app, then submit again.`,
    );
  return lines;
};

/** `rmk submit [<@scope/name|id>...] [--all] [--no-deps] [--dry-run] [--yes]`. */
export const submitCommand = async (io: Io, args: Args, out: Output, api: ApiClient) => {
  const all = args.values.all === true;
  const dryRun = args.values["dry-run"] === true;
  const yes = args.values.yes === true;
  const asking = io.interactive && !out.json;
  if (all && args.positionals.length > 0) throw usage("Name drafts or use --all, not both.");
  if (!all && args.positionals.length === 0)
    throw usage("Say what to submit: rmk submit <@scope/name|id>..., or rmk submit --all");
  if (!asking && !dryRun && !yes)
    throw usage("Without a terminal to ask, add --yes to submit (after checking with --dry-run).");

  const plan = await planSubmit(
    api,
    all ? { all: true } : { refs: args.positionals },
    args.values["no-deps"] !== true,
  );
  out.set("registry", api.registry);
  out.set("checked", plan.checked);
  // Drafts that need each other (112): they go in together.
  if (plan.together.length > 0) out.set("together", plan.together);
  if (plan.checked.length === 0 && plan.notReady.length === 0) {
    out.set("submitted", []);
    out.set("notSubmitted", []);
    out.say("You have no drafts to submit.");
    return;
  }
  if (dryRun || plan.ready.length === 0) {
    out.set("submitted", []);
    out.set("notSubmitted", plan.notReady);
    for (const line of plan.preview) out.say(line);
    if (dryRun) {
      out.say("Dry run: nothing was submitted.");
      return;
    }
    throw new RmkError(
      "Nothing is ready to submit: fix the drafts above in the web app first.",
      1,
      "nothing_ready",
    );
  }
  if (!yes) {
    const count = plan.ready.length;
    const answer = await io.prompt(
      `${plan.preview.join("\n")}\n\nSubmit ${count} draft${count === 1 ? "" : "s"} for review? Reviewers see them; you can withdraw one until it's released. [y/N] `,
    );
    if (!/^y(es)?$/i.test(answer.trim())) {
      out.set("submitted", []);
      out.set("notSubmitted", []);
      out.say("Nothing submitted.");
      return;
    }
  }

  const outcome = await sendSubmit(api, plan);
  out.set("submitted", outcome.submitted);
  out.set("notSubmitted", outcome.notSubmitted);
  for (const line of submitLines(outcome, plan)) out.say(line);
  if (outcome.notSubmitted.length > 0)
    throw new RmkError(
      `${outcome.notSubmitted.length} of ${outcome.submitted.length + outcome.notSubmitted.length} weren't submitted.`,
      1,
      "not_all_submitted",
    );
};
