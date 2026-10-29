import { requirePermission } from "../../identity/models/permissions";
import { checkEndpoint, type EndpointProblem, type Resolver } from "../../scans/models/endpoint";
import { providerFields } from "../../scans/services/command-scanner";
import { type Probe, type ProbeResult, probeRequest } from "../../scans/services/provider-probe";
import {
  InvalidScanCommandError,
  InvalidScanEndpointError,
  InvalidScanKeyError,
  InvalidScanModelError,
  InvalidScanProviderError,
  InvalidScanTimeoutError,
  ScanEndpointCredentialsError,
  ScanEndpointInternalError,
  ScanEndpointNotHttpsError,
  ScanEndpointUnresolvedError,
  type SettingsError,
} from "../exceptions/errors";
import { openScanKey, originOf, sealScanKey } from "../models/scan-key";
import {
  type ScanSetupShown,
  SKILL_SCAN_COMMAND_KEY,
  SKILL_SCAN_ENDPOINT_KEY,
  SKILL_SCAN_KEY_ENC_KEY,
  SKILL_SCAN_MODEL_KEY,
  SKILL_SCAN_PROVIDER_KEY,
  SKILL_SCAN_TIMEOUT_KEY,
  type StoredScanSetup,
} from "../models/skill-scan-policy";
import type { SettingsRepository } from "../repositories/settings-repository";
import type { SettingsActor, SettingsDeps } from "./settings";

/** Root's stored setup, as `scanSetup` reads it (136). */
export const storedScanSetup = async (repo: SettingsRepository): Promise<StoredScanSetup> => {
  const [provider, model, endpoint, timeout, command, keyEnc] = await Promise.all(
    [
      SKILL_SCAN_PROVIDER_KEY,
      SKILL_SCAN_MODEL_KEY,
      SKILL_SCAN_ENDPOINT_KEY,
      SKILL_SCAN_TIMEOUT_KEY,
      SKILL_SCAN_COMMAND_KEY,
      SKILL_SCAN_KEY_ENC_KEY,
    ].map((key) => repo.get(key)),
  );
  return {
    provider: provider?.value ?? null,
    model: model?.value ?? null,
    endpoint: endpoint?.value ?? null,
    timeout: timeout?.value ?? null,
    command: command?.value ?? null,
    keyEnc: keyEnc?.value ?? null,
  };
};

/** What the save needs besides the form: the current setup, and how keys and endpoints are kept. */
export type ScanSetupContext = {
  /** The setup now: what the environment fixes, and the operator's commands. */
  shown: ScanSetupShown;
  authSecret: string | undefined;
  allowedHosts: ReadonlySet<string>;
  resolve: Resolver;
};

export type ScanSetupInput = {
  provider: unknown;
  model: unknown;
  endpoint: unknown;
  timeout: unknown;
  command: unknown;
  /** Typed only to set or replace it: empty keeps the stored key. */
  key: unknown;
  removeKey: unknown;
};

const MAX_MODEL = 128;
const MAX_KEY = 4096;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it refuses.
const CONTROL = /[\u0000-\u001f\u007f]/;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const ENDPOINT_ERRORS: Record<EndpointProblem, new () => SettingsError> = {
  "not a url": InvalidScanEndpointError,
  "not https": ScanEndpointNotHttpsError,
  "credentials in url": ScanEndpointCredentialsError,
  "internal address": ScanEndpointInternalError,
  unresolved: ScanEndpointUnresolvedError,
};

const hostOf = (endpoint: string | null): string | null => {
  if (!endpoint) return null;
  try {
    return new URL(endpoint).host;
  } catch {
    return null;
  }
};

/** What the audit keeps of a setup: the endpoint's host only, never its path, query or the key. */
const summary = (setup: StoredScanSetup) => ({
  provider: setup.provider || null,
  model: setup.model || null,
  endpointHost: hostOf(setup.endpoint),
  timeout: setup.timeout || null,
  command: setup.command || null,
});

/**
 * Root sets the scanner's setup (136): the command from the operator's list, the timeout, and the
 * provider with its model, endpoint and key. What the environment sets can't be changed here. The
 * key is write-only: sealed, never returned. A key kept while the provider or the endpoint's origin
 * changes is removed, so it never goes somewhere it wasn't typed for. Audited as
 * `settings.skill_scan` with the provider, model, endpoint host, timeout, command and what
 * happened to the key, never the key.
 */
