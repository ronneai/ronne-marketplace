"use client";

import { useTranslations } from "next-intl";
import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { FieldError, Input, inputClasses, Label } from "./Field";

/**
 * A one-time code in separate boxes, a digit each (feature 157): typing moves on to the next box,
 * Backspace on an empty one goes back, the arrows move, and a paste (or an autofill from a text
 * message, which puts the whole code in the first box) is spread across them. The form posts one
 * field, `name`, with the digits joined. When the last digit lands the form is submitted, once.
 *
 * Before JavaScript runs it is a plain numeric field with the same name, so a form using it still
 * works without. `resetKey` is anything that changes when the form came back (an action's state):
 * the boxes are emptied and the first one is focused, for another try.
 */
export const CodeInput = ({
  id,
  name,
  label,
  length = 6,
  error,
  resetKey,
  autoFocus = false,
}: {
  id: string;
  name: string;
  label: string;
  length?: number;
  error?: string;
  resetKey?: unknown;
  autoFocus?: boolean;
}) => {
  const t = useTranslations("common.codeInput");
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(""));
  const [enhanced, setEnhanced] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const hidden = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);
  const first = useRef(true);
  const value = digits.join("");
  const complete = value.length === length;

  useEffect(() => {
    setEnhanced(true);
  }, []);
  // The boxes replace the plain field after mounting, so focus goes to the first once they exist.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `enhanced` is what puts the boxes there
  useEffect(() => {
    if (enhanced && autoFocus) boxes.current[0]?.focus();
  }, [enhanced]);

  // The form came back: empty the boxes for another try.
  // biome-ignore lint/correctness/useExhaustiveDependencies: it runs when `resetKey` changes
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setDigits(Array(length).fill(""));
    boxes.current[0]?.focus();
  }, [resetKey]);

  useEffect(() => {
    if (!complete) {
      submitted.current = false;
      return;
    }
    if (submitted.current) return;
    submitted.current = true;
    hidden.current?.form?.requestSubmit();
  }, [complete]);

  if (!enhanced) {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          name={name}
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={length + 1}
          autoFocus={autoFocus}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <FieldError id={`${id}-error`}>{error}</FieldError>
      </div>
    );
  }

  // From box `at`, put the digits of `text` in, and focus the box after the last one.
  const fill = (at: number, text: string) => {
    const typed = text.replace(/\D/g, "").slice(0, length - at);
    if (!typed) return;
    const next = [...digits];
    for (const [i, digit] of [...typed].entries()) next[at + i] = digit;
    setDigits(next);
    boxes.current[Math.min(at + typed.length, length - 1)]?.focus();
  };
  const onKeyDown = (at: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[at] && at > 0) {
      event.preventDefault();
      setDigits(digits.map((d, i) => (i === at - 1 ? "" : d)));
      boxes.current[at - 1]?.focus();
    } else if (event.key === "ArrowLeft" && at > 0) {
      event.preventDefault();
      boxes.current[at - 1]?.focus();
    } else if (event.key === "ArrowRight" && at < length - 1) {
      event.preventDefault();
      boxes.current[at + 1]?.focus();
    }
  };
  const onPaste = (at: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    fill(at, event.clipboardData.getData("text"));
  };
  const onChange = (at: number, text: string) => {
    // Emptied (or a letter): the box clears. Otherwise the digits go in from here.
    if (!/\d/.test(text)) {
      setDigits(digits.map((d, i) => (i === at ? "" : d)));
      return;
    }
    fill(at, text);
  };

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id}-0`}>{label}</Label>
      <div className="flex gap-2">
        {digits.map((digit, i) => (
          <input
            // biome-ignore lint/suspicious/noArrayIndexKey: the boxes are positions, and never reorder
            key={i}
            id={`${id}-${i}`}
            ref={(element) => {
              boxes.current[i] = element;
            }}
            value={digit}
            onChange={(event) => onChange(i, event.target.value)}
            onKeyDown={(event) => onKeyDown(i, event)}
            onPaste={(event) => onPaste(i, event)}
            onFocus={(event) => event.target.select()}
            aria-label={t("digit", { label, n: i + 1, total: length })}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            autoComplete={i === 0 ? "one-time-code" : "off"}
            inputMode="numeric"
            className={cn(inputClasses, "min-w-0 flex-1 px-0 text-center font-mono text-lg")}
          />
        ))}
      </div>
      <input ref={hidden} type="hidden" name={name} value={value} />
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
};
