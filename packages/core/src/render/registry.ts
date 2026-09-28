import type { PlatformRenderer } from "./types.js";

/**
 * Every renderer `rmk` can use, in the order `rmk platforms` lists them (feature 021). Renderers
 * join here as their features land: Claude Code (023), Codex (024), Cursor (025), then tier 2.
 */
export const RENDERERS: readonly PlatformRenderer[] = [];

export const rendererById = (id: string): PlatformRenderer | undefined =>
  RENDERERS.find((renderer) => renderer.id === id);
