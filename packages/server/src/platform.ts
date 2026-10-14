// The systems rmk-server runs on (feature 121; the same as package.json's `os`). On Windows, the
// server runs in WSL 2 or a Linux virtual machine; `rmk` and `rmk-mcp` run on Windows itself.
export const SUPPORTED_PLATFORMS: readonly NodeJS.Platform[] = ["darwin", "linux"];

export const WINDOWS_HELP = "https://www.ronne.ai/marketplace/docs/install#windows";

/** What to say on a system rmk-server doesn't run on, or undefined where it does. */
export const platformRefusal = (platform: NodeJS.Platform): string | undefined =>
  SUPPORTED_PLATFORMS.includes(platform)
    ? undefined
    : `rmk-server runs on Linux and macOS. On Windows, run it in WSL 2 or a Linux virtual machine: ${WINDOWS_HELP}`;
