import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/server/domains/identity/models/locale";
import { compareCatalogues, flatten } from "./catalogue";
import { NAMESPACES } from "./namespaces";

const root = new URL("../../messages/", import.meta.url);
const read = async (locale: string, namespace: string) =>
  (await import(`../../messages/${locale}/${namespace}.json`)).default;
const foreign = LOCALES.filter((locale) => locale !== "en");

describe("the message files (129)", () => {
  it.each(LOCALES)("%s has exactly the namespaces NAMESPACES lists", (locale) => {
    const files = readdirSync(new URL(`${locale}/`, root))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .sort();
    expect(files).toEqual([...NAMESPACES].sort());
  });

  it("has no locale folder beyond the supported languages", () => {
    const folders = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(folders).toEqual([...LOCALES].sort());
  });

  it.each(NAMESPACES)("%s: English has no empty text", async (namespace) => {
    const empty = Object.entries(flatten(await read("en", namespace))).filter(([, text]) => !text);
    expect(empty).toEqual([]);
  });

  for (const namespace of NAMESPACES)
    for (const locale of foreign)
      it(`${locale}/${namespace} has every key of English, no other, and the same placeholders`, async () => {
        expect(
          compareCatalogues(await read("en", namespace), await read(locale, namespace)),
        ).toEqual([]);
      });
});
