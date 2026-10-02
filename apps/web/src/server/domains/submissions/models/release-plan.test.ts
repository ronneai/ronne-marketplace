import { describe, expect, it } from "vitest";
import { planReleases, type ReleaseTarget } from "./release-plan";

const fresh: ReleaseTarget = { id: "a", name: "@team/new", published: [], suggested: null };
const proposal: ReleaseTarget = {
  id: "b",
  name: "@team/github",
  published: ["1.0.0", "1.2.0"],
  suggested: "patch",
};

describe("planReleases (055)", () => {
  it("releases a new item as 1.0.0 on latest, whatever the bump", () => {
    expect(planReleases([fresh], { kind: "stable", bump: "major" })).toEqual([
      {
        id: "a",
        name: "@team/new",
        ok: true,
        version: "1.0.0",
        tag: "latest",
        choice: { kind: "stable", bump: "major" },
        bump: null,
        suggested: false,
      },
    ]);
  });

  it("uses each proposal's suggested bump, or one bump for all", () => {
    expect(planReleases([proposal], { kind: "stable", bump: "suggested" })[0]).toMatchObject({
      version: "1.2.1",
      bump: "patch",
      suggested: true,
    });
    expect(planReleases([proposal], { kind: "stable", bump: "major" })[0]).toMatchObject({
      version: "2.0.0",
      bump: "major",
      suggested: false,
    });
    // No suggestion: the publish dialog's default, minor.
    expect(
      planReleases([{ ...proposal, suggested: null }], { kind: "stable", bump: "suggested" })[0],
    ).toMatchObject({ version: "1.3.0", bump: "minor", suggested: false });
  });

  it("makes pre-releases on next, and refuses a bad pre-release id", () => {
    const [first, later] = planReleases([fresh, proposal], {
      kind: "prerelease",
      id: "beta",
      bump: "suggested",
    });
    expect(first).toMatchObject({ version: "1.0.0-beta.1", tag: "next" });
    expect(later).toMatchObject({ version: "1.2.1-beta.1", tag: "next" });
    expect(
      planReleases([fresh], { kind: "prerelease", id: "Beta!", bump: "minor" })[0],
    ).toMatchObject({ ok: false, problem: expect.stringContaining("pre-release id") });
  });

  it("takes one tag for all, checked against each version", () => {
    expect(
      planReleases([fresh, proposal], { kind: "stable", bump: "suggested", tag: " stable " }).map(
        (p) => p.ok && p.tag,
      ),
    ).toEqual(["stable", "stable"]);
    expect(
      planReleases([fresh], { kind: "prerelease", id: "rc", bump: "minor", tag: "latest" })[0],
    ).toMatchObject({ ok: false, problem: expect.stringContaining("latest can only point") });
    expect(planReleases([fresh], { kind: "stable", bump: "minor", tag: "v1" })[0]).toMatchObject({
      ok: false,
    });
  });
});
