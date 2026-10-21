import { describe, expect, it } from "vitest";
import {
  FavoriteLimitError,
  PinLimitError,
  PinNeedsPublicWorkspaceError,
  ShelfItemNotAvailableError,
} from "@/server/domains/shelves/exceptions/errors";
import { inLocaleAsync } from "@/test/intl";
import { errorText } from "./errors";

/**
 * The pins and favorites errors (feature 125): each reads in the three languages, English is the
 * error's own message word for word, and the values it carries land in the sentence.
 */
type L = "en" | "pt" | "fr";
const text = (locale: L, error: Error) => inLocaleAsync(locale, () => errorText(error));

const CASES: [Error, string[]][] = [
  [new ShelfItemNotAvailableError(), []],
  [new FavoriteLimitError(200), ["200"]],
  [new PinLimitError(null, 12), ["12"]],
  [new PinLimitError("acme", 12), ["acme", "12"]],
  [new PinNeedsPublicWorkspaceError(), []],
];

describe("pins and favorites errors in three languages (125)", () => {
  it.each(CASES)(
    "%s: English is the message word for word; pt and fr are their own",
    async (error, values) => {
      const english = await text("en", error);
      expect(english).toBe(error.message);
      for (const locale of ["pt", "fr"] as const) {
        const said = await text(locale, error);
        expect(said, `${error.name} in ${locale}`).not.toBe(english);
        expect(said).not.toMatch(/[{}]|errors\./);
        for (const value of values)
          expect(said, `${error.name} ${locale}: ${value}`).toContain(value);
      }
    },
  );

  it("a full shelf names Start here or the workspace, in each language", async () => {
    expect(await text("pt", new PinLimitError(null, 12))).toBe(
      "Comece por aqui já tem 12 itens. Remova um antes.",
    );
    expect(await text("pt", new PinLimitError("acme", 12))).toBe(
      "Os itens fixados de acme já são 12. Remova um antes.",
    );
    expect(await text("fr", new PinLimitError(null, 12))).toBe(
      "Commencez ici compte déjà 12 éléments. Retirez-en un d’abord.",
    );
    expect(await text("fr", new PinLimitError("acme", 12))).toBe(
      "Les éléments épinglés de acme sont déjà 12. Retirez-en un d’abord.",
    );
  });

  it("a workspace name that looks like a placeholder is shown as typed", async () => {
    expect(await text("pt", new PinLimitError("{x}-<b>", 12))).toContain("{x}-<b>");
  });
});
