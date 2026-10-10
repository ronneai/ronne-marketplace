/** What the tools answer: a few plain lines for the assistant, and the data for clients that want it. */
export type ToolAnswer = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export const answer = (lines: string[], data?: Record<string, unknown>): ToolAnswer => ({
  content: [{ type: "text", text: lines.join("\n") }],
  ...(data ? { structuredContent: data } : {}),
});

/**
 * An error the assistant can act on: its code, the message rmk would print, and anything that
 * helps, such as where to ask to join a workspace (`joinUrl`, 095).
 */
export const failure = (
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): ToolAnswer => ({
  content: [{ type: "text", text: `${message} (${code})` }],
  structuredContent: { error: { code, message, ...extra } },
  isError: true,
});

/** `[yanked] [deprecated] …` marks, as rmk prints them. */
export const marks = (row: {
  deprecated?: string | null;
  yanked?: boolean;
  risky?: boolean;
  installable?: boolean;
}) =>
  [
    row.yanked ? "yanked" : "",
    row.deprecated ? "deprecated" : "",
    row.risky ? "risk" : "",
    row.installable === false ? "no installable version" : "",
  ]
    .filter(Boolean)
    .map((m) => `[${m}]`)
    .join(" ");
