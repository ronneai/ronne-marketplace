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
import { parseEnv } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import {
  cannotWriteFolder,
  EnvMergeError,
  firstUnplainLine,
  formatEnvValue,
  generateAuthSecret,
  InPlaceWriteError,
  isWeakSecret,
  mergeEnv,
  readEnvFile,
  updateEnvFile,
  writeEnvFile,
} from "./env-file";

const dir = mkdtempSync(join(tmpdir(), "ronne-env-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("formatEnvValue", () => {
  it.each([
    "file:./data/ronne.db",
    "postgres://ronne:p%40ss%23word@db:5432/ronne",
    "http://localhost:3000",
    "has space",
    "has#hash",
    'has "double" quotes',
    "it's got an apostrophe",
    'it\'s "both"',
    'it\'s "both" and a \\ backslash',
    "",
    generateAuthSecret(),
  ])("round-trips %j through Node's parser", (value) => {
    expect(parseEnv(`KEY=${formatEnvValue(value)}`).KEY).toBe(value);
  });

  it("refuses line breaks and values it can't quote", () => {
    expect(() => formatEnvValue("a\nb")).toThrowError(/line break/);
    expect(() => formatEnvValue("a\u2028b")).toThrowError(/line break/);
    expect(() => formatEnvValue("a'b\"c`d")).toThrowError(/every kind of quote/);
  });
});

describe("mergeEnv", () => {
  const existing =
    "# my settings\nDATABASE_URL=file:./old.db\n\nOTHER_KEY=keep me\nAUTH_SECRET=existing-secret\n";

  it("replaces known keys in place, appends new ones, and keeps everything else", () => {
    const merged = mergeEnv(existing, {
      DATABASE_URL: "file:./new.db",
      PUBLIC_URL: "http://example.test",
    });
    expect(merged).toBe(
      "# my settings\nDATABASE_URL=file:./new.db\n\nOTHER_KEY=keep me\nAUTH_SECRET=existing-secret\nPUBLIC_URL=http://example.test\n",
    );
  });

  it("never replaces an AUTH_SECRET that's already set", () => {
    const merged = mergeEnv(existing, { AUTH_SECRET: "new-secret" });
    expect(parseEnv(merged).AUTH_SECRET).toBe("existing-secret");
  });

  it("replaces a set AUTH_SECRET in place only when asked to (rotate-secret, 098)", () => {
    const merged = mergeEnv(existing, { AUTH_SECRET: "new-secret" }, { replaceKept: true });
    expect(merged).toBe(
      "# my settings\nDATABASE_URL=file:./old.db\n\nOTHER_KEY=keep me\nAUTH_SECRET=new-secret\n",
    );
  });

  it("removes later lines with a replaced key, since the last one would win when read", () => {
    const merged = mergeEnv(
      "AUTH_SECRET=first\nX=1\nexport AUTH_SECRET=last\n",
      { AUTH_SECRET: "new" },
      { replaceKept: true },
    );
    expect(merged).toBe("AUTH_SECRET=new\nX=1\n");
    expect(parseEnv(mergeEnv("DATABASE_URL=a\nDATABASE_URL=b\n", { DATABASE_URL: "c" }))).toEqual({
      DATABASE_URL: "c",
    });
  });

  it("keeps each line's own ending in a file that mixes LF and CRLF", () => {
    expect(
      mergeEnv("A=1\nB=2\r\nAUTH_SECRET=x\n", { AUTH_SECRET: "y" }, { replaceKept: true }),
    ).toBe("A=1\nB=2\r\nAUTH_SECRET=y\n");
  });

  it("keeps the file's line endings and its last line's ending", () => {
    expect(mergeEnv("A=1\r\nDATABASE_URL=old\r\n", { DATABASE_URL: "new" })).toBe(
      "A=1\r\nDATABASE_URL=new\r\n",
    );
    expect(mergeEnv("# c\nDATABASE_URL=old\nX=1", { DATABASE_URL: "new" })).toBe(
      "# c\nDATABASE_URL=new\nX=1",
    );
    // A key appended to a file without a final newline starts on a line of its own.
    expect(mergeEnv("X=1", { DATABASE_URL: "new" })).toBe("X=1\nDATABASE_URL=new\n");
  });

  it("refuses a merge that would change another key's value, such as a key line inside a multi-line value", () => {
    const cert = 'CERT="-----BEGIN-----\nAUTH_SECRET=part-of-it\n-----END-----"\n';
    expect(() =>
      mergeEnv(`AUTH_SECRET=old\n${cert}`, { AUTH_SECRET: "new" }, { replaceKept: true }),
    ).toThrow(EnvMergeError);
    expect(() =>
      mergeEnv(`DATABASE_URL=a\n${cert.replace("AUTH_SECRET", "DATABASE_URL")}`, {
        DATABASE_URL: "b",
      }),
    ).toThrow(EnvMergeError);
  });

  it("fills an empty AUTH_SECRET", () => {
    expect(parseEnv(mergeEnv("AUTH_SECRET=\n", { AUTH_SECRET: "fresh" })).AUTH_SECRET).toBe(
      "fresh",
    );
  });

  it("writes a new file from nothing", () => {
    expect(mergeEnv("", { DATABASE_URL: "file:./data/ronne.db" })).toBe(
      "DATABASE_URL=file:./data/ronne.db\n",
    );
  });
});

