/**
 * The little TOML the Codex renderer writes itself (024): an agent file's string keys. Keys in the
 * applier's `config.toml` edits go through `rmk`'s TOML library instead.
 */

/** A TOML basic string: JSON's escapes are all valid TOML ones. */
export const tomlString = (value: string): string => JSON.stringify(value);

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
