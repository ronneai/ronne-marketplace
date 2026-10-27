import { describe, expect, it } from "vitest";
import type { CurrentUser } from "../../identity/models/user";
import type { CatalogueEntry } from "../../items/models/catalogue";
import type { CatalogueRepository } from "../../items/repositories/catalogue-repository";
import type { RegistryLookup } from "../repositories/registry-lookup";
import type { SubmissionRepository } from "../repositories/submission-repository";
import { findDependencies } from "./dependency-search";

const user = { id: "u1", email: "a@example.test", name: "A", role: "user", workspaces: {} };
const entry = {
  id: "item-1",
  workspace: "acme",
  privateWorkspace: false,
  personalWorkspace: false,
  scope: "acme",
  name: "rule",
  type: "rule",
  version: "1.1.0",
  description: "",
} as CatalogueEntry;

const published = (version: string, publishedAt: Date) => ({
  id: version,
  version,
  publishedAt,
  artifactPath: "",
  sha256: "",
  yanked: false,
  dependencies: {},
});

/** Offers `entry` as published by someone else, with these versions. */
const versionsOffered = async (versions: ReturnType<typeof published>[]) => {
  const options = await findDependencies(
    {
      repo: { listOwnUnreleased: async () => [] } as unknown as SubmissionRepository,
      registry: { publishedVersions: async () => versions } as unknown as RegistryLookup,
      catalogue: {
        list: async (query: { ownerId?: string }) => (query.ownerId ? [] : [entry]),
      } as unknown as CatalogueRepository,
    },
    { user: user as unknown as CurrentUser, ip: null },
    { type: "skill", q: "" },
  );
  return options[0]?.versions;
};

describe("findDependencies: the order of an item's versions", () => {
  it("lists the later release first", async () => {
    expect(
      await versionsOffered([
        published("1.0.0", new Date(1000)),
        published("1.1.0", new Date(2000)),
      ]),
    ).toEqual(["1.1.0", "1.0.0"]);
  });

  it("puts the higher version first when two were published in the same millisecond", async () => {
    const at = new Date(1000);
    const forward = await versionsOffered([published("1.0.0", at), published("1.1.0", at)]);
    const backward = await versionsOffered([published("1.1.0", at), published("1.0.0", at)]);
    expect(forward).toEqual(["1.1.0", "1.0.0"]);
    expect(backward).toEqual(["1.1.0", "1.0.0"]);
  });
});