describe("updateEnvFile", () => {
  it("creates .env as 0600 and reports the values in it", () => {
    const path = join(dir, "new.env");
    const values = updateEnvFile(path, {
      DATABASE_URL: "file:./data/ronne.db",
      AUTH_SECRET: "s".repeat(44),
    });
    expect(values.DATABASE_URL).toBe("file:./data/ronne.db");
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("tightens an existing file to 0600 and keeps its other lines", () => {
    const path = join(dir, "existing.env");
    writeFileSync(path, "CUSTOM=1\n", { mode: 0o644 });
    updateEnvFile(path, { PUBLIC_URL: "http://localhost:3000" });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path, "utf8")).toBe("CUSTOM=1\nPUBLIC_URL=http://localhost:3000\n");
    expect(readEnvFile(path)).toEqual({ CUSTOM: "1", PUBLIC_URL: "http://localhost:3000" });
  });

  it("rewrites the file in place in a folder it may not write (the service's, 083)", () => {
    const locked = mkdtempSync(join(dir, "locked-"));
    const path = join(locked, "env");
    writeFileSync(path, "CUSTOM=1\n", { mode: 0o600 });
    chmodSync(locked, 0o555);
    try {
      updateEnvFile(path, { DATABASE_URL: "file:/var/lib/rmk-server/ronne.db" });
      expect(readFileSync(path, "utf8")).toBe(
        "CUSTOM=1\nDATABASE_URL=file:/var/lib/rmk-server/ronne.db\n",
      );
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(readdirSync(locked)).toEqual(["env"]);
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it("never leaves its temporary file behind when the rename fails (it holds the secrets)", () => {
    const folder = mkdtempSync(join(dir, "rename-"));
    // A folder where the file should be: the temporary file is written, the rename refused.
    const path = join(folder, ".env");
    mkdirSync(join(path, "inside"), { recursive: true });
    expect(() => writeEnvFile(path, "AUTH_SECRET=new\n")).toThrow();
    expect(readdirSync(folder)).toEqual([".env"]);
  });

  // As root, a read-only folder still takes a new file.
  it.skipIf(process.getuid?.() === 0)(
    "an in-place rewrite that can't even open the file throws the plain error: nothing changed",
    () => {
      const folder = mkdtempSync(join(dir, "in-place-"));
      // A folder that can't take a new file, so it's rewritten in place; a folder in its place
      // can't be opened.
      const path = join(folder, ".env");
      mkdirSync(path);
      chmodSync(folder, 0o555);
      try {
        const failure = (() => {
          try {
            writeEnvFile(path, "A=1\n");
          } catch (error) {
            return error;
          }
        })();
        expect(failure).not.toBeInstanceOf(InPlaceWriteError);
        expect((failure as NodeJS.ErrnoException).code).toBe("EISDIR");
      } finally {
        chmodSync(folder, 0o755);
      }
    },
  );

  it("knows the errors of a folder it can't add a file to, read-only included", () => {
    const failure = (code: string) => Object.assign(new Error(code), { code });
    for (const code of ["EACCES", "EPERM", "EROFS"])
      expect(cannotWriteFolder(failure(code))).toBe(true);
    for (const code of ["ENOSPC", "ENOENT", "EISDIR"])
      expect(cannotWriteFolder(failure(code))).toBe(false);
    expect(cannotWriteFolder("EROFS")).toBe(false);
  });

  it("still refuses a folder it may not write when there's no file to rewrite", () => {
    const locked = mkdtempSync(join(dir, "locked-"));
    chmodSync(locked, 0o555);
    try {
      // Root can write anywhere, so only an ordinary account sees the refusal.
      if (process.getuid?.() !== 0)
        expect(() => updateEnvFile(join(locked, "env"), { PUBLIC_URL: "http://x" })).toThrow();
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it("reads a missing file as empty", () => {
    expect(readEnvFile(join(dir, "missing.env"))).toEqual({});
  });
});

describe("secrets", () => {
  it("generates 32 random bytes in base64, and flags short secrets", () => {
    const secret = generateAuthSecret();
    expect(Buffer.from(secret, "base64")).toHaveLength(32);
    expect(generateAuthSecret()).not.toBe(secret);
    expect(isWeakSecret(secret)).toBe(false);
    expect(isWeakSecret("short")).toBe(true);
  });
});

describe("firstUnplainLine (098)", () => {
  it("accepts what setup writes: comments, blank lines, single-line KEY=value, LF or CRLF", () => {
    for (const content of [
      "",
      "# settings\n\nDATABASE_URL=file:./data/ronne.db\nAUTH_SECRET=abc+/=\n",
      "export A=1\r\nB='a # b'\r\nC=\"x y\"\r\nD=`q`\r\nE=spaced out # note\r\nF=\nG='C:\\data\\x'\n",
      `PASSWORD=${formatEnvValue("p#ss'w\"rd")}\n`,
      "A=x_y{z}~[a]^b|c\\d\nB=(paren) @x:y;z<w>?\n",
      // Each kind of character at the start, in the middle and at the end of a value.
      "A=:x:\nB=@x@\nC=[x[\nD=_x_\nE={x{\nF=~x~\nG=(x(\nH=/x/\nI=ZxZ\nJ=!x!\nK=%x%\nL=0x0\nM=a!$%&0Z9Ab\n",
    ])
      expect(firstUnplainLine(content), JSON.stringify(content)).toBeNull();
  });

  it("names the first line the two readers could read differently", () => {
    expect(firstUnplainLine('A=1\nM="x\ny"\n')).toBe(2);
    expect(firstUnplainLine("A=1\nB: 2\n")).toBe(2);
    expect(firstUnplainLine("AUTH_SECRET\n=old\n")).toBe(1);
    expect(firstUnplainLine("A = 1\n")).toBe(1);
    expect(firstUnplainLine('A="a\\"b"\n')).toBe(1);
    expect(firstUnplainLine("A=1\rB=2\n")).toBe(1);
    expect(firstUnplainLine("A=1\u2028B=2\n")).toBe(1);
    expect(firstUnplainLine("A='x' trailing\n")).toBe(1);
    // A backslash before a closing quote is an escape for Next.js's loader.
    expect(firstUnplainLine("A='x\\'\nAUTH_SECRET=old\nB=y'\n")).toBe(1);
    expect(firstUnplainLine("A=`x\\`\n")).toBe(1);
    // Whitespace the two readers treat differently.
    expect(firstUnplainLine("export\tA=b\n")).toBe(1);
    expect(firstUnplainLine("A=b\f\n")).toBe(1);
    expect(firstUnplainLine("A=b\u00a0\n")).toBe(1);
    expect(firstUnplainLine("PUBLIC_URL= \nAUTH_SECRET=s\n")).toBe(1);
    expect(firstUnplainLine("  A=1\n")).toBe(1);
    expect(firstUnplainLine("A=1 \n")).toBe(1);
    // `export KEY=` with no value: some Node versions read the key as "export KEY".
    expect(firstUnplainLine("export A=\n")).toBe(1);
    expect(firstUnplainLine("export A= # c\n")).toBe(1);
    expect(firstUnplainLine("A=\nexport B=1\n")).toBeNull();
  });
});
