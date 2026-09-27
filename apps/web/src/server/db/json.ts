/** JSON columns are text on every dialect (MVP §9.4). */
export function encodeJson(value: unknown): string {
  return JSON.stringify(value);
}

export function decodeJson<T>(text: string): T;
export function decodeJson<T>(text: string | null): T | null;
export function decodeJson<T>(text: string | null): T | null {
  return text === null ? null : (JSON.parse(text) as T);
}