export const setSkillScanSetup = async (
  deps: SettingsDeps,
  actor: SettingsActor,
  value: ScanSetupInput,
  context: ScanSetupContext,
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  const { shown } = context;
  const envProvider = shown.providerFrom === "environment";

  const provider = text(value.provider);
  const fields = provider ? providerFields(provider) : null;
  if (provider && !fields) throw new InvalidScanProviderError();

  const model = text(value.model);
  if (Array.from(model).length > MAX_MODEL || CONTROL.test(model))
    throw new InvalidScanModelError();

  const timeoutText = text(value.timeout);
  const seconds = Number(timeoutText);
  if (timeoutText && !(Number.isInteger(seconds) && seconds >= 30 && seconds <= 3600))
    throw new InvalidScanTimeoutError();

  const commandText =
    typeof value.command === "number" ? String(value.command) : text(value.command);
  // The environment's command, or the scanner service (156), fixes it: root's choice stays as is.
  const commandFixed = shown.commandFrom === "environment" || shown.commandFrom === "service";
  if (
    commandText &&
    !commandFixed &&
    !shown.commands.some((choice) => String(choice.index) === commandText)
  )
    throw new InvalidScanCommandError();

  // The value as typed, kept only in this call: never logged, returned or audited.
  const key = typeof value.key === "string" ? value.key.trim() : "";
  if (key && (!fields?.key || key.length > MAX_KEY || CONTROL.test(key)))
    throw new InvalidScanKeyError();
  const removeKey =
    value.removeKey === true || value.removeKey === "on" || value.removeKey === "true";

  // Checked before the transaction: a lookup shouldn't hold it open. Stored as checked.
  let endpoint = "";
  const typedEndpoint = text(value.endpoint);
  if (!envProvider && fields?.endpoint && typedEndpoint) {
    const checked = await checkEndpoint(typedEndpoint, context);
    if (!checked.ok) throw new ENDPOINT_ERRORS[checked.problem]();
    endpoint = checked.url.href;
  }
  if (key && !context.authSecret) throw new InvalidScanKeyError();

  const at = (deps.now ?? (() => new Date()))();
  return deps.repo.transaction(async (repo) => {
    const from = await storedScanSetup(repo);
    const to: StoredScanSetup = { ...from };
    if (!commandFixed) to.command = commandText;
    if (shown.timeoutFrom !== "environment") to.timeout = timeoutText;
    let keyEvent: "set" | "replaced" | "removed" | null = null;
    if (!envProvider) {
      to.provider = provider;
      to.model = model;
      to.endpoint = endpoint;
      const stored = Boolean(from.keyEnc);
      const moved =
        (from.provider ?? "") !== provider || originOf(from.endpoint) !== originOf(endpoint);
      if (key) {
        to.keyEnc = sealScanKey(context.authSecret as string, key, { provider, endpoint });
        keyEvent = stored ? "replaced" : "set";
      } else if (stored && (removeKey || moved || !fields?.key)) {
        to.keyEnc = "";
        keyEvent = "removed";
      }
    }
    const pairs: [string, keyof StoredScanSetup][] = [
      [SKILL_SCAN_PROVIDER_KEY, "provider"],
      [SKILL_SCAN_MODEL_KEY, "model"],
      [SKILL_SCAN_ENDPOINT_KEY, "endpoint"],
      [SKILL_SCAN_TIMEOUT_KEY, "timeout"],
      [SKILL_SCAN_COMMAND_KEY, "command"],
      [SKILL_SCAN_KEY_ENC_KEY, "keyEnc"],
    ];
    const changed = pairs.filter(([, field]) => (from[field] ?? "") !== (to[field] ?? ""));
    if (changed.length === 0) return { changed: false };
    const by = actor.user?.id ?? null;
    for (const [settingKey, field] of changed) await repo.set(settingKey, to[field] ?? "", by, at);
    await repo.recordAudit(
      {
        actorId: by,
        action: "settings.skill_scan",
        target: { type: "instance" },
        metadata: {
          setup: { from: summary(from), to: summary(to) },
          ...(keyEvent ? { keyChange: keyEvent } : {}),
        },
        ipAddress: actor.ip,
      },
      at,
    );
    return { changed: true };
  });
};

/**
 * Test connection (136): one request to the provider root is setting up, from the form as it is,
 * with the key typed now or the stored one (only when it was typed for this provider and
 * endpoint). The endpoint is checked as on save and the request goes to the checked addresses
 * only. Says reached, refused or unreachable, and the host; nothing else of the answer.
 */
export const testSkillScanConnection = async (
  deps: SettingsDeps,
  actor: SettingsActor,
  value: Pick<ScanSetupInput, "provider" | "endpoint" | "key">,
  context: ScanSetupContext & { probe: Probe },
): Promise<{ result: ProbeResult; host: string }> => {
  requirePermission(actor.user, "settings.manage");
  if (context.shown.providerFrom === "environment") throw new InvalidScanProviderError();
  const provider = text(value.provider);
  const fields = provider ? providerFields(provider) : null;
  if (!fields) throw new InvalidScanProviderError();
  let endpoint: string | null = null;
  const typedEndpoint = text(value.endpoint);
  if (fields.endpoint && typedEndpoint) {
    const checked = await checkEndpoint(typedEndpoint, context);
    if (!checked.ok) throw new ENDPOINT_ERRORS[checked.problem]();
    endpoint = checked.url.href;
  }
  const typedKey = typeof value.key === "string" ? value.key.trim() : "";
  if (typedKey && (!fields.key || typedKey.length > MAX_KEY || CONTROL.test(typedKey)))
    throw new InvalidScanKeyError();
  let key: string | null = typedKey || null;
  if (!key && fields.key) {
    const stored = await storedScanSetup(deps.repo);
    key =
      stored.keyEnc && context.authSecret
        ? openScanKey(context.authSecret, stored.keyEnc, { provider, endpoint })
        : null;
    if (!key) throw new InvalidScanKeyError();
  }
  const request = probeRequest(provider, endpoint, key);
  if (!request) throw new InvalidScanEndpointError();
  // The provider's own host is checked too, so the request goes to the addresses checked.
  const target = await checkEndpoint(request.url.href, context);
  if (!target.ok) throw new ENDPOINT_ERRORS[target.problem]();
  const result = await context.probe({
    url: target.url,
    headers: request.headers,
    addresses: target.addresses,
  });
  return { result, host: target.url.host };
};
