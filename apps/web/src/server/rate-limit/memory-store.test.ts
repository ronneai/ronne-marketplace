import { describe } from "vitest";
import { createMemoryRateLimitStore } from "./memory-store";
import { storeRules } from "./testing/store-rules";

describe("the memory store", () => {
  storeRules(async () => createMemoryRateLimitStore());
});
