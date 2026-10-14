import { expect, it } from "vitest";
import { version } from "../../../package.json";
import { createLogger } from "../log/logger";
import { logStarted, startRuntime } from "./started";

const collect = () => {
  const lines: Record<string, unknown>[] = [];
  const log = createLogger({
    level: "info",
    format: "json",
    write: (line) => lines.push(JSON.parse(line)),
  });
  return { lines, log };
};

it("writes server.started with the version, dialect, runtime and port, never an address", () => {
  const { lines, log } = collect();
  logStarted(
    { mode: "ready", applied: [], dialect: "postgres" },
    {
      RONNE_RUNTIME: "docker",
      PORT: "7650",
      DATABASE_URL: "postgres://u:pw@db/x",
      PUBLIC_URL: "https://r.test",
    },
    log,
  );
  expect(lines).toEqual([
    expect.objectContaining({
      level: "info",
      event: "server.started",
      version,
      dialect: "postgres",
      runtime: "docker",
      port: 7650,
    }),
  ]);
  expect(JSON.stringify(lines)).not.toMatch(/pw|db\/x|r\.test/);
});

it("says when setup is still to do, and defaults the port to 3000", () => {
  const { lines, log } = collect();
  logStarted({ mode: "setup-required" }, {}, log);
  expect(lines[0]).toMatchObject({ setup: "required", runtime: "node", port: 3000 });
  expect(lines[0]).not.toHaveProperty("dialect");
});

it("knows the bundle from the npm package", () => {
  expect(startRuntime({ RONNE_RUNTIME: "npm", RONNE_BUNDLE: "1" })).toBe("bundle");
  expect(startRuntime({ RONNE_RUNTIME: "npm" })).toBe("npm");
  expect(startRuntime({})).toBe("node");
});
