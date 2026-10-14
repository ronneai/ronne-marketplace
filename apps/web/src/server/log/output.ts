/** The streams already listened to: once each. */
const watched = new WeakSet<NodeJS.WritableStream>();

/**
 * Writes to stdout or stderr without waiting. A closed stream (`EPIPE`: the reader gone, as with
 * `rmk-server revoke-access | grep -q …`) loses the rest of the output and never crashes the process:
 * its `error` event is listened to once. `console` does the same; a bare `write` doesn't.
 */
export const writeTo = (stream: NodeJS.WritableStream, text: string): void => {
  if (!watched.has(stream)) {
    watched.add(stream);
    stream.on("error", () => {
      // Nowhere left to write: the output is lost, the process goes on.
    });
  }
  stream.write(text);
};
