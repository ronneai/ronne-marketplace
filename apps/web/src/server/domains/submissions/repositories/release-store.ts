import type { ItemRepository } from "../../items/repositories/item-repository";
import type { SubmissionRepository } from "./submission-repository";

/**
 * One transaction over submissions and items, for publishing (feature 015): the submission
 * becomes `published` in the same transaction that creates its version, or neither happens.
 */
export interface ReleaseStore {
  transaction<T>(
    work: (tx: { submissions: SubmissionRepository; items: ItemRepository }) => Promise<T>,
  ): Promise<T>;
}
