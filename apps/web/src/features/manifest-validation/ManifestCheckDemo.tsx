"use client";

import { parseManifest } from "@ronneai/core";
import { useDeferredValue, useMemo, useState } from "react";
import { inputClasses } from "@/components/ui/Field";
import { IssueList } from "./IssueList";

const SAMPLE = `name: "@platform/code-reviewer"
type: agent
description: Reviews diffs for correctness and security issues.
agent:
  prompt: prompt.md
  model: smart
colour: blue
`;

/**
 * `@ronneai/core`'s validation running in the browser (feature 011): edit the manifest and the
 * problems update as you type. The styleguide shows it; the submission editor (012) builds on it.
 */
export const ManifestCheckDemo = () => {
  const [text, setText] = useState(SAMPLE);
  const deferred = useDeferredValue(text);
  const { issues } = useMemo(() => parseManifest(deferred), [deferred]);
  return (
    <div className="grid gap-3">
      <label htmlFor="manifest-demo" className="text-sm font-semibold text-fg">
        ronne.yaml
      </label>
      <textarea
        id="manifest-demo"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={9}
        spellCheck={false}
        className={`${inputClasses} h-auto py-2 font-mono text-[13px]`}
      />
      <IssueList issues={issues} />
    </div>
  );
};
