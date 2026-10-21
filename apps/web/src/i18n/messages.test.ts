import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/server/log", () => ({ logger: { child: () => log } }));

import type { Catalogue } from "./catalogue";
import { loadMessages, type Reader } from "./messages";

const files: Record<string, Catalogue> = {
  "en/common": { language: { label: "Language", automatic: "Automatic" } },
  "pt/common": { language: { label: "Idioma" } },
  "fr/common": { language: { label: "Langue", automatic: "Automatique" } },
};
const read: Reader = async (locale, namespace) => files[`${locale}/${namespace}`] ?? {};

beforeEach(() => log.warn.mockReset());

describe("loadMessages (129)", () => {
  it("returns the English files as they are for English", async () => {
    expect(await loadMessages("en", read)).toEqual({ common: files["en/common"] });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("returns a complete language's own text, without a warning", async () => {
    const messages = await loadMessages("fr", read);
    const t = createTranslator({ locale: "fr", messages, namespace: "common" });
    expect(t("language.automatic")).toBe("Automatique");
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("shows English for a message the language misses, and says so once", async () => {
    const messages = await loadMessages("pt", read);
    const t = createTranslator({ locale: "pt", messages, namespace: "common" });
    expect(t("language.label")).toBe("Idioma");
    expect(t("language.automatic")).toBe("Automatic");
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      "Messages missing in this language, showing English",
      expect.objectContaining({
        locale: "pt",
        namespace: "common",
        count: 1,
        keys: ["language.automatic"],
      }),
    );
    await loadMessages("pt", read);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });
});
