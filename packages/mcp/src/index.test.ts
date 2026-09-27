import { describe, expect, it } from "vitest";
import { serverInfo } from "./index.js";

describe("serverInfo", () => {
  it("names the registry server", () => {
    expect(serverInfo.name).toBe("ronne-registry");
  });
});
