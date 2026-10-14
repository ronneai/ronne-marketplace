import { describe, expect, it } from "vitest";
import {
  cleanFields,
  isSecretKey,
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
});
