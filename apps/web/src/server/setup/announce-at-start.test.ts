import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createLogger } from "../log/logger";
import { announceSetupCodeAtStart } from "./announce-at-start";
import { announceSetupCode, resetSetupCodeShown } from "./announce-setup-code";
import { readSetupCode } from "./setup-code";
import type { SetupState } from "./state";

const dir = mkdtempSync(join(tmpdir(), "ronne-announce-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => resetSetupCodeShown());

let runs = 0;
const setUp = () => {
  const data = join(dir, `run-${runs++}`);
  const lines: Record<string, unknown>[] = [];
  const log = createLogger({
    level: "debug",
    format: "json",
    write: (line) => lines.push(JSON.parse(line)),
  });
  // The npm package's data folder, so the file lands in this test's folder.
  const env = {
    RONNE_RUNTIME: "npm",
    RONNE_DATA_DIR: data,
    RONNE_ENV_FILE: join(data, "none.env"),
    PORT: "7650",
  };
  return { data, lines, log, env };
};

describe("announceSetupCodeAtStart (161: pnpm dev and pnpm start)", () => {
  it.each<SetupState>(["not_configured", "incomplete"])(
    "makes and logs the code when the instance is %s",
    async (state) => {
      const { data, lines, log, env } = setUp();
      const code = await announceSetupCodeAtStart({ env, log, getState: async () => state });
      expect(code).not.toBeNull();
      expect(readSetupCode(join(data, "setup-code"))).toBe(code);
      expect(lines.filter((line) => line.event === "server.setup_code")).toEqual([
        expect.objectContaining({ url: "http://localhost:7650" }),
      ]);
    },
  );

  it("reads the settings when no state is given: a new instance isn't configured", async () => {
    const { data, log, env } = setUp();
    const code = await announceSetupCodeAtStart({ env, log });
    expect(readSetupCode(join(data, "setup-code"))).toBe(code);
  });

  it.each<SetupState>(["ready", "unavailable"])(
    "shows nothing when the instance is %s",
    async (state) => {
      const { data, lines, log, env } = setUp();
      expect(await announceSetupCodeAtStart({ env, log, getState: async () => state })).toBeNull();
      expect(readSetupCode(join(data, "setup-code"))).toBeNull();
      expect(lines).toEqual([]);
    },
  );

  it.skipIf(process.getuid?.() === 0)(
    "logs setup.code_unwritable when the data folder can't be written, and goes on",
    async () => {
      const { data, lines, log, env } = setUp();
      mkdirSync(data);
      chmodSync(data, 0o555);
      try {
        expect(
          await announceSetupCodeAtStart({ env, log, getState: async () => "not_configured" }),
        ).toBeNull();
      } finally {
        chmodSync(data, 0o755);
      }
      expect(lines).toEqual([
        expect.objectContaining({ level: "error", event: "setup.code_unwritable" }),
      ]);
    },
  );

  it("doesn't show it again when the start script already did", async () => {
    const { data, lines, log, env } = setUp();
    announceSetupCode({ path: join(data, "setup-code"), url: "http://localhost:7650", log });
    lines.length = 0;
    let asked = false;
    const getState = async (): Promise<SetupState> => {
      asked = true;
      return "not_configured";
    };
    expect(await announceSetupCodeAtStart({ env, log, getState })).toBeNull();
    expect(asked).toBe(false);
    expect(lines).toEqual([]);
  });
});
