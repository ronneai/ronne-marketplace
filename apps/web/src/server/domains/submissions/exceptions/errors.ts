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
  constructor() {
    super("This submission isn't a draft any more, so it can't be changed.");
  }
}

const STATUS_WORDS: Record<string, string> = {
  changes_requested: "sent back for changes",
};

/** A move MVP §4.1 doesn't allow, such as withdrawing twice. */
export class InvalidStatusTransitionError extends SubmissionsError {
  constructor(
    readonly from: string,
    readonly action: string,
  ) {
    super(
      `A submission that's ${STATUS_WORDS[from] ?? from} can't be ${
        { submit: "submitted", resubmit: "resubmitted", withdraw: "withdrawn" }[action] ??
        `${action.replace("_", " ")}d`
      }.`,
    );
  }
}

/** Submit refused: 011's checks found errors in the saved files. */
export class SubmissionInvalidError extends SubmissionsError {
  constructor(readonly issues: readonly ManifestIssue[]) {
    const errors = issues.filter((issue) => issue.severity === "error").length;
    super(
      `The draft has ${errors} ${errors === 1 ? "problem" : "problems"} to fix before it can be submitted.`,
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
      `${dependency} isn't a published item. A dependency has to be released before items can depend on it.`,
    );
  }
}

export class DependencyTypeNotAllowedError extends SubmissionsError {
  constructor(
    readonly dependency: string,
    dependencyType: string,
    type: string,
    allowed: readonly string[],
  ) {
    super(
      `${dependency} is a ${dependencyType}, and a ${type} can't depend on one. ${
        allowed.length > 0
          ? `A ${type} may depend on: ${allowed.join(", ")}.`
          : `A ${type} can't have dependencies.`
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
  constructor() {
    super("ronne.yaml can't be deleted: every item has one.");
  }
}

export class FileTooLargeError extends SubmissionsError {
  constructor(
    readonly path: string,
    size: number,
    limit: number,
  ) {
    super(`${path} is ${formatBytes(size)}; a file can be at most ${formatBytes(limit)}.`);
  }
}

export class DraftLimitError extends SubmissionsError {
  constructor(
    readonly limit: "files" | "total",
    actual: number,
    max: number,
  ) {
    super(
      limit === "files"
        ? `That would give the draft ${actual} files; the limit is ${max}.`
        : `That would make the draft ${formatBytes(actual)}; the limit is ${formatBytes(max)}.`,
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
