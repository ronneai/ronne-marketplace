"use client";

import { useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { inputClasses, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";

/**
 * The provider's API key (136), write-only: `stored` shows "Key set" with Replace and Remove;
 * `typing` an empty password field (no key yet, or Replace); `removing` says the key goes on
 * Save, with Keep to undo. The page never has the key: only whether one is stored.
 */
export type KeyMode = "stored" | "typing" | "removing";
export type KeyClick = "replace" | "remove" | "keep";

/** The mode after a click on Replace, Remove or Keep. */
export const keyModeAfter = (mode: KeyMode, click: KeyClick): KeyMode => {
  if (click === "replace") return "typing";
  if (click === "remove") return mode === "stored" ? "removing" : mode;
  return mode === "removing" ? "stored" : mode;
};

export const KeyField = ({
  mode,
  stored,
  value,
  onType,
  onClick,
}: {
  mode: KeyMode;
  /** What's stored for this provider: "none" when nothing is, or the key was for another one. */
  stored: "set" | "unreadable" | "none";
  value: string;
  onType: (value: string) => void;
  onClick: (click: KeyClick) => void;
}) => {
  const t = useTranslations("admin.settings.scan.provider");
  // A key that can't be read is entered again: there's nothing to keep or remove.
  const shown: KeyMode = stored === "unreadable" ? "typing" : mode;
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <Label htmlFor="scan-key">{t("key")}</Label>
        <Help id="scan-key" />
      </div>
      {stored === "unreadable" ? <Notice kind="warn" title={t("keyUnreadable")} /> : null}
      {shown === "typing" ? (
        <input
          id="scan-key"
          name="key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          className={`${inputClasses} font-mono`}
          aria-describedby="scan-key-hint"
          value={value}
          onChange={(event) => onType(event.target.value)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm text-fg">
          <span>{shown === "removing" ? t("keyNone") : t("keySet")}</span>
          {shown === "removing" ? (
            <Button variant="text" onClick={() => onClick("keep")}>
              {t("keep")}
            </Button>
          ) : (
            <>
              <Button variant="text" onClick={() => onClick("replace")}>
                {t("replace")}
              </Button>
              <Button variant="text-destructive" onClick={() => onClick("remove")}>
                {t("removeButton")}
              </Button>
            </>
          )}
        </div>
      )}
      {shown === "removing" ? (
        <>
          <input type="hidden" name="removeKey" value="true" />
          <Notice kind="warn" title={t("removeWarning")} />
        </>
      ) : null}
      <p id="scan-key-hint" className="text-xs text-muted">
        {stored === "set" ? `${t("keyHint")} ${t("keyMoves")}` : t("keyHint")}
      </p>
    </div>
  );
};
