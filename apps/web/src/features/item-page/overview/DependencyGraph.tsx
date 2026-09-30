"use client";

import dynamic from "next/dynamic";

/** React Flow loads only on pages that show the canvas, and only in the browser. */
export const DependencyGraph = dynamic(
  () => import("./DependencyCanvas").then((module) => module.DependencyCanvas),
  {
    ssr: false,
    loading: () => (
      <p className="grid h-full place-items-center text-sm text-muted">Loading the canvas…</p>
    ),
  },
);
