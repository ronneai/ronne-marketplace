import { spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  checkSetupCode,
  deleteSetupCode,
  ensureSetupCode,
  formatSetupCode,
  makeSetupCode,
  normaliseSetupCode,
  readSetupCode,
  SETUP_CODE_LENGTH,
  SetupCodeFileError,
  setupCodePath,
} from "./setup-code";

const dir = mkdtempSync(join(tmpdir(), "ronne-setup-code-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let folders = 0;
const freshFolder = () => {
  const folder = join(dir, `case-${folders++}`);
  mkdirSync(folder);
  return folder;
};

const CROCKFORD = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

describe("makeSetupCode", () => {
  it("is 26 characters of Crockford base32 holding 128 bits", () => {
    for (let index = 0; index < 200; index++) {
      const code = makeSetupCode();
      expect(code).toHaveLength(SETUP_CODE_LENGTH);
      expect(code).toMatch(CROCKFORD);
    }
  });

  it("uses every value the first character can hold, and only those", () => {
    const firsts = new Set(Array.from({ length: 400 }, () => makeSetupCode()[0]));
    expect([...firsts].sort().join("")).toBe("01234567");
  });

  it("is different every time", () => {
    const codes = new Set(Array.from({ length: 500 }, makeSetupCode));
    expect(codes.size).toBe(500);
  });
});

describe("formatSetupCode", () => {
  it("shows the code in groups of five", () => {
    expect(formatSetupCode("0KQ2MABCDEFGHJKMNPQRSTVWXY")).toBe("0KQ2M-ABCDE-FGHJK-MNPQR-STVWX-Y");
  });

  it("reads back as the same code", () => {
    const code = makeSetupCode();
    expect(normaliseSetupCode(formatSetupCode(code))).toBe(code);
  });
});

describe("normaliseSetupCode", () => {
  const code = "1KQ2MABCDEFGHJKMNPQRSTVWX0";

  it.each([
    ["the code itself", code],
    ["lower case", code.toLowerCase()],
    ["mixed case", "1kQ2mAbCdEfGhJkMnPqRsTvWx0"],
    ["dashes", "1KQ2M-ABCDE-FGHJK-MNPQR-STVWX-0"],
    ["spaces", "1KQ2M ABCDE FGHJK MNPQR STVWX 0"],
    ["spaces and dashes around", "  1KQ2M - ABCDE-FGHJK  MNPQR-STVWX-0 \n"],
    ["a tab and a non-breaking space", "1KQ2M\tABCDE FGHJKMNPQRSTVWX0"],
    ["O for zero", "1KQ2MABCDEFGHJKMNPQRSTVWXO"],
    ["lower-case o for zero", "1KQ2MABCDEFGHJKMNPQRSTVWXo"],
    ["I for one", "IKQ2MABCDEFGHJKMNPQRSTVWX0"],
    ["L for one", "LKQ2MABCDEFGHJKMNPQRSTVWX0"],
    ["lower-case l for one", "lKQ2MABCDEFGHJKMNPQRSTVWX0"],
  ])("accepts %s", (_, typed) => {
    expect(normaliseSetupCode(typed)).toBe(code);
  });

  it.each([
    ["nothing", ""],
    ["one character short", code.slice(1)],
    ["one character too many", `${code}0`],
    ["a U, outside the alphabet", "1KQ2MABCDEFGHJKMNPQRSTVWXU"],
    ["punctuation", "1KQ2MABCDEFGHJKMNPQRSTVWX."],
    ["more than 128 bits (a first character above 7)", "8KQ2MABCDEFGHJKMNPQRSTVWX0"],
    ["a letter that looks like a digit but isn't one of Crockford's", "1KQ2MABCDEFGHJKMNPQRSTVWXÖ"],
  ])("refuses %s", (_, typed) => {
    expect(normaliseSetupCode(typed)).toBeNull();
  });
});

describe("checkSetupCode", () => {
  const stored = makeSetupCode();

  it("accepts the code however it's typed", () => {
    expect(checkSetupCode(stored, stored)).toBe(true);
    expect(checkSetupCode(formatSetupCode(stored).toLowerCase(), stored)).toBe(true);
    expect(checkSetupCode(` ${formatSetupCode(stored).replaceAll("-", " ")} `, stored)).toBe(true);
  });

  it("refuses a wrong code, a malformed one, and nothing", () => {
    let other = makeSetupCode();
    while (other === stored) other = makeSetupCode();
    expect(checkSetupCode(other, stored)).toBe(false);
    // One character changed.
    const last = stored.at(-1) === "0" ? "1" : "0";
    expect(checkSetupCode(`${stored.slice(0, -1)}${last}`, stored)).toBe(false);
    expect(checkSetupCode(stored.slice(0, -1), stored)).toBe(false);
    expect(checkSetupCode("", stored)).toBe(false);
    expect(checkSetupCode("not a code at all", stored)).toBe(false);
  });

  it("refuses everything when nothing is stored", () => {
    expect(checkSetupCode("", "")).toBe(false);
    expect(checkSetupCode("  - ", "")).toBe(false);
  });
});

describe("the file", () => {
  it("is kept in the data folder", () => {
    expect(setupCodePath({})).toBe("./data/setup-code");
    expect(setupCodePath({ RONNE_RUNTIME: "docker" })).toBe("./data/setup-code");
    expect(setupCodePath({ RONNE_RUNTIME: "npm", RONNE_DATA_DIR: "/var/lib/rmk-server" })).toBe(
      "/var/lib/rmk-server/setup-code",
    );
    // RONNE_DATA_DIR in any runtime, as the start script reads it: the image sets /app/data (the
    // volume, which ./data points at), and a clone may name one (the end-to-end instances do).
    expect(setupCodePath({ RONNE_RUNTIME: "docker", RONNE_DATA_DIR: "/app/data" })).toBe(
      "/app/data/setup-code",
    );
    expect(setupCodePath({ RONNE_DATA_DIR: "/tmp/instance" })).toBe("/tmp/instance/setup-code");
  });

  it("is made once, readable only by its owner, and read back the same", () => {
    const path = join(freshFolder(), "setup-code");
    const first = ensureSetupCode(path);
    expect(first.created).toBe(true);
    expect(first.code).toMatch(CROCKFORD);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path, "utf8")).toBe(`${first.code}\n`);
    expect(readSetupCode(path)).toBe(first.code);

    const again = ensureSetupCode(path);
    expect(again).toEqual({ code: first.code, created: false });
  });

  it("creates the data folder when it isn't there yet", () => {
    const path = join(freshFolder(), "data", "setup-code");
    expect(ensureSetupCode(path).created).toBe(true);
    expect(readSetupCode(path)).not.toBeNull();
  });

  it("leaves no temporary file behind", () => {
    const folder = freshFolder();
    ensureSetupCode(join(folder, "setup-code"));
    ensureSetupCode(join(folder, "setup-code"));
    expect(readdirSync(folder)).toEqual(["setup-code"]);
  });

  it("reads a code written by hand in another form", () => {
    const path = join(freshFolder(), "setup-code");
    writeFileSync(path, "1kq2m-abcde-fghjk-mnpqr-stvwx-0\n", { mode: 0o600 });
    expect(ensureSetupCode(path)).toEqual({
      code: "1KQ2MABCDEFGHJKMNPQRSTVWX0",
      created: false,
    });
  });

  it("tightens a file holding the code to 0600 when others can read it", () => {
    const path = join(freshFolder(), "setup-code");
    writeFileSync(path, "1KQ2MABCDEFGHJKMNPQRSTVWX0\n");
    chmodSync(path, 0o644);
    expect(ensureSetupCode(path).code).toBe("1KQ2MABCDEFGHJKMNPQRSTVWX0");
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it.each([
    ["empty", ""],
    ["something else", "hello\n"],
  ])(
    "never replaces a file that holds no code (%s) at a start, only when setup-code asks",
    (_, content) => {
      const folder = freshFolder();
      const path = join(folder, "setup-code");
      writeFileSync(path, content, { mode: 0o644 });
      expect(readSetupCode(path)).toBeNull();
      expect(() => ensureSetupCode(path)).toThrow(SetupCodeFileError);
      expect(readFileSync(path, "utf8")).toBe(content);
      expect(readdirSync(folder)).toEqual(["setup-code"]);

      const replaced = ensureSetupCode(path, { replaceInvalid: true });
      expect(replaced.created).toBe(true);
      expect(readSetupCode(path)).toBe(replaced.code);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(readdirSync(folder)).toEqual(["setup-code"]);
    },
  );

  it("waits for a code another process is still writing (an exclusive create, without hard links)", async () => {
    const path = join(freshFolder(), "setup-code");
    // The file exists, empty, as an exclusive create leaves it before its content is written.
    writeFileSync(path, "", { mode: 0o600 });
    const writer = spawn(process.execPath, [
      "-e",
      `require("node:fs").writeFileSync(${JSON.stringify(path)}, "1KQ2MABCDEFGHJKMNPQRSTVWX0\\n")`,
    ]);
    const exited = new Promise((resolve) => writer.on("exit", resolve));
    // Wait for the writer to start, so the test measures the wait, not Node's start.
    await new Promise((resolve) => writer.on("spawn", resolve));
    expect(ensureSetupCode(path)).toEqual({ code: "1KQ2MABCDEFGHJKMNPQRSTVWX0", created: false });
    await exited;
  });

  it("reads as no code when there's no file", () => {
    expect(readSetupCode(join(freshFolder(), "setup-code"))).toBeNull();
  });

  it("is deleted, and deleting a missing file is fine", () => {
    const path = join(freshFolder(), "setup-code");
    ensureSetupCode(path);
    deleteSetupCode(path);
    expect(readSetupCode(path)).toBeNull();
    expect(() => deleteSetupCode(path)).not.toThrow();
  });

  it.skipIf(process.getuid?.() === 0)("throws when the data folder can't be written", () => {
    const folder = freshFolder();
    chmodSync(folder, 0o555);
    try {
      expect(() => ensureSetupCode(join(folder, "setup-code"))).toThrow(
        expect.objectContaining({ code: expect.stringMatching(/^(EACCES|EPERM)$/) }),
      );
      expect(readdirSync(folder)).toEqual([]);
    } finally {
      chmodSync(folder, 0o755);
    }
  });

  /** Starts `count` processes that each run ensureSetupCode on `path` at the same moment. */
  const race = (path: string, count: number) => {
    const module = new URL("./setup-code.ts", import.meta.url).pathname;
    const tsx = new URL("../../../node_modules/.bin/tsx", import.meta.url).pathname;
    // Each process waits until the same moment, so their writes overlap.
    const go = Date.now() + 3000;
    const script = `import { ensureSetupCode } from ${JSON.stringify(module)};
      while (Date.now() < ${go}) {}
      let result;
      try { result = ensureSetupCode(${JSON.stringify(path)}); }
      catch (error) { result = { error: error.name }; }
      process.stdout.write(JSON.stringify(result));`;
    const run = () =>
      new Promise<{ code?: string; created?: boolean; error?: string }>((resolve, reject) => {
        const child = spawn(tsx, ["--eval", script], { stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        let err = "";
        child.stdout.on("data", (chunk) => {
          out += chunk;
        });
        child.stderr.on("data", (chunk) => {
          err += chunk;
        });
        child.on("error", reject);
        child.on("close", (status) =>
          status === 0 ? resolve(JSON.parse(out)) : reject(new Error(err)),
        );
      });
    return Promise.all(Array.from({ length: count }, run));
  };

  it("ends with one code when several servers start at once: one writes it, the others read it", async () => {
    const path = join(freshFolder(), "setup-code");
    const results = await race(path, 6);
    const stored = readSetupCode(path);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.code))).toEqual(new Set([stored]));
  }, 30_000);

  it("leaves a file that holds no code alone when several servers start at once: none makes a code", async () => {
    const path = join(freshFolder(), "setup-code");
    writeFileSync(path, "", { mode: 0o600 });
    const results = await race(path, 6);
    expect(results).toEqual(Array.from({ length: 6 }, () => ({ error: "SetupCodeFileError" })));
    expect(readFileSync(path, "utf8")).toBe("");
  }, 30_000);
});
