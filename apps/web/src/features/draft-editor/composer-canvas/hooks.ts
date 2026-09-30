"use client";

import type { ItemType } from "@ronneai/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEPENDENCY_REPORTS_MAX } from "@/server/domains/submissions/models/composer";
import { useDebounced } from "../hooks";
import { dependencyReportsAction } from "./actions";
import type { DependencyReport } from "./types";

/** A report is about a name and the range it was asked with. */
const keyOf = (name: string, range: string) => `${name}\n${range}`;

/**
 * What the registry says about each dependency, asked once typing pauses and kept by name and
 * range, so an answer is asked for once. While a changed range is on its way, the node keeps the
 * item's facts and shows no registry problems. `failed` is true when the registry couldn't be asked.
 */
export const useDependencyReports = (
  itemName: string,
  type: ItemType,
  dependencies: Readonly<Record<string, string>>,
): { reports: Record<string, DependencyReport | undefined>; failed: boolean } => {
  const [known, setKnown] = useState<Record<string, DependencyReport>>({});
  const [failed, setFailed] = useState(false);
  const asked = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const settled = useDebounced(dependencies, 300);
  useEffect(() => {
    const missing = Object.entries(settled).filter(
      ([name, range]) => !asked.current.has(keyOf(name, range)),
    );
    if (missing.length === 0) return;
    for (const [name, range] of missing) asked.current.add(keyOf(name, range));
    const ask = async () => {
      // A request reports on a bounded number, so a large set is asked for in parts.
      for (let from = 0; from < missing.length; from += DEPENDENCY_REPORTS_MAX) {
        const part = missing.slice(from, from + DEPENDENCY_REPORTS_MAX);
        try {
          const result = await dependencyReportsAction({
            itemName,
            type,
            dependencies: Object.fromEntries(part),
          });
          if (!result.ok) throw new Error(result.error);
          if (!mounted.current) return;
          setFailed(false);
          setKnown((current) => ({
            ...current,
            ...Object.fromEntries(
              part.flatMap(([name, range]) => {
                const report = result.reports[name];
                return report ? [[keyOf(name, range), report]] : [];
              }),
            ),
          }));
        } catch {
          // Asked again with the next change.
          for (const [name, range] of missing.slice(from)) asked.current.delete(keyOf(name, range));
          if (mounted.current) setFailed(true);
          return;
        }
      }
    };
    void ask();
  }, [settled, itemName, type]);

  const reports = useMemo(() => {
    const facts = new Map(
      Object.entries(known).map(([key, report]) => [key.split("\n")[0], report.facts]),
    );
    return Object.fromEntries(
      Object.entries(dependencies).map(([name, range]) => {
        const report = known[keyOf(name, range)];
        if (report) return [name, report];
        return [
          name,
          facts.has(name) ? { facts: facts.get(name) ?? null, problems: [] } : undefined,
        ];
      }),
    );
  }, [known, dependencies]);

  return { reports, failed };
};
