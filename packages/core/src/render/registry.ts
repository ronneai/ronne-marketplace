import { claudeCodeRenderer } from "./claude-code/renderer.js";
import { codexRenderer } from "./codex/renderer.js";
import type { PlatformRenderer } from "./types.js";

/**
 * Every renderer `rmk` can use, in the order `rmk platforms` lists them (feature 021): Claude Code
 * (023), then Codex (024), Cursor (025) and tier 2 as their features land.
 */
export const RENDERERS: readonly PlatformRenderer[] = [claudeCodeRenderer, codexRenderer];

export const rendererById = (id: string): PlatformRenderer | undefined =>
  RENDERERS.find((renderer) => renderer.id === id);
