"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

const Loading = () => {
  const t = useTranslations("item.overview.dependencies");
  return <p className="grid h-full place-items-center text-sm text-muted">{t("loading")}</p>;
};

/** React Flow loads only on pages that show the canvas, and only in the browser. */
export const DependencyGraph = dynamic(
  () => import("./DependencyCanvas").then((module) => module.DependencyCanvas),
  {
    ssr: false,
    loading: Loading,
  },
);
