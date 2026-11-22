import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  domainsFromModule,
  domainsModule,
  KNOWN_LISTED,
  looksLikeSuffix,
  NEVER_THROWAWAY,
  SHARED_SUFFIXES,
  validateDomains,
} from "./disposable-domains.js";

const many = (count) => Array.from({ length: count }, (_, i) => `throwaway${i}.example`);

describe("the bundled throwaway domains (190)", () => {
  it("keeps a list of plain domains, sorted and once each", () => {
    expect(validateDomains(`${many(1000).reverse().join("\n")}\nthrowaway1.example\n\n`)).toEqual(
      many(1000).sort(),
    );
  });

  it("refuses a line that isn't a domain, a real provider on it, or a short list", () => {
    expect(() => validateDomains([...many(1000), "<script>"].join("\n"))).toThrow("Not a domain");
    expect(() => validateDomains([...many(1000), "Upper.example"].join("\n"))).toThrow(
      "Not a domain",
    );
    expect(() => validateDomains([...many(1000), "gmail.com"].join("\n"))).toThrow("gmail.com");
    expect(() => validateDomains(many(999).join("\n"))).toThrow("not the real list");
    for (const provider of [
      "yahoo.co.uk",
      "outlook.fr",
      "gmx.de",
      "uol.com.br",
      "yahoo.com.br",
      "hotmail.ca",
      "live.ca",
      "videotron.ca",
      "gmx.at",
      "protonmail.ch",
      "mail.com",
    ])
      expect(() => validateDomains([...many(1000), provider].join("\n"))).toThrow(provider);
    // A shared suffix would block every domain under it (all of co.uk).
    for (const suffix of [
      "co.uk",
      "com.br",
      "github.io",
      "gouv.fr",
      "qc.ca",
      "gov.br",
      "edu.br",
      "co.ca",
      "eu.org",
      "s3.amazonaws.com",
    ])
      expect(() => validateDomains([...many(1000), suffix].join("\n"))).toThrow("shared suffix");
  });

  it("is valid as it's bundled, with its source and licence recorded", () => {
    const data = new URL("../../../apps/web/src/server/domains/identity/lists/", import.meta.url);
    const text = readFileSync(new URL("disposable-domains.ts", data), "utf8");
    const domains = validateDomains(domainsFromModule(text));
    // Exactly as the script writes it: nobody edited it by hand.
    expect(text).toBe(domainsModule(domains));
    const source = JSON.parse(
      readFileSync(new URL("disposable-domains.source.json", data), "utf8"),
    );
    expect(source).toMatchObject({ license: "CC0-1.0", domains: domains.length });
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(domains).toContain("mailinator.com");
    for (const provider of NEVER_THROWAWAY) expect(domains).not.toContain(provider);
    for (const suffix of SHARED_SUFFIXES) expect(domains).not.toContain(suffix);
  });

  it("lets through only the suffix-shaped lines the upstream list carries on purpose", () => {
    for (const line of KNOWN_LISTED) expect(looksLikeSuffix(line)).toBe(true);
    expect(validateDomains([...many(1000), ...KNOWN_LISTED].join("\n"))).toEqual(
      expect.arrayContaining(KNOWN_LISTED),
    );
    expect(looksLikeSuffix("mailinator.com")).toBe(false);
    expect(looksLikeSuffix("x.gouv.fr")).toBe(false);
  });
});
