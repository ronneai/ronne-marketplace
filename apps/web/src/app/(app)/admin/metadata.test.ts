import { describe, expect, it } from "vitest";
import { inLocale } from "@/test/intl";
import { adminTitle, settingsTitle } from "./metadata";

const PRODUCT = "Ronne AI Marketplace";

describe("the Admin pages' titles (132)", () => {
  it.each([
    ["en", "Users", "User", "Audit log", "Settings"],
    ["pt", "Usuários", "Usuário", "Registro de auditoria", "Configurações"],
    ["fr", "Utilisateurs", "Utilisateur", "Journal d’audit", "Réglages"],
  ] as const)(
    "read in %s, with the product's name kept as it is",
    async (locale, users, user, audit, settings) => {
      expect(await inLocale(locale, adminTitle("users"))).toEqual({
        title: `${users} · ${PRODUCT}`,
      });
      expect(await inLocale(locale, adminTitle("user"))).toEqual({ title: `${user} · ${PRODUCT}` });
      expect(await inLocale(locale, adminTitle("audit"))).toEqual({
        title: `${audit} · ${PRODUCT}`,
      });
      expect(await inLocale(locale, settingsTitle)).toEqual({
        title: `${settings} · Admin · ${PRODUCT}`,
      });
    },
  );
});
