/**
 * Copies text, wherever the page is served (067). The clipboard API only exists in a secure
 * context: a self-hosted instance opened over plain http on a LAN address has none, and copy
 * failed silently there. So: the clipboard API when it works, else the older copy command on a
 * hidden textarea (still the only way on an insecure origin), else "manual": the caller selects
 * the text and asks the person to copy it themselves.
 */
export type CopyResult = "copied" | "manual";

const copyWithCommand = (text: string): boolean => {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  // Off screen, and 16px so iOS doesn't zoom when it's selected.
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.fontSize = "16px";
  document.body.append(area);
  const focused = document.activeElement;
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  // Give focus back to whatever had it (the copy button).
  if (focused && "focus" in focused && typeof focused.focus === "function") focused.focus();
  return ok;
};

export const copyText = async (text: string): Promise<CopyResult> => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      // Denied, or not allowed here: try the older way.
    }
  }
  return copyWithCommand(text) ? "copied" : "manual";
};

/** Selects an element's text, for a person to copy by hand when `copyText` couldn't. */
export const selectText = (element: Element | null) => {
  if (!element) return;
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection?.removeAllRanges();
  selection?.addRange(range);
};
