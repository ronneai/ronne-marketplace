// A service definition as WinSW 2.12's XML (feature 086). Node.js can't answer the Windows Service
// Control Manager, so each service runs WinSW (renamed <name>-service.exe) beside this file, and
// WinSW starts and watches the program.
import type { ServiceDefinition } from "./model.js";
import { MANAGED_MARKER } from "./systemd.js";

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/**
 * One argument as Windows' CommandLineToArgvW reads it back: quoted when it has a space, a tab or a
 * quote; inside quotes a quote is \" and the backslashes before one (or before the closing quote)
 * are doubled.
 */
export const windowsQuote = (value: string): string => {
  if (value !== "" && !/[\s"]/.test(value)) return value;
  let out = '"';
  let slashes = 0;
  for (const char of value) {
    if (char === "\\") {
      slashes++;
      continue;
    }
    if (char === '"') {
      out += "\\".repeat(slashes * 2 + 1) + char;
    } else {
      out += "\\".repeat(slashes) + char;
    }
    slashes = 0;
  }
  return `${out}${"\\".repeat(slashes * 2)}"`;
};

/** NT SERVICE\rmk-server → the domain and user WinSW's <serviceaccount> takes. */
const account = (user: string): { domain: string; user: string } => {
  const at = user.indexOf("\\");
  return at < 0 ? { domain: ".", user } : { domain: user.slice(0, at), user: user.slice(at + 1) };
};

export const renderWinswXml = (definition: ServiceDefinition): string => {
  const { domain, user } = account(definition.user);
  const lines = [
    `<!-- ${MANAGED_MARKER} (feature 086). \`rmk-server service install\` rewrites this file,`,
    "     and `rmk-server service uninstall` removes it. -->",
    "<service>",
    `  <id>${escapeXml(definition.name)}</id>`,
    `  <name>${escapeXml(definition.description)}</name>`,
    `  <description>${escapeXml(definition.description)}, run by WinSW.</description>`,
    `  <executable>${escapeXml(definition.program)}</executable>`,
    `  <arguments>${escapeXml(definition.args.map(windowsQuote).join(" "))}</arguments>`,
    `  <workingdirectory>${escapeXml(definition.workingDirectory)}</workingdirectory>`,
    ...Object.entries(definition.environment).map(
      ([key, value]) => `  <env name="${escapeXml(key)}" value="${escapeXml(value)}"/>`,
    ),
    // A virtual account (NT SERVICE\<id>): no password, made and removed with the service.
    "  <serviceaccount>",
    `    <domain>${escapeXml(domain)}</domain>`,
    `    <user>${escapeXml(user)}</user>`,
    "  </serviceaccount>",
    "  <startmode>Automatic</startmode>",
    ...definition.after.map((name) => `  <depend>${escapeXml(name)}</depend>`),
    // Restarted on failure: three times ten seconds apart, then every minute (the last repeats).
    '  <onfailure action="restart" delay="10 sec"/>',
    '  <onfailure action="restart" delay="10 sec"/>',
    '  <onfailure action="restart" delay="10 sec"/>',
    '  <onfailure action="restart" delay="60 sec"/>',
    "  <resetfailure>1 hour</resetfailure>",
    // Stopped with Ctrl+C first, so SQLite closes its files, then after 30 seconds for good.
    "  <stopparentprocessfirst>true</stopparentprocessfirst>",
    "  <stoptimeout>30 sec</stoptimeout>",
    ...(definition.logDir
      ? [
          `  <logpath>${escapeXml(definition.logDir)}</logpath>`,
          '  <log mode="roll-by-size">',
          "    <sizeThreshold>10240</sizeThreshold>",
          "    <keepFiles>5</keepFiles>",
          "  </log>",
        ]
      : []),
    "</service>",
    "",
  ];
  return lines.join("\r\n");
};
