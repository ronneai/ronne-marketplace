import type { Locale } from "@/server/domains/identity/models/locale";
import type { Messages } from "./namespaces";

// next-intl then knows the languages and every message key, and a wrong key is a type error.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
