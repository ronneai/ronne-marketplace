import { randomBytes } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, type Page, test } from "@playwright/test";
import type { Instance } from "./harness";
import { recordSecret } from "./secrets";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Root's scanner setup (136), with a fake LLM provider on this machine (the harness allows
 * 127.0.0.1 in RONNE_SKILL_SCANNER_HTTP_HOSTS): root sets an OpenAI-compatible provider and its
 * key, tests the connection, saves, and sees only "Key set" from then on; Test connection uses
 * the stored key; Remove takes it away. The key is recorded for the log check, which fails the run
 * if a server log line holds it. The provider is cleared at the end.
 */
const instance: Instance = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main;
// From node:crypto, not Math.random(): CodeQL fails a value that reaches recordSecret otherwise
// (docs/knowledge/codeql-randomness.md).
const KEY = `sk-e2e-${randomBytes(12).toString("hex")}`;

let server: Server;
let endpoint: string;
let status = 200;
const seen: { url: string; headers: IncomingHttpHeaders }[] = [];

test.beforeAll(async () => {
  recordSecret(instance, KEY);
  server = createServer((request, response) => {
    seen.push({ url: request.url ?? "", headers: request.headers });
    response.writeHead(status, { "content-type": "application/json" });
    response.end('{"data":[{"id":"fake-model"}]}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const signIn = async (page: Page) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.scanRoot);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

const tab = async (page: Page) => {
  await page.goto("/admin/settings?tab=scan");
  return page.getByRole("form", { name: "Security scan" });
};

test("root sets up a provider with a write-only key, tests it, and removes it", async ({
  page,
}) => {
  await signIn(page);
  let form = await tab(page);
  // The harness sets RONNE_SKILL_SCANNER: the command is the server's.
  await expect(form.getByText("Set on the server, in RONNE_SKILL_SCANNER.")).toBeVisible();

  await form.getByLabel("Provider", { exact: true }).selectOption("openai_compatible");
  await form.getByLabel("Model", { exact: true }).fill("fake-model");
  await form.getByLabel("Endpoint", { exact: true }).fill(endpoint);
  await form.getByLabel("API key", { exact: true }).fill(KEY);

  try {
    await form.getByRole("button", { name: "Test connection" }).click();
    const host = new URL(endpoint).host;
    await expect(form.getByText(`Reached ${host}.`)).toBeVisible();
    expect(seen.at(-1)).toMatchObject({ url: "/v1/models" });
    expect(seen.at(-1)?.headers.authorization).toBe(`Bearer ${KEY}`);

    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText("Security scan saved.")).toBeVisible();

    // From now on the page knows only that a key is stored.
    form = await tab(page);
    await expect(form.getByText("Key set")).toBeVisible();
    await expect(form.getByLabel("API key", { exact: true })).toHaveCount(0);
    expect(await page.content()).not.toContain(KEY);

    // Test connection with the stored key: the provider gets it, and refuses it this time.
    status = 401;
    await form.getByRole("button", { name: "Test connection" }).click();
    await expect(form.getByText(`${host} refused the key.`)).toBeVisible();
    expect(seen.at(-1)?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(await page.content()).not.toContain(KEY);

    // Replace: an empty field; a new key saved replaces the old one.
    status = 200;
    await form.getByRole("button", { name: "Replace", exact: true }).click();
    await expect(form.getByLabel("API key", { exact: true })).toHaveValue("");
    await form.getByLabel("API key", { exact: true }).fill(`${KEY}-2`);
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText("Security scan saved.")).toBeVisible();
    form = await tab(page);
    await expect(form.getByText("Key set")).toBeVisible();
    await form.getByRole("button", { name: "Test connection" }).click();
    await expect(form.getByText(`Reached ${host}.`)).toBeVisible();
    expect(seen.at(-1)?.headers.authorization).toBe(`Bearer ${KEY}-2`);

    // Remove, then Keep: back to Key set, and nothing asks the server to remove it.
    await form.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(form.locator('input[name="removeKey"]')).toHaveCount(1);
    await form.getByRole("button", { name: "Keep it", exact: true }).click();
    await expect(form.getByText("Key set")).toBeVisible();
    await expect(form.locator('input[name="removeKey"]')).toHaveCount(0);
    await expect(form.getByText("The stored key is removed when you save.")).toHaveCount(0);

    // Remove, then Save: the key is gone.
    await form.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(form.getByText("The stored key is removed when you save.")).toBeVisible();
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText("Security scan saved.")).toBeVisible();
    form = await tab(page);
    await expect(form.getByText("Key set")).toHaveCount(0);
    await expect(form.getByLabel("API key", { exact: true })).toHaveValue("");
  } finally {
    // Back to no provider, for the other tests.
    form = await tab(page);
    await form.getByLabel("Provider", { exact: true }).selectOption("");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText(/Security scan saved\.|Nothing changed/)).toBeVisible();
  }
});

test("refuses an endpoint on a private address that the operator didn't allow", async ({
  page,
}) => {
  await signIn(page);
  const form = await tab(page);
  await form.getByLabel("Provider", { exact: true }).selectOption("openai_compatible");
  await form.getByLabel("Endpoint", { exact: true }).fill("https://169.254.169.254/v1");
  await form.getByLabel("API key", { exact: true }).fill(KEY);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText(/private, loopback or link-local address/)).toBeVisible();
  await form.getByRole("button", { name: "Test connection" }).click();
  await expect(form.getByText(/private, loopback or link-local address/).first()).toBeVisible();
});
