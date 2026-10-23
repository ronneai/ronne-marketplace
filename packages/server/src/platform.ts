import { win32 } from "node:path";

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

/** What a start prints about where it runs: the data folder, and on Windows the note. */
export const startLines = (platform: NodeJS.Platform, dataDir: string): string =>
  `Data folder: ${dataDir}\n${platform === "win32" ? `${WINDOWS_NOTE}\n` : ""}`;

/**
 * The command that opens `url` in the browser. On Windows, Windows' own cmd.exe by its full path
 * (a bare "cmd" may be looked up in the current folder first), and start's first argument is the
 * window's title, so it gets an empty one.
 */
export const browserCommand = (
  platform: NodeJS.Platform,
  url: string,
  env: Record<string, string | undefined>,
): [string, string[]] => {
  if (platform === "darwin") return ["open", [url]];
  if (platform === "win32")
    return [
      win32.join(env.SystemRoot || "C:\\Windows", "System32", "cmd.exe"),
      ["/c", "start", "", url],
    ];
  return ["xdg-open", [url]];
};
