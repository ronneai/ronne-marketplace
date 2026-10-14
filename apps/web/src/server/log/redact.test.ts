import { describe, expect, it } from "vitest";
import {
  cleanFields,
  isSecretKey,
  MAX_DEPTH,
  MAX_ITEMS,
  MAX_STRING,
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
    expect(redactString("a mysql://u:one@h/a and postgres://v:two@k/b")).toBe(
      "a mysql://u:***@h/a and postgres://v:***@k/b",
    );
  });

  it("keeps URLs without a password", () => {
    for (const text of [
      "http://localhost:3000/setup",
      "ssh://git@github.com/x",
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
    expect(Object.keys(out.longKey as object)[0]).toHaveLength(200);
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
});
