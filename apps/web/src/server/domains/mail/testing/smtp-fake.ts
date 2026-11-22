import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createTlsServer, TLSSocket } from "node:tls";

/** A self-signed certificate for `localhost` and 127.0.0.1, made with openssl for one test run. */
export type TestCertificate = { cert: string; key: string };

export const makeTestCertificate = (
  names: { dns: string; ip?: string } = { dns: "localhost", ip: "127.0.0.1" },
): TestCertificate => {
  const dir = mkdtempSync(join(tmpdir(), "ronne-smtp-cert-"));
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "2",
        "-subj",
        `/CN=${names.dns}`,
        "-addext",
        `subjectAltName=DNS:${names.dns}${names.ip ? `,IP:${names.ip}` : ""}`,
        "-keyout",
        join(dir, "key.pem"),
        "-out",
        join(dir, "cert.pem"),
      ],
      { stdio: "ignore" },
    );
    return {
      cert: readFileSync(join(dir, "cert.pem"), "utf8"),
      key: readFileSync(join(dir, "key.pem"), "utf8"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

export type FakeSmtpOptions = {
  /** `starttls`: plain, offering STARTTLS; `tls`: TLS from the first byte; `plain`: no TLS at all. */
  mode: "starttls" | "tls" | "plain";
  certificate?: TestCertificate;
  /** The only user name and password accepted; any AUTH is refused with 535 otherwise. */
  credentials?: { user: string; password: string };
  /** Waits this long before the greeting. */
  greetingDelayMs?: number;
  /** Answers RCPT TO with this line instead of 250 (such as `550 5.1.1 No such user`). */
  rcptReply?: string;
  /** Answers every AUTH with this code, echoing the client's line back (a careless server). */
  authReply?: string;
  /** Says yes to STARTTLS, then sends plain bytes instead of a TLS handshake. */
  brokenStartTls?: boolean;
  /** Refuses MAIL FROM with 550, echoing the AUTH line the client sent earlier (careless). */
  echoAuthAtMail?: boolean;
  /** The port to listen on; any free one when left out (190's end-to-end test names its own). */
  port?: number;
};

export type FakeSmtp = {
  port: number;
  /** Each message accepted: its envelope and its raw data. */
  received: { from: string; to: string[]; data: string; tls: boolean; user: string | null }[];
  close: () => Promise<void>;
};

/** A minimal SMTP server in this process, enough for nodemailer's client and nothing more. */
export const startFakeSmtp = async (options: FakeSmtpOptions): Promise<FakeSmtp> => {
  const received: FakeSmtp["received"] = [];
  const sockets = new Set<Socket>();

  const session = (start: Socket, startsSecure: boolean) => {
    let socket: Socket = start;
    let secure = startsSecure;
    let buffer = "";
    let inData = false;
    let data = "";
    let from = "";
    let to: string[] = [];
    let user: string | null = null;
    let lastAuth = "";
    let authStep: null | { mech: "LOGIN"; user?: string } = null;
    const write = (line: string) => socket.write(`${line}\r\n`);
    const accept = (u: string, p: string) => {
      if (
        options.credentials &&
        u === options.credentials.user &&
        p === options.credentials.password
      ) {
        user = u;
        write("235 2.7.0 Authentication successful");
      } else write("535 5.7.8 Authentication credentials invalid");
    };
    const onLine = (line: string) => {
      if (inData) {
        if (line === ".") {
          inData = false;
          received.push({ from, to, data, tls: secure, user });
          write("250 2.0.0 Ok: queued as FAKE1");
        } else data += `${line.startsWith("..") ? line.slice(1) : line}\r\n`;
        return;
      }
      if (authStep) {
        const value = Buffer.from(line, "base64").toString("utf8");
        if (authStep.user === undefined) {
          authStep.user = value;
          write(`334 ${Buffer.from("Password:").toString("base64")}`);
        } else {
          const u = authStep.user;
          authStep = null;
          accept(u, value);
        }
        return;
      }
      const verb = line.slice(0, 4).toUpperCase();
      if (verb === "EHLO" || verb === "HELO") {
        const lines = ["250-fake.localhost"];
        if (options.mode === "starttls" && !secure) lines.push("250-STARTTLS");
        if (options.credentials) lines.push("250-AUTH PLAIN LOGIN");
        lines.push("250 8BITMIME");
        socket.write(`${lines.join("\r\n")}\r\n`);
      } else if (line.toUpperCase() === "STARTTLS" && options.brokenStartTls) {
        write("220 2.0.0 Ready to start TLS");
        // Waits for the client's first TLS bytes (its ClientHello), then answers them with plain
        // text: a handshake the client started, and that breaks.
        socket.removeAllListeners("data");
        socket.once("data", () => socket.write("this is not a TLS handshake\r\n"));
      } else if (line.toUpperCase() === "STARTTLS" && options.mode === "starttls" && !secure) {
        write("220 2.0.0 Ready to start TLS");
        socket.removeAllListeners("data");
        const upgraded = new TLSSocket(socket, {
          isServer: true,
          cert: options.certificate?.cert,
          key: options.certificate?.key,
        });
        upgraded.on("error", () => {});
        socket = upgraded;
        secure = true;
        buffer = "";
        upgraded.on("data", onData);
      } else if (verb === "AUTH" && options.authReply) {
        write(`${options.authReply} rejected: ${line}`);
      } else if (verb === "AUTH") {
        lastAuth = line;
        const [, mech, initial] = line.split(" ");
        if (mech?.toUpperCase() === "PLAIN" && initial) {
          const [, u = "", p = ""] = Buffer.from(initial, "base64")
            .toString("utf8")
            .split("\u0000");
          accept(u, p);
        } else if (mech?.toUpperCase() === "LOGIN") {
          authStep = { mech: "LOGIN" };
          write(`334 ${Buffer.from("Username:").toString("base64")}`);
        } else write("504 5.5.4 Unrecognized authentication type");
      } else if (verb === "MAIL" && options.echoAuthAtMail) {
        write(`550 5.7.1 not allowed after ${lastAuth}`);
      } else if (verb === "MAIL") {
        from = /<([^>]*)>/.exec(line)?.[1] ?? "";
        to = [];
        write("250 2.1.0 Ok");
      } else if (verb === "RCPT") {
        if (options.rcptReply) write(options.rcptReply);
        else {
          to.push(/<([^>]*)>/.exec(line)?.[1] ?? "");
          write("250 2.1.5 Ok");
        }
      } else if (verb === "DATA") {
        inData = true;
        data = "";
        write("354 End data with <CR><LF>.<CR><LF>");
      } else if (verb === "RSET") write("250 2.0.0 Ok");
      else if (verb === "NOOP") write("250 2.0.0 Ok");
      else if (verb === "QUIT") {
        write("221 2.0.0 Bye");
        socket.end();
      } else write("502 5.5.2 Command not recognized");
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let at = buffer.indexOf("\r\n");
      while (at >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        onLine(line);
        at = buffer.indexOf("\r\n");
      }
    };
    socket.on("error", () => {});
    socket.on("data", onData);
    const greet = () => {
      if (!socket.destroyed) write("220 fake.localhost ESMTP");
    };
    if (options.greetingDelayMs) setTimeout(greet, options.greetingDelayMs).unref();
    else greet();
  };

  const server: Server =
    options.mode === "tls"
      ? createTlsServer(
          { cert: options.certificate?.cert, key: options.certificate?.key },
          (socket) => {
            sockets.add(socket);
            session(socket, true);
          },
        )
      : createServer((socket) => {
          sockets.add(socket);
          session(socket, false);
        });
  server.on("tlsClientError", () => {});
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    port,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
};
