"use server";

import type { ItemType } from "@ronneai/core";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  dependencyReports,
  searchDependencies,
} from "@/server/domains/submissions/actions/composer";
import type { DependencyReport, PickerPage } from "@/server/domains/submissions/models/composer";
import { requestHeaders } from "@/server/http/request-headers";

export type ReportsResult =
  | { ok: true; reports: Record<string, DependencyReport> }
  | { ok: false; error: string };

/** What the registry says about a draft's dependencies, for the canvas's nodes (feature 031). */
export const dependencyReportsAction = async (input: {
  itemName: string;
  type: ItemType;
  dependencies: Record<string, string>;
}): Promise<ReportsResult> => {
  try {
    return { ok: true, reports: await dependencyReports(await requestHeaders(), input) };
  } catch (error) {
    if (error instanceof IdentityError) return { ok: false, error: error.message };
    throw error;
  }
};

export type PickerResult = ({ ok: true } & PickerPage) | { ok: false; error: string };

/** The catalogue for the picker: published items a draft of `type` may depend on (feature 031). */
export const searchDependenciesAction = async (input: {
  type: ItemType;
  q: string;
  only: ItemType | null;
  cursor?: string;
}): Promise<PickerResult> => {
  try {
    return { ok: true, ...(await searchDependencies(await requestHeaders(), input)) };
  } catch (error) {
    if (error instanceof IdentityError) return { ok: false, error: error.message };
    throw error;
  }
};
