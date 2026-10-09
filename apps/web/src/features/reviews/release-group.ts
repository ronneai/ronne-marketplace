import { prepareRelease } from "@/server/domains/submissions/actions/publish";
import type { ReleaseMember } from "./types";

/**
 * What the Release dialog needs about an approved item's group (112): its approved dependencies
 * not released yet, which go out with it, or why it can't go now (one still in review, or not the
 * person's to release).
 */
export const releaseGroupFor = async (
  headers: Headers,
  id: string,
): Promise<{ blocked: string | null; goesWith: ReleaseMember[] }> => {
  const { candidates, refused } = await prepareRelease(headers, { ids: [id] });
  const refusal = refused.find((r) => r.id === id);
  return {
    blocked: refusal && refusal.result === "not_releasable" ? refusal.reason : null,
    goesWith: candidates
      .filter((candidate) => candidate.id !== id)
      .map((candidate) => ({
        name: candidate.name,
        published: candidate.published,
        suggested: candidate.suggested,
      })),
  };
};
