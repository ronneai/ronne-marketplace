"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { FLASH_COOKIE, type Flash } from "@/i18n/flash";
import { toast } from "./toast";

/**
 * Shows the flash the server read from the cookie (138), once: the message is in the reader's
 * language, its parameters are plain text, and the cookie is removed as soon as it is shown.
 */
export const FlashToastClient = ({ flash }: { flash: Flash }) => {
  const t = useTranslations("common.flash");
  const shown = useRef(new Set<string>());
  useEffect(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: removing our own cookie; the Cookie Store API isn't in every browser yet.
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    if (shown.current.has(flash.id)) return;
    shown.current.add(flash.id);
    toast[flash.kind](t(flash.key, flash.params));
  }, [flash, t]);
  return null;
};
