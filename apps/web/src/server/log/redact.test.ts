import { describe, expect, it } from "vitest";
import {
  cleanFields,
  hidePathsUnder,
  isSecretKey,
  MAX_CHARS,
  MAX_DEPTH,
  MAX_ITEMS,
  MAX_RAW,
  MAX_STRING,
  MAX_VALUES,
  newLine,
  REDACTED,
  redactString,
  UNSERIALISABLE,
} from "./redact";

const TOKEN = `rmk_${"A".repeat(20)}-_${"z".repeat(21)}`;

describe("isSecretKey", () => {
  it("matches the secret names, any case, as the whole name, its end or its plural", () => {
    for (const key of [
      "password",
      "Password",
      "dbPassword",
      "token",
      "csrfToken",
      "access_token",
      "refresh-token",
      "AUTH_SECRET",
      "clientSecret",
      "authorization",
      "Authorization",
      "cookie",
      "cookies",
      "set-cookie",
      "passphrase",
      "apiKey",
      "api_key",
      "X-Api-Key",
      "tokens",
      "authorizations",
      "proxy_Authorizations",
      "passwords",
    ])
      expect(isSecretKey(key), key).toBe(true);
  });

  it("leaves other names alone", () => {
    for (const key of ["userId", "tokenId", "status", "route", "keys", "secretary", "passwordHint"])
      expect(isSecretKey(key), key).toBe(false);
  });
});

