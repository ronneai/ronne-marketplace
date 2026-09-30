/** The rule PUBLIC_URL must follow, for the terminal and the web setup (features 003 and 036). */
export const PUBLIC_URL_RULE = "Use an http:// or https:// address.";

const PUBLIC_URL = /^https?:\/\/[^\s/]+/;

/** The address without surrounding spaces or trailing slashes, or undefined when it isn't one. */
export const normalizePublicUrl = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!PUBLIC_URL.test(trimmed)) return undefined;
  return trimmed.replace(/\/+$/, "");
};
