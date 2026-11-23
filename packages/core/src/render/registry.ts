import { claudeCodeRenderer } from "./claude-code/renderer.js";
import { codexRenderer } from "./codex/renderer.js";
import { copilotRenderer } from "./copilot/renderer.js";
import { cursorRenderer } from "./cursor/renderer.js";
import type { PlatformRenderer } from "./types.js";

/**
 * Every renderer `rmk` can use, in the order `rmk platforms` lists them (feature 021): Claude Code
 * (023), then Codex (024), Cursor (025), GitHub Copilot (028) and the rest of tier 2 as their
 * features land.
 */
export const RENDERERS: readonly PlatformRenderer[] = [
  claudeCodeRenderer,
  codexRenderer,
  cursorRenderer,
  copilotRenderer,
];

export const rendererById = (id: string): PlatformRenderer | undefined =>
  RENDERERS.find((renderer) => renderer.id === id);
