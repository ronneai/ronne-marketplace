import { describe, expect, it } from "vitest";
import { WorkspaceNameTakenError, WorkspaceNotEmptyError } from "../exceptions/errors";
import type { Workspace } from "../models/workspace";
import type { WorkspaceRepository } from "../repositories/workspace-repository";
import { createWorkspace, deleteWorkspace } from "./workspaces";

const root = {
  id: "root",
  email: "root@example.com",
  name: "Root",
  role: "root" as const,
  workspaces: {},
};

const taken: Workspace = {
  id: "other",
  name: "race",
  description: "Theirs.",
  visibility: "public",
  isGlobal: false,
  scopes: 0,
  createdBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Another root's workspace lands between this one's check and its insert, so the insert hits the
 * unique index. The databases only show it when the two really overlap, so it's forced here.
 */
const racingRepo = (): WorkspaceRepository => {
  let committed = false;
  const repo: WorkspaceRepository = {
    transaction: (work) => work(repo),
    findByName: async () => (committed ? taken : null),
    insert: async () => {
      committed = true;
      throw new Error("UNIQUE constraint failed: workspaces.name");
    },
    updateDescription: async () => {},
    delete: async () => {},
    list: async () => [],
    page: async () => ({ rows: [], next: null, previous: null }),
    count: async () => ({ count: 0, capped: false }),
    recordAudit: async () => {},
  };
  return repo;
};

describe("createWorkspace", () => {
  it("answers that the name is taken when the unique index refuses it", async () => {
    await expect(
      createWorkspace(
        { repo: racingRepo() },
        { user: root, ip: null },
        { name: "race", description: "Mine." },
      ),
    ).rejects.toThrow(WorkspaceNameTakenError);
  });

  it("passes any other failure on", async () => {
    const repo = racingRepo();
    repo.findByName = async () => null;
    await expect(
      createWorkspace({ repo }, { user: root, ip: null }, { name: "race", description: "Mine." }),
    ).rejects.toThrow("UNIQUE constraint failed");
  });
});

describe("deleteWorkspace", () => {
  it("answers that the workspace isn't empty when a scope lands after the count", async () => {
    const repo = racingRepo();
    let scopes = 0;
    repo.findByName = async () => ({ ...taken, scopes });
    repo.delete = async () => {
      scopes = 1;
      throw new Error("FOREIGN KEY constraint failed");
    };
    await expect(
      deleteWorkspace({ repo }, { user: root, ip: null }, { name: "race" }),
    ).rejects.toThrow(WorkspaceNotEmptyError);
  });
});
