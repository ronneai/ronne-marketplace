/**
 * The scanner's last error, a short code Ronne wrote (`timeout`, `exit 2`), as the message's
 * values: `reason` picks the words, `code` is the exit code; anything else is shown as written.
 */
export const reasonOf = (error: string): { reason: string; code: string; error: string } => {
  const exit = /^exit (-?\d+)$/.exec(error);
  if (exit) return { reason: "exit", code: exit[1] ?? "", error };
  return { reason: error.replaceAll(" ", "_"), code: "", error };
};
