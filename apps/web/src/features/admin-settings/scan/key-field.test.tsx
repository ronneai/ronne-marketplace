import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { inLocale } from "@/test/intl";
import { KeyField, type KeyMode, keyModeAfter } from "./KeyField";

const html = (mode: KeyMode, stored: "set" | "unreadable" | "none" = "set", value = "") =>
  renderToStaticMarkup(
    <KeyField mode={mode} stored={stored} value={value} onType={() => {}} onClick={() => {}} />,
  );
const field = (page: string) => page.match(/<input[^>]*name="key"[^>]*>/)?.[0] ?? null;

describe("the key field's modes (136)", () => {
  it("stored: Key set, with Replace and Remove, and no key field", () => {
    const page = html("stored");
    expect(page).toContain("Key set");
    expect(page).toContain(">Replace<");
    expect(page).toContain(">Remove<");
    expect(field(page)).toBeNull();
    expect(page).not.toContain('name="removeKey"');
    expect(page).toContain("removes the stored key, unless you enter one");
  });

  it("typing (no key, or after Replace): an empty password field, what's typed only", () => {
    const empty = field(html("typing", "none"));
    expect(empty).toContain('type="password"');
    expect(empty).not.toMatch(/value="[^"]/);
    expect(field(html("typing", "set", "sk-typed"))).toContain('value="sk-typed"');
    expect(html("typing", "set")).not.toContain("Key set");
  });

  it("removing: says the key goes on Save, sends removeKey, and offers Keep", () => {
    const page = html("removing");
    expect(page).toContain("No key");
    expect(page).toContain("The stored key is removed when you save.");
    expect(page).toContain('<input type="hidden" name="removeKey" value="true"/>');
    expect(page).toContain(">Keep it<");
    expect(page).not.toContain(">Replace<");
    expect(field(page)).toBeNull();
  });

  it("unreadable: asks for the key again, in an empty field, whatever the mode", () => {
    for (const mode of ["stored", "removing", "typing"] as const) {
      const page = html(mode, "unreadable");
      expect(page).toContain("The stored key can&#x27;t be read: enter it again.");
      expect(field(page)).toContain('type="password"');
      expect(page).not.toContain('name="removeKey"');
    }
  });

  it("reads in Portuguese and French", () => {
    expect(inLocale("pt", () => html("removing"))).toContain(
      "A chave guardada é removida ao salvar.",
    );
    expect(inLocale("fr", () => html("stored"))).toContain("Remplacer");
  });
});

describe("keyModeAfter (136)", () => {
  it("goes to typing on Replace, to removing on Remove, and back on Keep", () => {
    expect(keyModeAfter("stored", "replace")).toBe("typing");
    expect(keyModeAfter("stored", "remove")).toBe("removing");
    expect(keyModeAfter("removing", "keep")).toBe("stored");
  });

  it("ignores a click that doesn't apply", () => {
    expect(keyModeAfter("typing", "remove")).toBe("typing");
    expect(keyModeAfter("typing", "keep")).toBe("typing");
    expect(keyModeAfter("stored", "keep")).toBe("stored");
  });
});
