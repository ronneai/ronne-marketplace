import type { ManifestIssue } from "@ronneai/core";
import type { ApiClient } from "./api.js";
import type { Args } from "./cli.js";
import { RmkError, usage } from "./errors.js";
import type { Io } from "./io.js";
import type { Output } from "./output.js";

/**
 * `rmk submit` (feature 052): sends the person's own drafts for review, one, several or all of
 * them. It checks first (`POST /drafts/check`), shows what's ready and what's in the way of the
 * rest, asks, then submits the ready ones (`POST /drafts/submit`). "Ready" is exactly what Submit
 * checks in the web app; nothing is fixed from here.
 */

type Place = { path: string; url: string | null; name: string; type: string; status: string };

export type CheckedDraft = {
  id: string;
  result: string;
  ready: boolean;
  issues?: ManifestIssue[];
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

/**
 * Which ready drafts must be released before a not-ready one can go (041's order): a not-ready
 * draft whose only trouble is a dependency on another draft in this batch.
 */
const releaseOrder = (drafts: readonly CheckedDraft[]) => {
  const names = new Set(drafts.flatMap((d) => (d.name ? [d.name] : [])));
  return drafts.flatMap((draft) => {
    if (draft.ready || !draft.name) return [];
    const after = errorsOf(draft.issues)
      .filter((issue) => issue.code === "dependency_not_found")
      .map((issue) => [...names].find((name) => issue.message.startsWith(`${name} `)))
      .filter((name): name is string => name !== undefined);
    return after.length > 0 ? [{ item: draft.name, after }] : [];
  });
};

/** What the person reads before saying yes: ready ones, then each other one with why. */
const previewLines = (drafts: readonly CheckedDraft[], unknown: readonly string[]) => {
  const ready = drafts.filter((d) => d.ready);
  const other = drafts.filter((d) => !d.ready);
  const lines: string[] = [];
  if (ready.length > 0) {
    lines.push(`Ready to submit (${ready.length}):`);
    for (const draft of ready) lines.push(`  ${label(draft)}`);
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
    }
    for (const name of unknown) lines.push(`  ${name}`, "    - You have no draft of this item.");
  }
  const order = releaseOrder(drafts);
  if (order.length > 0) {
    lines.push("");
    for (const step of order)
      lines.push(
        `Submit and release ${step.after.join(" and ")} first; then ${step.item} can be submitted.`,
      );
  }
  return lines;
};

/** `rmk submit [<@scope/name|id>...] [--all] [--dry-run] [--yes]`. */
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

  const { ids, unknown } = all
    ? { ids: [], unknown: [] }
    : await resolveNames(api, args.positionals);
  const checked =
    all || ids.length > 0
      ? await api.post<{ drafts: CheckedDraft[]; more: number }>(
          "/drafts/check",
          all ? { all: true } : { ids },
        )
      : { drafts: [], more: 0 };
  const ready = checked.drafts.filter((d) => d.ready);
  const notReady = [
    ...checked.drafts.filter((d) => !d.ready),
    ...unknown.map((name) => ({ id: name, name, result: "not_found", ready: false })),
  ];
  out.set("registry", api.registry);
  out.set("checked", checked.drafts);
  const preview = previewLines(checked.drafts, unknown);
  const more =
    checked.more > 0
      ? [`${checked.more} more of your drafts weren't looked at: run rmk submit --all again after.`]
      : [];

  if (checked.drafts.length === 0 && unknown.length === 0) {
    out.set("submitted", []);
    out.set("notSubmitted", []);
    out.say("You have no drafts to submit.");
    return;
  }
  if (dryRun) {
    out.set("submitted", []);
    out.set("notSubmitted", notReady);
    for (const line of [...preview, ...more]) out.say(line);
    out.say("Dry run: nothing was submitted.");
    return;
  }
  if (ready.length === 0) {
    out.set("submitted", []);
    out.set("notSubmitted", notReady);
    for (const line of [...preview, ...more]) out.say(line);
    throw new RmkError(
      "Nothing is ready to submit: fix the drafts above in the web app first.",
      1,
      "nothing_ready",
    );
  }
  if (!yes) {
    const answer = await io.prompt(
      `${[...preview, ...more].join("\n")}\n\nSubmit ${ready.length} draft${ready.length === 1 ? "" : "s"} for review? Reviewers see them; you can withdraw one until it's approved. [y/N] `,
    );
    if (!/^y(es)?$/i.test(answer.trim())) {
      out.set("submitted", []);
      out.set("notSubmitted", []);
      out.say("Nothing submitted.");
      return;
    }
  }

  const { results } = await api.post<{ results: SubmitResult[] }>("/drafts/submit", {
    ids: ready.map((d) => d.id),
  });
  const submitted = results.filter((r) => r.result === "submitted" || r.result === "resubmitted");
  const refused = [...results.filter((r) => !submitted.includes(r)), ...notReady];
  out.set("submitted", submitted);
  out.set("notSubmitted", refused);
  for (const result of submitted)
    out.say(
      `${result.name}: ${result.result} for review (revision ${result.revision}) at ${result.url ?? result.path}`,
    );
  for (const result of results.filter((r) => !submitted.includes(r))) {
    out.say(`Not submitted: ${label(result)}`);
    for (const issue of errorsOf(result.issues)) out.say(`  - ${issue.message}`);
  }
  if (notReady.length > 0)
    out.say(
      `Not ready, so not submitted: ${notReady.map((d) => d.name ?? d.id).join(", ")}. Fix them in the web app, then run rmk submit again.`,
    );
  for (const line of more) out.say(line);
  if (refused.length > 0)
    throw new RmkError(
      `${refused.length} of ${results.length + notReady.length} weren't submitted.`,
      1,
      "not_all_submitted",
    );
};
