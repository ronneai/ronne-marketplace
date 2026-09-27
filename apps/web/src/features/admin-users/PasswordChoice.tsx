"use client";

import { useState } from "react";
import { Label } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";

/** Generate a password (the default) or type one (12–128 characters). */
export const PasswordChoice = ({ idPrefix }: { idPrefix: string }) => {
  const [mode, setMode] = useState<"generate" | "type">("generate");
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-semibold text-fg">Password</legend>
      {(
        [
          ["generate", "Generate one (20 characters)"],
          ["type", "Type one"],
        ] as const
      ).map(([value, label]) => (
        <label key={value} className="flex items-center gap-2 text-sm text-fg">
          <input
            type="radio"
            name="passwordMode"
            value={value}
            checked={mode === value}
            onChange={() => setMode(value)}
            className="size-4 accent-(--accent)"
          />
          {label}
        </label>
      ))}
      {mode === "type" ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-password`}>New password</Label>
          <PasswordInput
            id={`${idPrefix}-password`}
            name="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
          <p className="text-xs text-muted">12 to 128 characters.</p>
        </div>
      ) : null}
    </fieldset>
  );
};
