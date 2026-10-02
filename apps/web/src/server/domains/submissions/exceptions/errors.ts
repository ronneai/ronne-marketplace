import {
  formatBytes,
  type ManifestIssue,
  NAME_PROBLEM_MESSAGES,
  type NameProblem,
} from "@ronneai/core";

/** Errors the submissions domain raises. Pages turn them into `ERR:` lines. */
export class SubmissionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Missing, or someone else's draft: both look the same, so a draft's existence isn't revealed. */
export class SubmissionNotFoundError extends SubmissionsError {
  constructor() {
    super("That submission doesn't exist.");
  }
}

export class InvalidItemNameError extends SubmissionsError {
  constructor(readonly problem: NameProblem) {
    super(`That item name won't work. ${NAME_PROBLEM_MESSAGES[problem]}`);
  }
}

export class InvalidItemTypeError extends SubmissionsError {
  constructor(readonly type: string) {
    super(`${type || "(empty)"} isn't an item type.`);
  }
}

export class DraftScopeNotFoundError extends SubmissionsError {
  constructor(readonly scopeName: string) {
    super(`The scope @${scopeName} doesn't exist. Root creates scopes.`);
  }
}

/** Only drafts can be edited, renamed or deleted; a submitted one is frozen for review. */
export class SubmissionNotEditableError extends SubmissionsError {
  /** The status it has, for the API's `details` (051). */
  constructor(readonly status?: string) {
    super("This submission isn't a draft any more, so it can't be changed.");
  }
}

const STATUS_WORDS: Record<string, string> = {
  changes_requested: "sent back for changes",
  withdrawn: "archived",
};

/** A move MVP §4.1 doesn't allow, such as withdrawing twice. */
export class InvalidStatusTransitionError extends SubmissionsError {
  constructor(
    readonly from: string,
    readonly action: string,
  ) {
    super(
      `A submission that's ${STATUS_WORDS[from] ?? from} can't be ${
        {
          submit: "submitted",
          resubmit: "resubmitted",
          withdraw: "withdrawn",
          restore: "restored",
        }[action] ?? `${action.replace("_", " ")}d`
      }.`,
    );
  }
}

/** Submit refused: 011's checks found errors in the saved files. */
export class SubmissionInvalidError extends SubmissionsError {
  constructor(
    readonly issues: readonly ManifestIssue[],
    /** At release (015), the first problem is named: usually a dependency not released yet (056). */
    when: "submit" | "release" = "submit",
  ) {
    const errors = issues.filter((issue) => issue.severity === "error");
    super(
      when === "release"
        ? `It can't be released yet: ${errors[0]?.message ?? "its checks fail."}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ""}`
        : `The draft has ${errors.length} ${errors.length === 1 ? "problem" : "problems"} to fix before it can be submitted.`,
    );
  }
}

export class ItemNameTakenError extends SubmissionsError {
  constructor(
    readonly itemName: string,
    readonly by: "published" | "submission",
  ) {
    super(
      by === "published"
        ? `${itemName} is already a published item. Pick another name, or propose a change to it.`
        : `${itemName} is already proposed by another submission under review. Pick another name.`,
    );
  }
}

export class DependencyNotFoundError extends SubmissionsError {
  constructor(readonly dependency: string) {
    super(
      `${dependency} isn't a published item or in review. Submit it first: a dependency counts once it's in review.`,
    );
  }
}

/** A dependency whose only submission was rejected or withdrawn (056): it won't be released. */
export class DependencyClosedError extends SubmissionsError {
  constructor(
    readonly dependency: string,
    readonly status: "rejected" | "withdrawn",
  ) {
    super(
      `${dependency} was ${status}, so it won't be released. Remove it from dependencies, or depend on another item.`,
    );
  }
}

/** At release (056), a dependency still in review: it's released first. */
export class DependencyUnreleasedError extends SubmissionsError {
  constructor(
    readonly dependency: string,
    readonly status: string,
  ) {
    super(`${dependency} isn't released yet (it's ${status}). Release it first.`);
  }
}

/** "an agent", "an mcp-server", "a hook": the article as the type is read aloud. */
const withArticle = (type: string) =>
  `${/^(agent|output-style|mcp-server|lsp-server)$/.test(type) ? "an" : "a"} ${type}`;

