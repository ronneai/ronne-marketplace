// Where rmk-server keeps its data (feature 082): RONNE_DATA_DIR, or a folder per system.
import { join, win32 } from "node:path";

type Env = Record<string, string | undefined>;

export const dataDir = (platform: NodeJS.Platform, env: Env, home: string): string => {
  if (env.RONNE_DATA_DIR) return env.RONNE_DATA_DIR;
  if (platform === "darwin")
    return join(home, "Library", "Application Support", "RonneAI Marketplace");
  if (platform === "win32")
    return win32.join(
      env.LOCALAPPDATA || win32.join(home, "AppData", "Local"),
      "RonneAI",
      "Marketplace",
    );
  return join(env.XDG_DATA_HOME || join(home, ".local", "share"), "rmk-server");
};
