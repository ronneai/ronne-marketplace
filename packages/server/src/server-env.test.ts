import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSetUp, serverEnv } from "./server-env.js";

describe("the environment rmk-server gives the web app (082)", () => {
  it("sets the runtime, the data folder, its .env, the port and the host", () => {
    expect(serverEnv({ env: {}, dataDir: "/d", port: 7650, host: "127.0.0.1" })).toEqual({
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      RONNE_RUNTIME: "npm",
      RONNE_DATA_DIR: "/d",
      RONNE_ENV_FILE: join("/d", ".env"),
      PORT: "7650",
      HOSTNAME: "127.0.0.1",
    });
  });

  it("keeps what the person set, and never sets PUBLIC_URL", () => {
    const env = serverEnv({
      env: {
        RONNE_ENV_FILE: "/etc/ronne.env",
        NODE_ENV: "development",
        PUBLIC_URL: "https://x.example",
      },
      dataDir: "/d",
      port: 1,
    });
    expect(env.RONNE_ENV_FILE).toBe("/etc/ronne.env");
    expect(env.NODE_ENV).toBe("development");
    expect(env).not.toHaveProperty("PUBLIC_URL");
    expect(env).not.toHaveProperty("HOSTNAME");
  });

  it("knows a set-up instance by DATABASE_URL in its settings", () => {
    expect(isSetUp(undefined)).toBe(false);
    expect(isSetUp("PUBLIC_URL=http://x\n")).toBe(false);
    expect(isSetUp("DATABASE_URL=\n")).toBe(false);
    expect(isSetUp("A=1\nDATABASE_URL=file:/d/ronne.db\n")).toBe(true);
  });
});