export class DependencyTypeNotAllowedError extends SubmissionsError {
  constructor(
    readonly dependency: string,
    dependencyType: string,
    type: string,
    allowed: readonly string[],
  ) {
    super(
      `${dependency} is ${withArticle(dependencyType)}, which ${withArticle(type)} can't depend on. ${
        allowed.length > 0
          ? `${withArticle(type)[0]?.toUpperCase()}${withArticle(type).slice(1)} may depend on: ${allowed.join(", ")}.`
          : `${withArticle(type)[0]?.toUpperCase()}${withArticle(type).slice(1)} can't have dependencies.`
      }`,
    );
  }
}

export class DependencyRangeUnmatchedError extends SubmissionsError {
  constructor(
    readonly dependency: string,
    readonly range: string,
  ) {
    super(`No published version of ${dependency} matches ${range}.`);
  }
}

export class DependencyCycleError extends SubmissionsError {
  constructor(readonly cycle: readonly string[]) {
    super(`The dependencies go round in a circle: ${cycle.join(" → ")}.`);
  }
}

export class InvalidFilePathError extends SubmissionsError {
  constructor(
    readonly path: string,
    problem: string,
  ) {
    super(`The path ${path || "(empty)"} ${problem}.`);
  }
}

export class InvalidFileContentError extends SubmissionsError {
  constructor(readonly path: string) {
    super(`${path}'s content isn't valid base64.`);
  }
}

export class ManifestRequiredError extends SubmissionsError {
  constructor(reason: "deleted" | "missing" = "deleted") {
    super(
      reason === "deleted"
        ? "ronne.yaml can't be deleted: every item has one."
        : "The files have no ronne.yaml: every item has one.",
    );
  }
}

/** A file New item started the type with (owner, 2026-10-01): edited, never deleted or renamed. */
export class StartingFileError extends SubmissionsError {
  constructor(
    readonly path: string,
    readonly type: string,
  ) {
    super(
      `${path} is one of the ${type}'s starting files: edit it, but it can't be deleted or renamed.`,
    );
  }
}

export class FileTooLargeError extends SubmissionsError {
  constructor(
    readonly path: string,
    size: number,
    readonly max: number,
  ) {
    super(`${path} is ${formatBytes(size)}; a file can be at most ${formatBytes(max)}.`);
  }
}

export class DraftLimitError extends SubmissionsError {
  constructor(
    readonly limit: "files" | "total",
    actual: number,
    readonly max: number,
  ) {
    super(
      limit === "files"
        ? `That would give the draft ${actual} files; the limit is ${max}.`
        : `That would make the draft ${formatBytes(actual)}; the limit is ${formatBytes(max)}.`,
    );
  }
}

/** The API's cap on drafts per author (037); the web editor has none. */
export class DraftQuotaError extends SubmissionsError {
  constructor(readonly limit: number) {
    super(`You already have ${limit} drafts. Submit or delete some before uploading more.`);
  }
}

/**
 * An upload meant to replace a draft (051) names another item, type or base version than the
 * draft has: it's a different draft, so it's refused rather than turning this one into it.
 */
export class DraftMismatchError extends SubmissionsError {
  constructor(readonly draft: { name: string; type: string; baseVersion: string | null }) {
    super(
      `That draft is ${draft.name}, a ${draft.type}${draft.baseVersion ? ` proposed from ${draft.baseVersion}` : ""}; the upload is something else, so it would be a new draft.`,
    );
  }
}

/** A save would overwrite files that changed since they were loaded (another tab, say). */
export class StaleFilesError extends SubmissionsError {
  constructor(readonly paths: readonly string[]) {
    super(
      `${paths.join(", ")} changed since you opened ${paths.length === 1 ? "it" : "them"}. Reload to see the changes, or save again to overwrite them.`,
    );
  }
}

/** A .zip import refused before anything changed. */
export class ZipImportError extends SubmissionsError {
  constructor(reason: string) {
    super(`That .zip can't be imported: ${reason}`);
  }
}

/** A reviewer deciding on their own submission; root can approve its own through an override. */
export class OwnSubmissionError extends SubmissionsError {
  constructor(canOverride: boolean) {
    super(
      canOverride
        ? "You can't review your own submission. As root, you can approve it with an override."
        : "You can't review your own submission: another moderator or root has to.",
    );
  }
}

export const REVIEW_MESSAGE_MAX_LENGTH = 5000;

