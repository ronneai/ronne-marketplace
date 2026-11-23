/**
 * The little TOML the Codex renderer writes itself (024): an agent file's string keys. Keys in the
 * applier's `config.toml` edits go through `rmk`'s TOML library instead.
 */

/**
 * A TOML basic string. JSON's escapes are all valid TOML ones, but JSON leaves DEL (U+007F) raw and
 * writes a lone surrogate as `\ud800`, both of which TOML refuses (and a reader then drops the whole
 * file), so DEL is escaped and a lone surrogate becomes U+FFFD.
 */
export const tomlString = (value: string): string =>
  JSON.stringify(wellFormed(value)).replaceAll("\u007f", "\\u007f");

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/** The text with each lone surrogate replaced by U+FFFD (`String.prototype.toWellFormed`). */
export const wellFormed = (value: string): string => {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (isHigh(code) && isLow(value.charCodeAt(i + 1))) {
      out += value.slice(i, i + 2);
      i++;
    } else out += isHigh(code) || isLow(code) ? "\ufffd" : value[i];
  }
  return out;
};

/**
 * A multi-line string for long text such as an agent's instructions: a literal `'''` block when the
 * text allows it, so it reads as written, and a basic string otherwise.
 */
export const tomlText = (value: string): string => {
  const hasControl = [...value].some((char) => {
    const code = char.charCodeAt(0);
    return (code < 0x20 && char !== "\n" && char !== "\t") || code === 0x7f;
  });
  return value.includes("'''") || value.includes("\r") || hasControl || value.endsWith("'")
    ? tomlString(value)
    : `'''\n${value}'''`;
};
