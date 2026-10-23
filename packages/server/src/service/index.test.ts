import { describe, expect, it } from "vitest";
import { fakeSystem } from "./fake-system.js";
import { runService, serviceTarget } from "./index.js";

const program = {
  node: "C:\\Program Files\\nodejs\\node.exe",
  entry: "C:\\rmk\\bin.js",
  version: "0.5.1",
};
const defaults = { port: 7650, host: "127.0.0.1", tls: "auto" as const, user: false };

describe("rmk-server service on Windows (#222)", () => {
  it("refuses every action in one line, and points at WSL 2 or Linux", async () => {
    for (const command of [
      { kind: "service", action: "install", options: defaults },
      { kind: "service", action: "install", options: { ...defaults, user: true } },
      { kind: "service", action: "uninstall", deleteData: true },
      { kind: "service", action: "status" },
      { kind: "service", action: "start" },
      { kind: "service", action: "stop" },
      { kind: "service", action: "restart" },
      { kind: "service", action: "logs" },
    ] as const) {
      const sys = fakeSystem({ platform: "win32" });
      sys.files.set("C:\\ProgramData\\RonneAI\\Marketplace\\.env", { content: "", mode: 0o600 });
      expect(await runService(sys, command, program)).toBe(1);
      expect(sys.errors).toEqual([
        "rmk-server: service isn't available on Windows. Run rmk-server start in a terminal, or run Ronne in WSL 2 or Linux to start it at boot: https://www.ronne.ai/marketplace/docs/install#windows\n",
      ]);
      // Nothing was run, made or removed.
      expect(sys.commands).toEqual([]);
      expect(sys.dirs.size).toBe(0);
      expect([...sys.files.keys()]).toEqual(["C:\\ProgramData\\RonneAI\\Marketplace\\.env"]);
      expect(sys.output).toEqual([]);
    }
  });

  it("still prints service --help", async () => {
    const sys = fakeSystem({ platform: "win32" });
    expect(await runService(sys, { kind: "service-help" }, program)).toBe(0);
    expect(sys.output.join("")).toContain("rmk-server service");
  });

  it("has no service target, so the scripts run on the data folder", () => {
    expect(serviceTarget(fakeSystem({ platform: "win32" }), program)).toHaveProperty("error");
  });
});
