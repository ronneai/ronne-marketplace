import { describe, expect, it } from "vitest";
import {
  InvalidInputError,
  MissingInputError,
  nonInteractivePrompts,
} from "./non-interactive-prompts";

const silent = { stdout: () => {}, stderr: () => {} };

describe("nonInteractivePrompts", () => {
  it("answers from the given values, falling back to the question's default", async () => {
    const prompts = nonInteractivePrompts({ rootEmail: "root@example.com" }, silent);
    expect(await prompts.text({ id: "root.email", message: "" })).toBe("root@example.com");
    expect(
      await prompts.text({ id: "public_url", message: "", initial: "http://localhost:3000" }),
    ).toBe("http://localhost:3000");
    expect(await prompts.confirm({ id: "database.reuse", message: "", initial: true })).toBe(true);
    expect(prompts.interactive).toBe(false);
  });

  it("names the variable to set when a value is missing", async () => {
    const prompts = nonInteractivePrompts({}, silent);
    await expect(prompts.text({ id: "root.email", message: "" })).rejects.toThrowError(
      MissingInputError,
    );
    await expect(prompts.text({ id: "root.email", message: "" })).rejects.toThrowError(
      /RONNE_ROOT_EMAIL/,
    );
    await expect(
      prompts.select({ id: "database.kind", message: "", choices: [] }),
    ).rejects.toThrowError(/DATABASE_URL/);
    await expect(prompts.password({ id: "root.password", message: "" })).rejects.toThrowError(
      /RONNE_ROOT_PASSWORD/,
    );
  });

  it("fails on an invalid value instead of asking again", async () => {
    const prompts = nonInteractivePrompts({ rootPassword: "short" }, silent);
    const validate = (v: string) => (v.length < 12 ? "too short" : undefined);
    await expect(
      prompts.password({ id: "root.password", message: "", validate }),
    ).rejects.toThrowError(InvalidInputError);
  });

  it("writes plain lines: progress to stdout, problems to stderr", () => {
    const out: string[] = [];
    const err: string[] = [];
    const prompts = nonInteractivePrompts(
      {},
      { stdout: (l) => out.push(l), stderr: (l) => err.push(l) },
    );
    prompts.log.success("done");
    prompts.log.warn("careful");
    prompts.log.error("broken");
    expect(out).toEqual(["✓ done"]);
    expect(err).toEqual(["! careful", "✗ broken"]);
  });
});
