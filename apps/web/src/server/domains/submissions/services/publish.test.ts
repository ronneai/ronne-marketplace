import { describe, expect, it } from "vitest";
import type { Item } from "../../items/models/item";
import { ItemNameTakenError } from "../exceptions/errors";
import { ownItem } from "./publish";

/** An item store that knows one item, under `fullName`, and some old names. */
const store = (found: Pick<Item, "fullName"> | null, oldNames: string[] = []) => ({
  findByName: async () => found as Item | null,
  isOldName: async (name: string) => oldNames.includes(name),
});

const submission = {
  workspace: { id: "w", name: "global" },
  scope: { id: "s", name: "team" },
  name: "deploy",
};

describe("ownItem: the item a release goes into (118)", () => {
  it("is the item with the submission's name, or none yet", async () => {
    expect(await ownItem(store({ fullName: "@team/deploy" }), submission)).toEqual({
      fullName: "@team/deploy",
    });
    expect(await ownItem(store(null), submission)).toBeNull();
  });

  it("never the item an old name belongs to, seen or not", async () => {
    await expect(ownItem(store({ fullName: "@acme/team/deploy" }), submission)).rejects.toThrow(
      new ItemNameTakenError("@team/deploy", "taken"),
    );
    await expect(ownItem(store(null, ["@team/deploy"]), submission)).rejects.toThrow(
      new ItemNameTakenError("@team/deploy", "taken"),
    );
  });
});
