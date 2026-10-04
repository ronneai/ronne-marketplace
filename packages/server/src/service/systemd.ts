// A service definition as a systemd unit (feature 083).
import type { ServiceDefinition } from "./model.js";

export const MANAGED_MARKER = "Managed by rmk-server";

/** systemd expands % specifiers and $VARIABLES in these lines, so both are doubled. */
const escapeSpecifiers = (value: string): string =>
  value.replaceAll("%", "%%").replaceAll("$", "$$$$");

const PLAIN = /^[A-Za-z0-9_@+=:,./-]+$/;

/** One word of ExecStart= or Environment=, quoted when it holds anything but plain characters. */
export const systemdQuote = (value: string): string => {
  const escaped = escapeSpecifiers(value);
  if (PLAIN.test(value)) return escaped;
  return `"${escaped.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
};

export const renderSystemdUnit = (definition: ServiceDefinition): string => {
  const after = ["network-online.target", ...definition.after.map((name) => `${name}.service`)];
  const lines = [
    `# ${MANAGED_MARKER} (feature 083). \`sudo rmk-server service install\` rewrites this file,`,
    "# and `sudo rmk-server service uninstall` removes it.",
    "[Unit]",
    `Description=${definition.description}`,
    "Documentation=https://github.com/ronneai/ronne-marketplace",
    `After=${after.join(" ")}`,
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `User=${definition.user}`,
    `Group=${definition.group}`,
    `WorkingDirectory=${systemdQuote(definition.workingDirectory)}`,
    ...Object.entries(definition.environment).map(
      ([key, value]) => `Environment=${systemdQuote(`${key}=${value}`)}`,
    ),
    `ExecStart=${[definition.program, ...definition.args].map(systemdQuote).join(" ")}`,
    "Restart=on-failure",
    "RestartSec=5",
    // Node ends with 143 on systemd's SIGTERM: a clean stop, not a failure.
    "SuccessExitStatus=143",
    // SQLite closes its files on SIGTERM; give it time before SIGKILL.
    "TimeoutStopSec=30",
    "",
    "# Hardening that leaves Node.js and Caddy working.",
    "NoNewPrivileges=true",
    "ProtectSystem=strict",
    `ReadWritePaths=${definition.writablePaths.map(systemdQuote).join(" ")}`,
    // A program installed under /home (nvm, a user prefix) must stay readable.
    `ProtectHome=${definition.readsHome ? "read-only" : "true"}`,
    "PrivateTmp=true",
    ...(definition.bindsLowPorts
      ? ["AmbientCapabilities=CAP_NET_BIND_SERVICE", "CapabilityBoundingSet=CAP_NET_BIND_SERVICE"]
      : []),
    "",
    "[Install]",
    "WantedBy=multi-user.target",
  ];
  return `${lines.join("\n")}\n`;
};
