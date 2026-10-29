import { basename } from "node:path";
import { openScanKey } from "../../settings/models/scan-key";
import type {
  ScanServiceProblem,
  ScanSetupShown,
  StoredScanSetup,
} from "../../settings/models/skill-scan-policy";
import type { ScanProvider } from "../models/scan";
import {
  DEFAULT_SCAN_TIMEOUT_SECONDS,
  PROVIDER_PREFIX,
  parseScannerCommand,
  parseScanTimeout,
  providerFields,
  SCAN_PROVIDER_NAMES,
  scanProvider,
} from "./command-scanner";
import { parseServiceUrl } from "./http-scanner";

/** What the operator set (the settings file and the environment), as config.ts reads it. */
export type ScannerConfig = {
  command?: string;
  commands?: string;
  timeout?: string;
  httpHosts?: string;
  /** The scanner service's addresses and the proxy's scan key (156). */
  url?: string;
  semanticUrl?: string;
  scanKey?: string;
  env: Record<string, string>;
};

/**
 * The scanner as a service (156): its static address, its semantic one if set, and the scan key
 * the proxy checks.
 */
export type ScanService = { url: URL; semanticUrl: URL | null; key: string | null };

/**
 * What the operator set of the service (156). A static address set means the service, valid or
 * not: an invalid one is no scanner at all, never a silent fall back to the command beside it.
 * `problems` names what the tab says is wrong: an address that isn't one, or a semantic address
 * with no static one (used for nothing).
 */
export const serviceConfigOf = (
  config: ScannerConfig | undefined,
): {
  set: boolean;
  service: ScanService | null;
  problems: ScanServiceProblem[];
} => {
  const urlText = config?.url?.trim() ?? "";
  const semanticText = config?.semanticUrl?.trim() ?? "";
  const url = parseServiceUrl(urlText);
  const semanticUrl = parseServiceUrl(semanticText);
  const problems: ScanServiceProblem[] = [];
  if (urlText && !url) problems.push("url");
  if (semanticText && !semanticUrl) problems.push("semanticUrl");
  if (semanticText && !urlText) problems.push("semanticAlone");
  return {
    set: urlText !== "",
    service: url ? { url, semanticUrl, key: config?.scanKey?.trim() || null } : null,
    problems,
  };
};

export const scanServiceOf = (config: ScannerConfig | undefined): ScanService | null =>
  serviceConfigOf(config).service;

/** Where a part of the setup comes from: the operator's environment wins over root's settings. */
export type SetupSource = "environment" | "settings" | "default";

/** One of the operator's commands, as the tab names it: its position and file name, no arguments. */
export type ScannerChoice = { index: number; name: string };

/**
 * The security scan's setup (135, 136), from the operator's config, root's stored settings and the
 * AUTH_SECRET that sealed the key. `provider.variables` holds the key and goes to the scanner only;
 * `shown` is what the settings tab may show, never the key.
 */
export type ScanSetup = {
  /** Wins over `command` when set (156). */
  service: ScanService | null;
  command: string[] | null;
  provider: ScanProvider | null;
  timeoutSeconds: number;
  /** An endpoint root set in the web: checked again before semantic scans use it. */
  endpointToCheck: string | null;
  shown: ScanSetupShown;
};

const timeoutFrom = (value: string | null | undefined): number | null => {
  const seconds = Number(value);
  return value && Number.isInteger(seconds) && seconds >= 30 && seconds <= 3600 ? seconds : null;
};

/**
 * RONNE_SKILL_SCANNERS: a JSON array of commands, each as RONNE_SKILL_SCANNER is (135). One that
 * isn't valid keeps its place, so the others' indexes don't move, and can't be chosen.
 */
