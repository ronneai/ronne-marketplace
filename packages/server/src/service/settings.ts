// Install's changes to the settings file (feature 083): a few keys set or removed, every other line
// kept, in the format the app's reader (util.parseEnv) reads back.

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;
const SAFE = /^[A-Za-z0-9_\-.:/@%+=,~]*$/;

const format = (value: string): string => {
  if (/[\r\n'"`\\#]/.test(value))
    throw new Error(`Can't write this value to the settings file: ${value}`);
  return SAFE.test(value) ? value : `'${value}'`;
};

/** Returns `text` with `set` applied (replaced in place or appended) and `remove`'s lines dropped. */
export const updateSettings = (
  text: string,
  set: Record<string, string>,
  remove: string[] = [],
): string => {
  const pending = new Map(Object.entries(set));
  const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
  const kept = lines.flatMap((line) => {
    const key = LINE.exec(line)?.[1];
    if (!key) return [line];
    if (pending.has(key)) {
      const value = pending.get(key) as string;
      pending.delete(key);
      return [`${key}=${format(value)}`];
    }
    return remove.includes(key) ? [] : [line];
  });
  for (const [key, value] of pending) kept.push(`${key}=${format(value)}`);
  return kept.length === 0 ? "" : `${kept.join("\n")}\n`;
};

/** One key's value, as the app would read it (unquoted). */
export const settingValue = (text: string, key: string): string | undefined => {
  for (const line of text.split("\n")) {
    if (LINE.exec(line)?.[1] !== key) continue;
    const raw = line.slice(line.indexOf("=") + 1).trim();
    const quote = raw[0];
    return quote && `'"\``.includes(quote) && raw.endsWith(quote) && raw.length > 1
      ? raw.slice(1, -1)
      : raw;
  }
  return undefined;
};
