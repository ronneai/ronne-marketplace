/** JSON columns are text on every dialect (MVP §9.4). */
export const encodeJson = (value: unknown): string => {
  return JSON.stringify(value);
};

type DecodeJson = {
  <T>(text: string): T;
  <T>(text: string | null): T | null;
};

// An arrow can't carry overloads itself, so it's typed by the call signatures above.
export const decodeJson = (<T>(text: string | null): T | null =>
  text === null ? null : (JSON.parse(text) as T)) as DecodeJson;