/** A decision that needs a message without one, or any message that's too long. */
export class ReviewMessageError extends SubmissionsError {
  constructor(
    readonly reason: "required" | "too_long",
    what: string,
  ) {
    super(
      reason === "required"
        ? `${what} needs a message, so the author knows what to do.`
        : `A message can have at most ${REVIEW_MESSAGE_MAX_LENGTH.toLocaleString("en")} characters.`,
    );
  }
}

/** Approving many at once (054) takes at most `limit` submissions per request. */
export class BulkLimitError extends SubmissionsError {
  constructor(
    readonly count: number,
    readonly limit: number,
  ) {
    super(`That's ${count} submissions; one request takes at most ${limit}.`);
  }
}

/** Comments are for submissions under review; drafts and closed ones have no conversation. */
export class ConversationClosedError extends SubmissionsError {
  constructor() {
    super("This submission isn't under review, so it can't take comments.");
  }
}

/** An override is root approving its own submission; others' are approved normally. */
export class OverrideNotNeededError extends SubmissionsError {
  constructor() {
    super("An override is only for your own submission. Approve this one instead.");
  }
}

/** The release choice gives no valid version: a bad pre-release id, or one that sorts too low. */
export class ReleaseVersionError extends SubmissionsError {
  constructor() {
    super(
      "That doesn't give a new version: a pre-release id is lowercase letters and digits, starting with a letter, and has to sort after the current one.",
    );
  }
}

/** Versions are immutable and never reused, yanked ones included (MVP §3.4). */
export class VersionExistsError extends SubmissionsError {
  constructor(
    readonly itemName: string,
    readonly version: string,
  ) {
    super(`${itemName} ${version} is already published, and versions are never reused.`);
  }
}

export class ReleaseTagError extends SubmissionsError {}

export const RELEASE_NOTES_MAX_LENGTH = 2000;

export class ReleaseNotesError extends SubmissionsError {
  constructor() {
    super(
      `Release notes can have at most ${RELEASE_NOTES_MAX_LENGTH.toLocaleString("en")} characters.`,
    );
  }
}

/** Packing refused the files, such as a package over 5 MB (MVP §12). */
export class ReleasePackError extends SubmissionsError {}

/** A change proposal (017) keeps its item's scope and name: a new name is a new item. */
export class ProposalRenameError extends SubmissionsError {
  constructor() {
    super(
      "A change proposal keeps its item's scope and name. To use another name, start a new item.",
    );
  }
}

/** Proposing a change to an item or version that isn't published. */
export class ProposalBaseNotFoundError extends SubmissionsError {
  constructor(
    readonly itemName: string,
    readonly version?: string,
  ) {
    super(
      version
        ? `${itemName} has no version ${version} to propose a change to.`
        : `${itemName} isn't a published item.`,
    );
  }
}

/** A version's artifact couldn't be read back to start a proposal from it. */
export class ProposalArtifactError extends SubmissionsError {
  constructor(
    readonly itemName: string,
    readonly version: string,
  ) {
    super(`The files of ${itemName} ${version} couldn't be read. Ask root to check the storage.`);
  }
}

/** A proposal whose item has a newer version (017): it has to be rebased before it's approved. */
export class SubmissionStaleError extends SubmissionsError {
  constructor(
    readonly itemName: string,
    readonly baseVersion: string,
    readonly newer: string,
  ) {
    super(
      `This proposal changes ${itemName} ${baseVersion}, but ${newer} has been released since. The author rebases it onto ${newer} first.`,
    );
  }
}

/** A proposal (017) can't change its item's type (manifest spec §6, layer 3). */
export class TypeChangedError extends SubmissionsError {
  constructor(
    readonly itemName: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(
      `${itemName} is a ${from}; a change can't make it a ${to}. Start a new item for another type.`,
    );
  }
}

/** Rebasing or resolving applies to change proposals (017) only. */
export class NotAProposalError extends SubmissionsError {
  constructor() {
    super("Only a change proposal can be rebased: this submission is a new item.");
  }
}

/** Rebasing a proposal that's already on the item's newest version. */
export class ProposalCurrentError extends SubmissionsError {
  constructor(readonly baseVersion: string) {
    super(`Nothing to rebase: ${baseVersion} is still the newest version.`);
  }
}

/** Resolving a path the last rebase didn't leave in conflict. */
export class ConflictNotFoundError extends SubmissionsError {
  constructor(readonly path: string) {
    super(`${path} has no conflict to resolve.`);
  }
}
