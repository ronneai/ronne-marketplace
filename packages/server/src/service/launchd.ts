// A service definition as a launchd property list (feature 083), for /Library/LaunchDaemons.
import type { ServiceDefinition } from "./model.js";
import { MANAGED_MARKER } from "./systemd.js";

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const string = (value: string): string => `<string>${escapeXml(value)}</string>`;

export const renderLaunchdPlist = (definition: ServiceDefinition): string => {
  const entry = (key: string, value: string): string => `  <key>${key}</key>\n  ${value}`;
  const environment = Object.entries(definition.environment)
    .map(([key, value]) => `    <key>${escapeXml(key)}</key>\n    ${string(value)}`)
    .join("\n");
  const args = [definition.program, ...definition.args]
    .map((arg) => `    ${string(arg)}`)
    .join("\n");
  const body = [
    entry("Label", string(definition.label)),
    entry("ProgramArguments", `<array>\n${args}\n  </array>`),
    entry("UserName", string(definition.user)),
    entry("GroupName", string(definition.group)),
    entry("WorkingDirectory", string(definition.workingDirectory)),
    entry("EnvironmentVariables", `<dict>\n${environment}\n  </dict>`),
    // Started at boot, and again whenever it stops.
    entry("RunAtLoad", "<true/>"),
    entry("KeepAlive", "<true/>"),
    entry("ThrottleInterval", "<integer>5</integer>"),
    // SQLite closes its files on SIGTERM; give it time before SIGKILL.
    entry("ExitTimeOut", "<integer>30</integer>"),
    ...(definition.logFile
      ? [
          entry("StandardOutPath", string(definition.logFile)),
          entry("StandardErrorPath", string(definition.logFile)),
        ]
      : []),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    `<!-- ${MANAGED_MARKER} (feature 083). \`sudo rmk-server service install\` rewrites this file,`,
    "     and `sudo rmk-server service uninstall` removes it. -->",
    '<plist version="1.0">',
    "<dict>",
    ...body,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
};
