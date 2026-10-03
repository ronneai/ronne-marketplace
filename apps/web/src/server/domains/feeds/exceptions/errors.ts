/** Errors the feeds domain raises (feature 077). */
export class FeedsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * No plugin for that version in the tool's feed: the item or version doesn't exist, the version is
 * yanked, or it has nothing for the tool.
 */
export class PluginNotFoundError extends FeedsError {
  constructor(
    readonly itemName: string,
    readonly version: string,
    readonly toolName: string,
  ) {
    super(`${itemName}@${version} isn't offered as a ${toolName} plugin.`);
  }
}

/** The plugin couldn't be built: an artifact is missing, or its dependencies don't resolve. */
export class PluginUnavailableError extends FeedsError {
  constructor(
    readonly itemName: string,
    readonly version: string,
    reason: string,
  ) {
    super(`The plugin for ${itemName}@${version} can't be built right now: ${reason}`);
  }
}

/** The marketplace file is past the size the tool reads (Claude Code: 5 MiB). */
export class FeedTooLargeError extends FeedsError {
  constructor(readonly plugins: number) {
    super(
      `The marketplace lists ${plugins} plugins, which is more than the tool can read in one file.`,
    );
  }
}
