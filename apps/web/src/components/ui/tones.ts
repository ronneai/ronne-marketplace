/**
 * The tones a notification can take (design system 032, owner, 2026-10-01): one place for their
 * classes, so a popover, a chip and anything else about a problem look the same. Red and amber
 * only for errors and warnings; `ok` is teal; `default` is the helpers' popover teal. Tokens only.
 */
export const TONES = {
  default: {
    surface: "border-popover-border bg-popover",
    arrow: "fill-popover stroke-popover-border",
    chip: "border-hairline bg-surface hover:bg-tint",
    text: "text-fg",
  },
  ok: {
    surface: "border-popover-border bg-popover",
    arrow: "fill-popover stroke-popover-border",
    chip: "border-hairline bg-surface hover:bg-tint",
    text: "text-accent-strong",
  },
  warning: {
    surface: "border-warning/40 bg-warning-subtle",
    arrow: "fill-warning-subtle stroke-warning/40",
    chip: "border-warning/40 bg-surface hover:bg-warning-subtle",
    text: "text-warning-text",
  },
  error: {
    surface: "border-error/40 bg-error-subtle",
    arrow: "fill-error-subtle stroke-error/40",
    chip: "border-error/40 bg-surface hover:bg-error-subtle",
    text: "text-error-text",
  },
} as const;

export type Tone = keyof typeof TONES;
