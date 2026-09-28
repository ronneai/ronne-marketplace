/** `2026-09-27 14:05 UTC`: the same for every viewer, wherever they are. */
export const utcMinute = (date: Date): string =>
  `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
