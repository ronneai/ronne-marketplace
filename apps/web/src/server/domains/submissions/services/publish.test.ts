import { describe, expect, it } from "vitest";
import type { Item } from "../../items/models/item";
import { ItemMovedError, ItemNameTakenError } from "../exceptions/errors";
import { ownItem } from "./publish";

/** An item store that knows one item, under `fullName`, and some old names. */
const store = (
  found: Pick<Item, "fullName"> | Pick<Item, "id" | "fullName"> | null,
  oldNames: string[] = [],
) => ({
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

  it("refuses its own item under an old name as moved (134), only for that item's proposal", async () => {
    const found = { id: "item-1", fullName: "@team2/deploy" };
    await expect(
      ownItem(store(found), { ...submission, proposal: { itemId: "item-1" } }),
    ).rejects.toThrow(new ItemMovedError("@team/deploy"));
    await expect(
      ownItem(store(found), { ...submission, proposal: { itemId: "item-2" } }),
    ).rejects.toThrow(new ItemNameTakenError("@team/deploy", "taken"));
  });
});
