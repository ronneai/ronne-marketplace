import { afterAll } from "vitest";
import { dropSharedTestDb } from "./test-db";

// The db project's setup file (112): each test file's shared database is dropped after it.
afterAll(dropSharedTestDb);
