import { highestMatching, parseItemName, parseManifest } from "@ronneai/core";
import { can } from "../../identity/models/permissions";
import { OPEN_STATUSES } from "../models/status";
import { fileBytes, MANIFEST_PATH, type Submission } from "../models/submission";
import type { RegistryLookup } from "../repositories/registry-lookup";
import type { SubmissionRepository } from "../repositories/submission-repository";
import type { SubmissionActor, SubmissionDeps } from "./submissions";

/**
 * What a submission waits on (056): each dependency with no matching release, and whether it's on
 * its way (an open submission), not submitted yet, or blocked (rejected or withdrawn, here or
 * further down the chain). Worked out when a page is shown, never stored.
 */
export type DependencyMark =
  | {
      kind: "waits";
      dependency: string;
      status: "submitted" | "changes_requested" | "approved" | "not_submitted";
    }
  | {
      kind: "blocked";
      dependency: string;
      /** What closed: the dependency itself, or the last of `through`. */
      status: "rejected" | "withdrawn";
      /** The chain to the closed one: empty when the dependency itself was rejected or withdrawn. */
      through: string[];
    };

/** How deep a chain is followed: further than any real item's dependencies go. */
const MAX_DEPTH = 8;

/** The marks for one set of dependencies; `seen` stops a cycle (013 refuses those anyway). */
export const marksFor = async (
  registry: RegistryLookup,
  dependencies: Readonly<Record<string, string>>,
  seen: ReadonlySet<string> = new Set(),
): Promise<DependencyMark[]> => {
  const marks: DependencyMark[] = [];
  for (const [dependency, range] of Object.entries(dependencies)) {
    const parsed = parseItemName(dependency);
    if (!parsed || seen.has(dependency)) continue;
    const item = await registry.findItem(parsed.scope, parsed.name);
    if (item) {
      const versions = (await registry.publishedVersions(item.id)).filter((v) => !v.yanked);
      if (
        highestMatching(
          versions.map((v) => v.version),
          range,
        )
      )
        continue;
    }
    const all = await registry.submissionsNamed(parsed.scope, parsed.name);
    const open = all.find((s) => OPEN_STATUSES.includes(s.status));
    if (open) {
      // On its way, unless something it waits on is blocked: then this is blocked too.
      const below =
        seen.size < MAX_DEPTH
          ? await marksFor(registry, open.dependencies, new Set([...seen, dependency]))
          : [];
      const blocked = below.find((mark) => mark.kind === "blocked");
      marks.push(
        blocked?.kind === "blocked"
          ? {
              kind: "blocked",
              dependency,
              status: blocked.status,
              through: [blocked.dependency, ...blocked.through],
            }
          : {
              kind: "waits",
              dependency,
              status: open.status as "submitted" | "changes_requested" | "approved",
            },
      );
      continue;
    }
    // A published item whose range doesn't match is a check's error, not a wait.
    if (item) continue;
    const newest = all[0]?.status;
    marks.push(
      newest === "rejected" || newest === "withdrawn"
        ? { kind: "blocked", dependency, status: newest, through: [] }
        : { kind: "waits", dependency, status: "not_submitted" },
    );
  }
  return marks;
};

/** A submission's dependencies: its saved files while a draft, its latest revision after that. */
export const dependenciesOf = async (
  repo: SubmissionRepository,
  submission: Submission,
): Promise<Record<string, string>> => {
  let files: readonly { path: string; encoding: "utf8" | "base64"; content: string }[] = [];
  if (submission.status === "draft") files = await repo.files(submission.id);
  else {
    const latest = (await repo.revisions(submission.id)).at(-1);
    files = latest ? await repo.revisionFiles(latest.id) : [];
  }
  const manifestFile = files.find((file) => file.path === MANIFEST_PATH);
  const manifest = manifestFile
    ? parseManifest(new TextDecoder().decode(fileBytes(manifestFile))).manifest
    : null;
  return (manifest?.dependencies ?? {}) as Record<string, string>;
};

/** Statuses that can still wait on something: drafts and the open ones. */
const MARKED = new Set(["draft", ...OPEN_STATUSES]);

/**
 * The marks for each submission this actor may see (their own, or any but drafts for reviewers),
 * by id. Closed and published ones have none.
 */
export const dependencyMarks = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  submissions: readonly Submission[],
): Promise<Record<string, DependencyMark[]>> => {
  const registry = deps.registry ?? deps.repo.registry();
  const result: Record<string, DependencyMark[]> = {};
  for (const submission of submissions) {
    const mine = submission.authorId === actor.user?.id;
    const visible =
      mine || (submission.status !== "draft" && can(actor.user, "submissions.view_submitted"));
    if (!visible || !MARKED.has(submission.status)) continue;
    const marks = await marksFor(registry, await dependenciesOf(deps.repo, submission));
    if (marks.length > 0) result[submission.id] = marks;
  }
  return result;
};
