// The systems rmk-server runs on (feature 121, #222; the same as package.json's `os`). On Windows
// it runs in a terminal only, without a service; at boot, it runs in WSL 2 or a Linux VM.
export const SUPPORTED_PLATFORMS: readonly NodeJS.Platform[] = ["darwin", "linux", "win32"];

export const WINDOWS_HELP = "https://www.ronne.ai/marketplace/docs/install#windows";

/** What to say on a system rmk-server doesn't run on, or undefined where it does. */
export const platformRefusal = (platform: NodeJS.Platform): string | undefined =>
  SUPPORTED_PLATFORMS.includes(platform)
    ? undefined
    : "rmk-server runs on Linux, macOS and Windows.";

/** What a start on Windows says after the data folder (#222). */
export const WINDOWS_NOTE = `On Windows, rmk-server runs in this terminal only (no service). To run it at boot, use WSL 2 or Linux: ${WINDOWS_HELP}`;
