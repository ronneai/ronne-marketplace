import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { probeRequest, providerProbe } from "./provider-probe";

let server: Server;
let port: number;
let seen: IncomingMessage[];
let answer: (path: string) => { status: number; headers?: Record<string, string> } | "hang";

beforeEach(async () => {
  seen = [];
  answer = () => ({ status: 200 });
  server = createServer((request, response) => {
    seen.push(request);
    const reply = answer(request.url ?? "");
    if (reply === "hang") return;
    response.writeHead(reply.status, reply.headers);
    response.end('{"data":[]}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

// A name nothing resolves: only the pinned address can take the request there.
const target = (path = "/v1/models", headers: Record<string, string> = {}) => ({
  url: new URL(`http://pinned.invalid:${port}${path}`),
  headers,
  addresses: ["127.0.0.1"],
});

describe("providerProbe (136)", () => {
  it("connects to the checked address only, whatever the name resolves to, and sends the key", async () => {
    expect(await providerProbe()(target("/v1/models", { authorization: "Bearer sk-1" }))).toBe(
      "reached",
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.headers.authorization).toBe("Bearer sk-1");
    expect(seen[0]?.headers.host).toBe(`pinned.invalid:${port}`);
  });

  it("says the key was refused on 401 or 403", async () => {
    for (const status of [401, 403]) {
      answer = () => ({ status });
      expect(await providerProbe()(target())).toBe("refused");
    }
  });

  it("counts any other answer as reached, and never follows a redirect", async () => {
    answer = (path) =>
      path === "/v1/models"
        ? { status: 302, headers: { location: "/elsewhere" } }
        : { status: 200 };
    expect(await providerProbe()(target())).toBe("reached");
    expect(seen.map((request) => request.url)).toEqual(["/v1/models"]);
    answer = () => ({ status: 500 });
    expect(await providerProbe()(target())).toBe("reached");
  });

  it("says unreachable when nothing answers in time, or nothing listens", async () => {
    answer = () => "hang";
    expect(await providerProbe(200)(target())).toBe("unreachable");
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    expect(await providerProbe(2000)(target())).toBe("unreachable");
    // Listening again, for afterEach.
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });
});

describe("probeRequest (136)", () => {
  it("asks each provider for its models, with its own way of sending the key", () => {
    const shown = (name: string, endpoint: string | null) => {
      const request = probeRequest(name, endpoint, "K");
      return request && { url: request.url.href, headers: request.headers };
    };
    expect(shown("openai", null)).toEqual({
      url: "https://api.openai.com/v1/models",
      headers: { authorization: "Bearer K" },
    });
    expect(shown("openai", "https://proxy.example.com/v1")?.url).toBe(
      "https://proxy.example.com/v1/models",
    );
    expect(shown("anthropic", null)).toEqual({
      url: "https://api.anthropic.com/v1/models",
      headers: { "x-api-key": "K", "anthropic-version": "2023-06-01" },
    });
    expect(shown("nv_build", null)?.url).toBe("https://integrate.api.nvidia.com/v1/models");
    expect(shown("azure_openai", "https://r.openai.azure.com")).toEqual({
      url: "https://r.openai.azure.com/openai/models?api-version=2024-10-21",
      headers: { "api-key": "K" },
    });
    expect(shown("openai_compatible", "https://llm.example.com/v1/")?.url).toBe(
      "https://llm.example.com/v1/models",
    );
    expect(probeRequest("ollama", "http://ollama.lan:11434", null)?.url.href).toBe(
      "http://ollama.lan:11434/api/tags",
    );
    for (const name of ["azure_openai", "openai_compatible", "ollama"])
      expect(probeRequest(name, null, "K")).toBeNull();
    expect(probeRequest("nope", null, "K")).toBeNull();
  });
});
