import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { readSecret } from "./io.js";

/** A fake terminal: what's typed goes in, and everything shown is collected. */
const terminal = () => {
  const input = Object.assign(new PassThrough(), {
    raw: [] as boolean[],
    isRaw: false,
    setRawMode(this: { raw: boolean[]; isRaw: boolean }, raw: boolean) {
      this.raw.push(raw);
      this.isRaw = raw;
    },
  });
  let shown = "";
  const output = { write: (text: string) => (shown += text) };
  return { input, output, shown: () => shown };
};

describe("readSecret", () => {
  it("shows a star per character, never the password, and turns raw mode off again", async () => {
    const t = terminal();
    const answer = readSecret("Password: ", t);
    t.input.write("correct horse\r");
    expect(await answer).toBe("correct horse");
    expect(t.shown()).toBe(`Password: ${"*".repeat(13)}\n`);
    expect(t.shown()).not.toContain("correct");
    expect(t.input.raw).toEqual([true, false]);
  });

  it("takes a character back on backspace, in pieces as typed", async () => {
    const t = terminal();
    const answer = readSecret("Password: ", t);
    t.input.write("secrex");
    t.input.write("\u007f");
    t.input.write("t\n");
    expect(await answer).toBe("secret");
    expect(t.shown()).toBe("Password: ******\b \b*\n");
  });

  it("ignores a backspace with nothing typed, and control characters", async () => {
    const t = terminal();
    const answer = readSecret("Password: ", t);
    t.input.write("\u007fa\u001bb\r");
    expect(await answer).toBe("ab");
    expect(t.shown()).toBe("Password: **\n");
  });

  it("cancels on Ctrl-C", async () => {
    const t = terminal();
    const answer = readSecret("Password: ", t);
    t.input.write("abc\u0003");
    await expect(answer).rejects.toMatchObject({ code: "cancelled", exitCode: 1 });
    expect(t.input.raw).toEqual([true, false]);
  });
});