export const parseScannerList = (value: string | undefined): (string[] | null)[] => {
  if (!value?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.slice(0, 32).map((entry) => parseScannerCommand(JSON.stringify(entry)));
};

const commandIndexFrom = (value: string | null): number | null => {
  if (value === null || !/^\d{1,2}$/.test(value)) return null;
  return Number(value);
};

/**
 * The stored key, opened with this AUTH_SECRET for the stored provider and endpoint; "unreadable"
 * when another AUTH_SECRET sealed it, or it was typed for another provider or host.
 */
const keyFrom = (
  stored: StoredScanSetup,
  authSecret: string | undefined,
): { key: string | null; state: "set" | "unreadable" | "none" } => {
  if (!stored.keyEnc) return { key: null, state: "none" };
  const key =
    authSecret && stored.provider
      ? openScanKey(authSecret, stored.keyEnc, {
          provider: stored.provider,
          endpoint: stored.endpoint,
        })
      : null;
  return key ? { key, state: "set" } : { key: null, state: "unreadable" };
};

/** The provider root set up, as scanProvider reads the operator's: the same checks apply. */
const providerFromSettings = (stored: StoredScanSetup, key: string | null): ScanProvider | null => {
  const name = stored.provider;
  const fields = name ? providerFields(name) : null;
  if (!name || !fields) return null;
  if (fields.endpointNeeded && !stored.endpoint) return null;
  const env: Record<string, string> = { [`${PROVIDER_PREFIX}SKILLSPECTOR_PROVIDER`]: name };
  if (stored.model) env[`${PROVIDER_PREFIX}SKILLSPECTOR_MODEL`] = stored.model;
  if (fields.key && key) env[`${PROVIDER_PREFIX}${fields.key}`] = key;
  if (fields.endpoint && stored.endpoint)
    env[`${PROVIDER_PREFIX}${fields.endpoint}`] = stored.endpoint;
  return scanProvider(env);
};

/**
 * The command parts of the setup: the environment's, or root's choice from the operator's list.
 * No command runs while a service address is set (156), even one that isn't valid.
 */
const commandOf = (config: ScannerConfig | undefined, stored: StoredScanSetup) => {
  const serviceSet = serviceConfigOf(config).set;
  const list = parseScannerList(config?.commands);
  const commands = list.flatMap((command, index) =>
    command ? [{ index, name: basename(command[0] as string) }] : [],
  );
  // The environment's command wins; else root's choice from the list, or its only command.
  const envCommand = config?.command?.trim() ? parseScannerCommand(config.command) : undefined;
  const chosen = commandIndexFrom(stored.command);
  const fromList =
    chosen !== null
      ? (list[chosen] ?? null)
      : commands.length === 1
        ? (list[commands[0]?.index ?? 0] ?? null)
        : null;
  const command = serviceSet ? null : envCommand !== undefined ? envCommand : fromList;
  return { commands, envCommand, chosen, fromList, command, serviceSet };
};

/**
 * Whether a scanner is set: a service address (156) or a command to run (135, 136). For what needs
 * no more than that (queuing on send, the review page): it never opens the key.
 */
export const scannerSet = (config: ScannerConfig | undefined, stored: StoredScanSetup): boolean =>
  scanServiceOf(config) !== null || commandOf(config, stored).command !== null;

export const scanSetup = (
  config: ScannerConfig | undefined,
  stored: StoredScanSetup,
  authSecret: string | undefined,
): ScanSetup => {
  const env = config?.env ?? {};
  const { commands, envCommand, chosen, fromList, command, serviceSet } = commandOf(config, stored);
  const { service, problems } = serviceConfigOf(config);

  // The environment's timeout wins when set; one that isn't valid is 300, as in 135.
  const envTimeout = config?.timeout?.trim() ? parseScanTimeout(config.timeout) : null;
  const storedTimeout = timeoutFrom(stored.timeout);

  // Any provider variable in the environment means the operator manages the provider.
  const envProvider = Object.keys(env).some((name) => name.startsWith(PROVIDER_PREFIX));
  const key = keyFrom(stored, authSecret);
  const provider = envProvider ? scanProvider(env) : providerFromSettings(stored, key.key);

  return {
    service,
    command,
    provider,
    timeoutSeconds: envTimeout ?? storedTimeout ?? DEFAULT_SCAN_TIMEOUT_SECONDS,
    endpointToCheck: !envProvider && provider && stored.endpoint ? stored.endpoint : null,
    shown: {
      commandFrom: serviceSet
        ? "service"
        : envCommand !== undefined
          ? "environment"
          : fromList
            ? "list"
            : null,
      commands,
      chosenCommand: envCommand !== undefined ? null : chosen,
      commandDropped:
        !serviceSet && envCommand === undefined && chosen !== null && fromList === null,
      serviceProblems: problems,
      timeoutFrom: envTimeout ? "environment" : storedTimeout ? "settings" : "default",
      timeoutSeconds: envTimeout ?? storedTimeout ?? DEFAULT_SCAN_TIMEOUT_SECONDS,
      providerFrom: envProvider ? "environment" : provider ? "settings" : null,
      providers: SCAN_PROVIDER_NAMES.flatMap((name) => {
        const fields = providerFields(name);
        return fields
          ? [
              {
                name,
                takesKey: fields.key !== null,
                hasEndpoint: fields.endpoint !== null,
                needsEndpoint: fields.endpointNeeded,
              },
            ]
          : [];
      }),
      stored: {
        provider: stored.provider || null,
        model: stored.model || null,
        endpoint: stored.endpoint || null,
        key: key.state,
      },
    },
  };
};