describe("redactString", () => {
  it("takes out every access token", () => {
    expect(redactString(`Bearer ${TOKEN}`)).toBe("Bearer rmk_[redacted]");
    expect(redactString(`${TOKEN},${TOKEN}`)).toBe("rmk_[redacted],rmk_[redacted]");
    // A token right after another `rmk_` run: the whole run goes.
    expect(redactString(`rmk_${"a".repeat(42)}${TOKEN}`)).toBe("rmk_[redacted]");
    expect(redactString(`rmk_${TOKEN}`)).toBe("rmk_[redacted]");
    expect(redactString(`rmk_ab-${TOKEN}`)).toBe("rmk_[redacted]");
    // Not a token: too short.
    expect(redactString("rmk_short")).toBe("rmk_short");
  });

  it("hides a URL's password as redactDatabaseUrl does, wherever the URL is", () => {
    expect(redactString("postgres://ronne:s3cret@db:5432/ronne")).toBe(
      "postgres://ronne:***@db:5432/ronne",
    );
    // A password with an unencoded `@`, `:` or `/`: hidden up to the last `@`, as redactDatabaseUrl.
    expect(redactString("connect ECONNREFUSED mysql://root:p@ss:w/rd@127.0.0.1/x failed")).toBe(
      "connect ECONNREFUSED mysql://root:***@127.0.0.1/x failed",
    );
    expect(redactString('"postgres://u:pw@h/d"')).toBe('"postgres://u:***@h/d"');
    // Spaces, tabs and newlines in the password: hidden, as redactDatabaseUrl hides them.
    for (const password of ["pa ss", "pa\tss", "pa\nss"])
      expect(redactString(`postgres://u:${password}@h/d`)).toBe("postgres://u:***@h/d");
    expect(redactString("POSTGRES://U:PW@H/D")).toBe("POSTGRES://U:***@H/D");
    expect(redactString("postgres://u:pw@[::1]:5432/d")).toBe("postgres://u:***@[::1]:5432/d");
    // `://` in the password, and an `@` in the user name (Azure's `admin@server`).
    expect(redactString("postgres://u:XYZ://more@h/db")).toBe("postgres://u:***@h/db");
    expect(redactString("postgres://admin@srv:S3cr3t@srv.example.com/db")).toBe(
      "postgres://admin@srv:***@srv.example.com/db",
    );
    // A URL followed by an email: hidden up to the email's `@`, never less than the password.
    expect(redactString("mysql://u:pw@h/d failed for a@b.test")).not.toContain("pw");
    // Two URLs: from the first password to the last `@`, more than needed, never less.
    expect(redactString("a mysql://u:one@h/a and postgres://v:two@k/b")).toBe(
      "a mysql://u:***@k/b",
    );
    // An `@` then a `://` inside the password.
    expect(redactString("postgres://u:p@x://y@h/db")).toBe("postgres://u:***@h/db");
    // A URL with no password first: the next one's password is still found.
    expect(redactString("a http://host/path postgres://u:secret@h b")).toBe(
      "a http://host/path postgres://u:***@h b",
    );
    // A user name ends at `/`: no password there.
    expect(redactString("postgres://u/x:pw@h")).toBe("postgres://u/x:pw@h");
  });

  it("keeps URLs without a password (a user@host in one reads as an email: hidden)", () => {
    expect(redactString("ssh://git@github.com/x")).toBe("ssh://[email]/x");
    for (const text of [
      "http://localhost:3000/setup",
      "file:./data/ronne.db",
      "https://a.test/x?y=1 then https://b.test:8443/",
    ])
      expect(redactString(text)).toBe(text);
  });

  it("cuts a long value to MAX_STRING characters and an ellipsis", () => {
    const cut = redactString("x".repeat(MAX_STRING + 500));
    expect(cut).toHaveLength(MAX_STRING + 1);
    expect(cut.endsWith("…")).toBe(true);
    expect(redactString("x".repeat(MAX_STRING))).toHaveLength(MAX_STRING);
  });

  it("stays fast on long adversarial runs", () => {
    const started = performance.now();
    for (const text of [
      "a".repeat(100_000),
      "://".repeat(100_000),
      `postgres://${":".repeat(100_000)}`,
      "rmk_".repeat(100_000),
      "a://b:".repeat(50_000),
      "a://u:p@".repeat(50_000),
      `a://u:p@${"://".repeat(100_000)}`,
      "ssh://git@".repeat(50_000),
      "rmk_".repeat(100_000),
      `${"rmk_".repeat(50_000)}!`,
      `rmk_${"a".repeat(42)}!`.repeat(20_000),
      `a://u:${"@".repeat(100_000)}`,
      `a://u:${" ".repeat(100_000)}`,
      "a://u:x ".repeat(50_000),
    ])
      redactString(text);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("cleanFields", () => {
  it("redacts secret keys whatever their value, at the top", () => {
    expect(
      cleanFields({ password: "hunter2", token: 42, cookie: { a: 1 }, route: "/x" }, false),
    ).toEqual({ password: REDACTED, token: REDACTED, cookie: REDACTED, route: "/x" });
  });

  it("redacts secret keys at any depth, in objects and arrays", () => {
    expect(
      cleanFields(
        {
          request: { headers: { authorization: "Bearer x", accept: "*/*" } },
          list: [{ apiKey: "k", name: "a" }, [{ secret: "s" }]],
        },
        false,
      ),
    ).toEqual({
      request: { headers: { authorization: REDACTED, accept: "*/*" } },
      list: [{ apiKey: REDACTED, name: "a" }, [{ secret: REDACTED }]],
    });
  });

  it("cleans strings everywhere: values, nested values, arrays", () => {
    expect(
      cleanFields({ a: TOKEN, b: { c: "postgres://u:pw@h/d" }, d: [TOKEN, "ok"] }, false),
    ).toEqual({
      a: "rmk_[redacted]",
      b: { c: "postgres://u:***@h/d" },
      d: ["rmk_[redacted]", "ok"],
    });
  });

  it("writes errors as name, message and code, the stack only when asked", () => {
    const error = Object.assign(new Error(`bad token ${TOKEN} for mysql://r:pw@h/d`), {
      code: "E_BAD",
    });
    const without = cleanFields({ err: error }, false);
    expect(without).toEqual({
      err: {
        name: "Error",
        message: "bad token rmk_[redacted] for mysql://r:***@h/d",
        code: "E_BAD",
      },
    });
    const withStack = cleanFields({ err: error }, true).err as { stack: string };
    expect(withStack.stack).toContain("rmk_[redacted]");
    expect(withStack.stack).not.toContain(TOKEN);
    expect(withStack.stack).not.toContain(":pw@");
    // An error inside another field too.
    expect(cleanFields({ cause: { inner: new TypeError("x") } }, false)).toEqual({
      cause: { inner: { name: "TypeError", message: "x" } },
    });
  });

  it("writes a thrown value that isn't an Error as its type only", () => {
    expect(cleanFields({ err: `thrown ${TOKEN}` }, true)).toEqual({ err: { type: "string" } });
    expect(cleanFields({ err: { password: "x" } }, true)).toEqual({ err: { type: "object" } });
    expect(cleanFields({ err: null }, true)).toEqual({ err: { type: "null" } });
  });

  it("marks a cycle or a BigInt as unserialisable, that field only", () => {
    const cycle: Record<string, unknown> = { a: 1 };
    cycle.self = cycle;
    expect(cleanFields({ cycle, big: 10n, deep: { n: [1n] }, ok: 1 }, false)).toEqual({
      cycle: UNSERIALISABLE,
      big: UNSERIALISABLE,
      deep: UNSERIALISABLE,
      ok: 1,
    });
  });

  it("keeps a value seen twice that isn't a cycle", () => {
    const shared = { n: 1 };
    expect(cleanFields({ pair: [shared, shared] }, false)).toEqual({ pair: [{ n: 1 }, { n: 1 }] });
  });

  it("drops undefined and functions, writes dates and odd numbers as JSON can hold them", () => {
    expect(
      cleanFields(
        { u: undefined, f: () => 1, at: new Date(0), bad: new Date(Number.NaN), inf: Infinity },
        false,
      ),
    ).toEqual({ at: "1970-01-01T00:00:00.000Z", bad: "Invalid Date", inf: "Infinity" });
  });

  it("never throws, even on a getter that throws", () => {
    const hostile = {
      get boom() {
        throw new Error("no");
      },
    };
    expect(cleanFields({ hostile, ok: true }, false)).toEqual({
      hostile: UNSERIALISABLE,
      ok: true,
    });
  });

  it("cleans keys like values: a token or a URL password used as a key is hidden", () => {
    const fields = cleanFields(
      { [TOKEN]: 1, nested: { "postgres://u:S3cr3t@h/db": 2 }, list: [{ [`k ${TOKEN}`]: 3 }] },
      false,
    );
    const json = JSON.stringify(fields);
    expect(json).not.toContain(TOKEN);
    expect(json).not.toContain("S3cr3t");
    expect(fields).toEqual({
      "rmk_[redacted]": 1,
      nested: { "postgres://u:***@h/db": 2 },
      list: [{ "k rmk_[redacted]": 3 }],
    });
  });

  it("redacts an error's name and string code too", () => {
    const error = Object.assign(new Error("x"), { code: TOKEN });
    error.name = `Named ${TOKEN}`;
    expect(cleanFields({ err: error }, false)).toEqual({
      err: { name: "Named rmk_[redacted]", message: "x", code: "rmk_[redacted]" },
    });
    expect(cleanFields({ err: Object.assign(new Error("y"), { code: 23505 }) }, false)).toEqual({
      err: { name: "Error", message: "y", code: 23505 },
    });
  });

  it("drops an error's other properties, cause included", () => {
    const error = Object.assign(new Error("x", { cause: new Error(TOKEN) }), {
      config: { password: "p" },
    });
    expect(JSON.stringify(cleanFields({ err: error }, true))).not.toContain(TOKEN);
    expect(cleanFields({ err: error }, false)).toEqual({ err: { name: "Error", message: "x" } });
  });

  it("writes boxed strings whole, so they're redacted, and bytes as their size", () => {
    expect(
      cleanFields({ s: new String(TOKEN), b: Buffer.from("hunter2"), u: new Uint8Array(4) }, false),
    ).toEqual({ s: "rmk_[redacted]", b: "[7 bytes]", u: "[4 bytes]" });
  });

  it("caps depth, items and keys, and stays fast on big values", () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 50; i++) deep = { deep };
    const started = performance.now();
    const out = cleanFields(
      {
        deep,
        big: Array.from({ length: 1_000_000 }, (_, i) => i),
        wide: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`k${i}`, i])),
        bytes: Buffer.alloc(10 * 1024 * 1024),
        longKey: { ["k".repeat(1_000_000)]: 1 },
      },
      false,
    );
    expect(performance.now() - started).toBeLessThan(1000);
    expect(JSON.stringify(out).length).toBeLessThan(20_000);
    expect(JSON.stringify(out.deep)).toContain("[too deep]");
    expect(JSON.stringify(out.deep).match(/deep/g)?.length).toBe(MAX_DEPTH + 1);
    expect(out.big).toHaveLength(MAX_ITEMS + 1);
    expect((out.big as unknown[]).at(-1)).toBe(`[${1_000_000 - MAX_ITEMS} more]`);
    expect(Object.keys(out.wide as object)).toHaveLength(MAX_ITEMS + 1);
    expect(out.bytes).toBe(`[${10 * 1024 * 1024} bytes]`);
    // Too long to read: never part of it, only a marker.
    expect(Object.keys(out.longKey as object)[0]).toBe("[key 0]");
  });

  it("finds a cycle at once, not by running out of depth or stack", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    // Without the cycle check, the depth cap would write "[too deep]" instead.
    expect(cleanFields({ cycle }, false)).toEqual({ cycle: UNSERIALISABLE });
  });

  it("marks only the field whose getter throws, at the top too", () => {
    const fields = {
      ok: 1,
      get boom(): unknown {
        throw new Error("no");
      },
    };
    expect(cleanFields(fields, false)).toEqual({ ok: 1, boom: UNSERIALISABLE });
    const keysThrow = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error("no");
        },
      },
    );
    expect(cleanFields(keysThrow, false)).toEqual({ fields: UNSERIALISABLE });
  });

  it("never leaves part of a token where a value or a key is cut", () => {
    for (let pad = 1940; pad <= 2001; pad++) {
      const out = JSON.stringify(cleanFields({ v: `${"x".repeat(pad)}${TOKEN}` }, false));
      expect(out).not.toContain(TOKEN.slice(0, 10));
    }
    for (let pad = 150; pad <= 201; pad++) {
      const fields = cleanFields({ [`${"k".repeat(pad)}${TOKEN}`]: 1 }, false);
      expect(Object.keys(fields)[0]).not.toContain(TOKEN.slice(0, 8));
    }
    const url = cleanFields({ [`postgres://u:secretpw${"x".repeat(300)}@h`]: 1 }, false);
    expect(Object.keys(url)[0]).not.toContain("secretpw");
  });

  it("drops the extra properties of an error inside another field", () => {
    const inner = Object.assign(new Error("x", { cause: new Error(TOKEN) }), {
      config: { url: "u" },
    });
    expect(cleanFields({ ctx: { inner } }, false)).toEqual({
      ctx: { inner: { name: "Error", message: "x" } },
    });
  });

  it("keeps a line small when one value is reached many ways (shared, not a cycle)", () => {
    let node: unknown = { v: "s".repeat(2000) };
    for (let level = 0; level < 4; level++) {
      const shared = node;
      node = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, shared]));
    }
    let list: unknown = "s".repeat(2000);
    for (let level = 0; level < 4; level++) list = new Array(100).fill(list);
    const started = performance.now();
    const out = cleanFields({ node, list }, false);
    expect(performance.now() - started).toBeLessThan(1000);
    const json = JSON.stringify(out);
    expect(json.length).toBeLessThan(MAX_CHARS * 2);
    expect(json).toMatch(/"\[more\]":\d+|\[\d+ more\]|\[too big\]/);
    expect(MAX_VALUES).toBeGreaterThan(0);
  });

  it("spends the line's value budget on every value, numbers and undefined included", () => {
    const nest = (leaf: unknown, levels: number): unknown => {
      let node = leaf;
      for (let i = 0; i < levels; i++) node = new Array(100).fill(node);
      return node;
    };
    for (const leaf of [1, undefined, null, true]) {
      const started = performance.now();
      const json = JSON.stringify(cleanFields({ n: nest(leaf, 4) }, false));
      expect(performance.now() - started).toBeLessThan(500);
      expect(json.length).toBeLessThan(MAX_VALUES * 20);
      expect(json).toMatch(/\[too big\]|\[\d+ more\]/);
    }
  });

  it("does the work on a shared error, string or object once per line", () => {
    const error = new Error("y".repeat(10_000_000));
    error.stack = "s".repeat(5000);
    const big = "z".repeat(10_000_000);
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < 1_000_000; i++) wide[`k${i}`] = undefined;
    const fill = (value: unknown) => new Array(100).fill(new Array(100).fill(value));
    for (const value of [error, big, new String(big), wide]) {
      const started = performance.now();
      const json = JSON.stringify(cleanFields({ a: fill(value) }, true));
      expect(performance.now() - started).toBeLessThan(1500);
      expect(json.length).toBeLessThan(MAX_CHARS * 2);
    }
  });

  it("shares one budget between calls given the same line", () => {
    const line = newLine();
    const big = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`k${i}`, "x".repeat(1999)]),
    );
    const json = JSON.stringify([
      cleanFields({ a: big, b: big }, false, line),
      cleanFields({ c: big, d: big }, false, line),
    ]);
    expect(json.length).toBeLessThan(MAX_CHARS + 20_000);
  });

  it('writes an object past its keys as "[more]": N, and charges key names', () => {
    const wide = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`k${i}`, i]));
    expect(cleanFields({ wide }, false).wide).toMatchObject({ "[more]": 50 });
    const longKeys = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`${"k".repeat(199)}${i % 10}${i}`, 1]),
    );
    const json = JSON.stringify(
      cleanFields({ a: longKeys, b: longKeys, c: longKeys, d: longKeys }, false),
    );
    expect(json.length).toBeLessThan(MAX_CHARS + 20_000);
  });

  it("charges every distinct key name to the line's budget", () => {
    const longKeys = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [
        `${String(i).padStart(3, "0")}${"k".repeat(1000)}`,
        1,
      ]),
    );
    const json = JSON.stringify(
      cleanFields({ a: longKeys, b: longKeys, c: longKeys, d: longKeys }, false),
    );
    expect(json.length).toBeLessThan(MAX_CHARS + 20_000);
  });

  it("charges the top-level err to the line's budget", () => {
    const big = "y".repeat(5000);
    const error = Object.assign(new Error(big), { code: big, stack: big });
    error.name = big;
    const line = newLine();
    cleanFields({ v: new Array(25).fill("z".repeat(1990)), err: error }, true, line);
    expect(line.chars).toBeLessThanOrEqual(MAX_CHARS - 25 * 1990 - 4 * 5000 + 10);
  });

  it("writes a string too long to read as its length, and reads it not at all", () => {
    const huge = `postgres://u:${"p".repeat(MAX_RAW)}@h`;
    expect(cleanFields({ huge, key: { [huge]: 1 } }, false)).toEqual({
      huge: `[${huge.length} characters]`,
      key: { "[key 0]": 1 },
    });
  });

  it("stays fast on many distinct long strings of the same length", () => {
    const strings = Array.from(
      { length: 1000 },
      (_, i) => `postgres://app:${"p".repeat(20_000)}${String(i).padStart(4, "0")}@db`,
    );
    const started = performance.now();
    const json = JSON.stringify(
      cleanFields(
        { strings: [strings.slice(0, 100), strings.slice(100, 200)], all: strings },
        false,
      ),
    );
    expect(performance.now() - started).toBeLessThan(500);
    expect(json).not.toContain("pppppppp");
  });

  it("reads Dates and byte lengths with the built-in methods, not the value's own", () => {
    const date = new Date(0);
    date.toISOString = () => TOKEN;
    class Sneaky extends Date {
      override toISOString() {
        return TOKEN;
      }
    }
    const invalid = new Date(Number.NaN);
    invalid.toString = () => TOKEN;
    const bytes = Buffer.from("abc");
    Object.defineProperty(bytes, "byteLength", { get: () => TOKEN });
    expect(cleanFields({ date, sneaky: new Sneaky(0), invalid, bytes }, false)).toEqual({
      date: "1970-01-01T00:00:00.000Z",
      sneaky: "1970-01-01T00:00:00.000Z",
      invalid: "Invalid Date",
      bytes: "[3 bytes]",
    });
  });

  it('writes the top level past its keys as "[more]": N', () => {
    const fields = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`k${i}`, i]));
    expect(cleanFields(fields, false)).toMatchObject({ "[more]": 50 });
  });

  it("reads only the end of a key to tell a secret, once per object per line", () => {
    expect(isSecretKey(`${"x".repeat(1_000_000)}_PASS-WORD`)).toBe(true);
    expect(isSecretKey(`password${"x".repeat(1_000_000)}`)).toBe(false);
    expect(isSecretKey(`api_key${"_".repeat(100)}`)).toBe(true);
    const o = Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [`${i}${"k".repeat(10_000_000)}`, 1]),
    );
    const started = performance.now();
    cleanFields({ a: new Array(100).fill(new Array(10).fill(o)) }, false);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("reads at most a few hundred characters of a key's end, so separator runs cost nothing", () => {
    // Too long to read as letters: counted as a secret, more hidden, never less.
    expect(isSecretKey(`id${"_".repeat(10_000_000)}`)).toBe(true);
    expect(isSecretKey(`id${"_".repeat(20)}`)).toBe(false);
    // The boundary: 256 characters are read. `id` and 254 `_` fit; one more doesn't.
    expect(isSecretKey(`id${"_".repeat(254)}`)).toBe(false);
    expect(isSecretKey(`id${"_".repeat(255)}`)).toBe(true);
    expect(isSecretKey(`password${"_".repeat(248)}`)).toBe(true);
    const key = `a${"_".repeat(10_000_000)}`;
    const started = performance.now();
    cleanFields(
      { a: Array.from({ length: 100 }, () => Array.from({ length: 9 }, () => ({ [key]: 1 }))) },
      false,
    );
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("keeps a __proto__ field from request JSON as a field", () => {
    const fields = JSON.parse('{"__proto__":{"userId":"x","password":"p"},"ok":1}');
    const out = cleanFields(fields, false);
    expect(Object.keys(out)).toEqual(["__proto__", "ok"]);
    expect(JSON.stringify(out)).toBe('{"__proto__":{"userId":"x","password":"[redacted]"},"ok":1}');
  });

  it("cuts a long key to 200 characters, after redaction", () => {
    const fields = cleanFields({ [`${"k".repeat(300)}`]: 1 }, false);
    expect(Object.keys(fields)).toEqual([`${"k".repeat(200)}…`]);
  });

  it("hides paths under a storage root: a storage error never names an item", () => {
    hidePathsUnder("/srv/ronne-test-storage/");
    expect(
      redactString(
        "EACCES: permission denied, open '/srv/ronne-test-storage/team/secret-item/1.0.0.tgz'",
      ),
    ).toBe("EACCES: permission denied, open '/srv/ronne-test-storage/[path]'");
    expect(
      redactString("missing /srv/ronne-test-storage/a/b.tgz and /srv/ronne-test-storage/c.zip"),
    ).toBe("missing /srv/ronne-test-storage/[path] and /srv/ronne-test-storage/[path]");
    // A folder that only starts the same isn't the root.
    expect(redactString("/srv/ronne-test-storage-other/x")).toBe("/srv/ronne-test-storage-other/x");
    const started = performance.now();
    redactString("/srv/ronne-test-storage".repeat(50_000));
    redactString(`/srv/ronne-test-storage/${"a".repeat(100_000)}`);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("writes a duplicate-key error's value as [value]: an item's name or an email (MySQL)", () => {
    expect(
      redactString(
        "Duplicate entry '01K7SCOPE-o'secret-skill' for key 'items.items_scope_name_unique'; Duplicate entry 'x' for key 'y'",
      ),
    ).toBe(
      "Duplicate entry '[value]' for key 'items.items_scope_name_unique'; Duplicate entry '[value]' for key 'y'",
    );
    // After a URL in the same message, whose password rule runs to the last `@`.
    expect(
      redactString(
        "mysql://ronne@db:3306/ronne: Duplicate entry '@acme/private-name' for key 'items_scope_name_unique'",
      ),
    ).toBe(
      "mysql://ronne@db:3306/ronne: Duplicate entry '[value]' for key 'items_scope_name_unique'",
    );
    expect(
      redactString("http://localhost:3000 Duplicate entry '@acme/private-name' for key 'x'"),
    ).toBe("http://localhost:3000 Duplicate entry '[value]' for key 'x'");
    // Not a duplicate-key error: left alone.
    expect(redactString("Duplicate entry 'x' and nothing after")).toBe(
      "Duplicate entry 'x' and nothing after",
    );
  });

  it("writes every email address as [email], and nothing that only looks like one", () => {
    expect(
      redactString("Duplicate entry 'carol.secret@example.com' for key 'user.user_email_unique'"),
    ).toBe("Duplicate entry '[value]' for key 'user.user_email_unique'");
    expect(redactString("to a+b@mail.example.co.uk, c@d.io.")).toBe("to [email], [email].");
    // In any script, as the app accepts them, and with characters an address may hold.
    expect(redactString("Duplicate entry 'josé@example.com' for key")).toBe(
      "Duplicate entry '[value]' for key",
    );
    expect(redactString("existing email: zoë.ånsen@bücher.de")).toBe("existing email: [email]");
    expect(redactString("for o'brien@example.com and 𝒶𝒷@пример.рф")).toBe(
      "for [email] and [email]",
    );
    expect(redactString("x!y#z@example.xn--p1ai, <a=b@example.com>")).toBe("[email], <[email]>");
    // Uppercase, hyphenated domains, a quoted local part, a domain running on past its last label.
    expect(redactString("from Alice.SMITH@My-Host.Example-Mail.COM")).toBe("from [email]");
    expect(redactString('to "ana"@example.com now')).toBe("to [email] now");
    expect(redactString("key carol@example.com-acme")).toBe("key [email]-acme");
    // The dots IDNA maps to `.`, and invisible characters IDNA drops (a soft hyphen, a zero-width
    // space).
    expect(redactString("v bob@sub\u3002example.com w")).toBe("v [email] w");
    expect(redactString("v bob@ｅｘａｍｐｌｅ\uFF0Ecom.au w")).toBe("v [email] w");
    expect(redactString("v bob@exa\u00ADmple.com w")).toBe("v [email] w");
    expect(redactString("v ana@exa\u200Bmple.com w")).toBe("v [email] w");
    // Each dot IDNA maps, alone, and a format character inside the last label.
    expect(redactString("v bob@example\uFF61com w")).toBe("v [email] w");
    expect(redactString("v bob@example\u3002com w")).toBe("v [email] w");
    expect(redactString("v bob@example\uFF0Ecom w")).toBe("v [email] w");
    expect(redactString("v bob@example.c\u00ADom w")).toBe("v [email] w");
    // Every shape the app accepts: an address literal, an IPv4 domain, a one-letter or
    // letters-and-digits last label, an underscore.
    expect(redactString("v bob@[192.0.2.1] w")).toBe("v [email] w");
    expect(redactString("v bob@[IPv6:2001:db8::1] w")).toBe("v [email] w");
    expect(redactString("v bob@192.0.2.1 w")).toBe("v [email] w");
    expect(redactString("v ana@host.x and ana@example.c0m w")).toBe("v [email] and [email] w");
    expect(redactString("v ana@ex_ample.com w")).toBe("v [email] w");
    // Symbols and punctuation IDNA keeps in a domain.
    for (const address of [
      "ana@col\u00B7legi.cat",
      "ana@i\u2764.ws",
      "ana@\u2603.net",
      "bob@\u24D4xample.com",
      "ana@shop\u2010online.com",
      "ana@x\uFEFFy.com",
    ])
      expect(redactString(`mail ${address} now`)).toBe("mail [email] now");
    // A quote before an address stays in the line; one in an address is hidden with it.
    expect(redactString("x 'ana@example.com' y and o'brien@example.com")).toBe(
      "x '[email]' y and [email]",
    );
    // A query or trailing punctuation after an address stays.
    expect(redactString("mailto:ana@example.com?subject=hi! or bob@example.org!")).toBe(
      "mailto:[email]?subject=hi! or [email]!",
    );
    // An IDNA dot ending a sentence, or splitting a run-on last label; a format character in one.
    expect(redactString("mail bob@example.com\u3002")).toBe("mail [email]\u3002");
    expect(redactString("key carol@example\u3002com-acme")).toBe("key [email]-acme");
    expect(redactString("key carol@example.c\u00ADom-acme")).toBe("key [email]-acme");
    // A run-on after a digits-and-letters or one-letter label, an IPv4 address, a trailing dot.
    expect(
      redactString("mailto:ana@example.c0m?x=1 ana@host.x! ana@192.0.2.1?x ana@example.com.?x=1"),
    ).toBe("mailto:[email]?x=1 [email]! [email]?x [email].?x=1");
    // Each delimiter ends a domain: what follows it stays.
    for (const d of [..."\"'()*,/:;<>[]\\`{}"])
      expect(redactString(`x ana@example.com${d}tail.org y`), d).toBe(`x [email]${d}tail.org y`);
    // Linear: another `@` ends a domain, so a hostile run doesn't read each character again.
    const hostile = performance.now();
    redactString("a@b".repeat(40_000));
    expect(performance.now() - hostile).toBeLessThan(2_000);
    // A domain holding a symbol, followed by a run-on: the longest start that is a domain.
    const runOns: [string, string][] = [
      ["x ana@i\u2764.ws?v=1.2 y", "x [email]?v=1.2 y"],
      ["ana@col\u00B7legi.cat&y=2.0", "[email]&y=2.0"],
      ["ana@x+y.com#v1.2", "[email]#v1.2"],
      ["ana@\u2603.net?utm_source=mail.campaign", "[email]?utm_source=mail.campaign"],
      ["ana@\u24D4xample.com?x=_a.b", "[email]?x=_a.b"],
      ["x ana@my-host.com?v=1.2 y", "x [email]?v=1.2 y"],
      ["ana@example.com-1.2", "[email]-1.2"],
      ["ana@example.com_1.2", "[email]_1.2"],
      ["mailto:ana@example.xn--p1ai?x=1", "mailto:[email]?x=1"],
      ["ana@example.xn--p1ai!", "[email]!"],
      // A domain of 253 characters, a hostname's most, before a run-on.
      [`a@${"b".repeat(249)}.com?q=1.2`, "[email]?q=1.2"],
      // `example.com。v1` is a domain itself: IDNA reads `。` as a dot.
      ["ana@example.com\u3002v1.2", "[email].2"],
    ];
    for (const [line, hidden] of runOns) expect(redactString(line), line).toBe(hidden);
    // A space ends a domain.
    expect(redactString("user ana@localhost failed to open config.json now")).toBe(
      "user ana@localhost failed to open config.json now",
    );
    // Each delimiter ends a local part: what comes before it stays.
    for (const d of [...'"()<>[]{},;:/\\`*'])
      expect(redactString(`x${d}ana@example.com y`), d).toBe(`x${d}[email] y`);
    expect(redactString('{"to":"ana@example.com"}')).toBe('{"to":"[email]"}');
    expect(redactString("f(a,b,ana@example.com)")).toBe("f(a,b,[email])");
    // Marks in a last label, and in a run-on one.
    expect(
      redactString(
        "mail ana@\u0921\u093E\u091F\u093E\u092E\u0947\u0932.\u092D\u093E\u0930\u0924 now",
      ),
    ).toBe("mail [email] now");
    expect(redactString("ana@example.\u092D\u093E\u0930\u0924-x")).toBe("[email]-x");
    // The trailing trim and the last-dot scan read each IDNA dot and `-`.
    for (const dot of ["-", "\uFF0E", "\uFF61", "\u3002"])
      expect(redactString(`mail ana@example.com${dot}`), dot).toBe(`mail [email]${dot}`);
    for (const dot of ["\uFF0E", "\uFF61"])
      expect(redactString(`key carol@example${dot}com-acme`), dot).toBe("key [email]-acme");
    // A quoted local part holding `@`, and one too long to be quoted: hidden from the quote back.
    expect(redactString('x "a@b"@example.com y')).toBe("x [email] y");
    const quotation = `say "${"x".repeat(80)} ana"@example.com`;
    expect(redactString(quotation)).toBe(`say "${"x".repeat(80)} [email]`);
    // What a line needs stays: versions and pnpm's paths.
    for (const kept of [
      "next@16.4.0",
      "pkg@1.0.0-beta",
      "@types/node@22.20.5",
      "node_modules/.pnpm/react-dom@19.2.0_react@19.2.0/node_modules/react-dom/index.js:12:5",
      "next@16.4.0_@babel+core@7.28.4_react@19.2.0",
      "pkg@1.0.0_peer.js",
      "foo@1.0.0_socket.io",
      "/app/node_modules/.pnpm/@better-auth+prisma-adapter@1.7.7_@better-auth+core@1.7.7_@better-auth+utils@0.4.2_@bet_a3bcb/node_modules/x/dist/index.js:12:5",
    ])
      expect(redactString(kept)).toBe(kept);
    for (const kept of [
      "/node_modules/.pnpm/next@16.4.0_react@19.2.0/x",
      "@team/secure-coding and @acme/infra/tool",
      "postgres://ronne:***@db.internal/ronne",
      "a @ b, @@, x@, @y.com",
    ])
      expect(redactString(kept), kept).toBe(kept);
    const started = performance.now();
    redactString("@".repeat(100_000));
    redactString(`${"a".repeat(100_000)}@`);
    redactString(`a@${"b.".repeat(50_000)}`);
    redactString("a@b.cd ".repeat(20_000));
    expect(performance.now() - started).toBeLessThan(500);
  });
});
