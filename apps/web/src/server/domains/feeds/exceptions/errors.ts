import { MESSAGE_FOR_PEOPLE } from "../../../log/message-for-people";
/** Errors the feeds domain raises (feature 077). */
export class FeedsError extends Error {
  override readonly name: string = "FeedsError";
  // Its messages are for people and may name items: the logs write its name and code only.
  readonly [MESSAGE_FOR_PEOPLE] = true;

  constructor(message: string) {
    super(message);
  }
}

/**
 * No plugin for that version in the tool's feed: the item or version doesn't exist, the version is
 * yanked, or it has nothing for the tool.
 */
export class PluginNotFoundError extends FeedsError {
  override readonly name: string = "PluginNotFoundError";
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
  override readonly name: string = "PluginUnavailableError";
  constructor(
    readonly itemName: string,
    readonly version: string,
    reason: string,
  ) {
    super(`The plugin for ${itemName}@${version} can't be built right now: ${reason}`);
  }
}

/**
 * Claude Code's marketplace is past the 5 MiB Claude Code reads from an address (079: only Claude
 * Code's). The git mirror has no such limit.
 */
export class FeedTooLargeError extends FeedsError {
  override readonly name: string = "FeedTooLargeError";
  constructor(readonly plugins: number) {
    super(
      `This instance's Claude Code marketplace lists ${plugins} plugins, more than the 5 MiB Claude Code reads from an address. Add the instance's git mirror in Claude Code instead (rmk feed build): a marketplace in a git repository has no such limit.`,
    );
  }
}

/**
 * A mirror asked for a workspace the token's user doesn't see (093): unknown, or private and they
 * aren't a member. One message for both, so it doesn't tell a private name from an unknown one.
 */
export class FeedWorkspaceNotFoundError extends FeedsError {
  override readonly name: string = "FeedWorkspaceNotFoundError";
  constructor(readonly workspace: string) {
    super(`There's no workspace ${workspace} you can use.`);
  }
}
