// `rmk-server service …` (feature 083): picks the system's backend and runs the action.

import { win32 } from "node:path";
import { SERVICE_HELP, type ServiceCommand } from "./args.js";
import { controlService, serviceLogs, serviceStatus } from "./control.js";
import { type Backend, type InstallContext, installService, uninstallService } from "./install.js";
import { serviceLayout } from "./layout.js";
import { linuxBackend } from "./linux.js";
import { macBackend, macPrefix } from "./macos.js";
import type { System } from "./system.js";
import { windowsBackend } from "./windows.js";

/** The backend and layout for this system, or why there's none. */
export const serviceTarget = (
  sys: System,
  program: { node: string; entry: string; version: string },
  asUser = false,
): { backend: Backend; context: InstallContext } | { error: string } => {
  if (asUser && sys.platform !== "darwin")
    return {
      error: `--user is for macOS; on ${sys.platform === "win32" ? "Windows" : "Linux"} the service always has its own account.`,
    };
  if (sys.platform === "win32") {
    const layout = serviceLayout({
      platform: "win32",
      ...(sys.env.ProgramData ? { programData: sys.env.ProgramData } : {}),
    });
    // The package's WinSW: …\@ronneai\marketplace\dist\bin.js → …\vendor\winsw\.
    const winsw = win32.join(
      win32.dirname(program.entry),
      "..",
      "vendor",
      "winsw",
      "WinSW.NET461.exe",
    );
    return { backend: windowsBackend(sys, { layout, winsw }), context: { layout, ...program } };
  }
  if (sys.platform === "linux")
    return {
      backend: linuxBackend(sys),
      context: { layout: serviceLayout({ platform: "linux" }), ...program },
    };
  if (sys.platform === "darwin") {
    let user: { name: string; group: string } | undefined;
    if (asUser) {
      // Under sudo, the signed-in account is SUDO_USER.
      const name = sys.env.SUDO_USER;
      if (!name || name === "root")
        return {
          error: "--user runs the service as you, so run it with sudo from your own account.",
        };
      user = { name, group: sys.run("id", ["-gn", name]).stdout.trim() || "staff" };
    }
    return {
      backend: macBackend(sys),
      context: {
        layout: serviceLayout({
          platform: "darwin",
          prefix: macPrefix(program.entry),
          ...(user ? { user } : {}),
        }),
        ...program,
      },
    };
  }
  return {
    error: `service isn't available on ${sys.platform} yet. Run rmk-server start under your own supervisor meanwhile.`,
  };
};

export const runService = async (
  sys: System,
  command: Exclude<ServiceCommand, { kind: "error" }>,
  program: { node: string; entry: string; version: string },
): Promise<number> => {
  if (command.kind === "service-help") {
    sys.out(SERVICE_HELP);
    return 0;
  }
  const target = serviceTarget(sys, program, command.action === "install" && command.options.user);
  if ("error" in target) {
    sys.err(`rmk-server: ${target.error}\n`);
    return 1;
  }
  const { backend, context } = target;
  try {
    switch (command.action) {
      case "install":
        return await installService(sys, backend, context, command.options);
      case "uninstall":
        return await uninstallService(sys, backend, context, command.deleteData);
      case "status":
        return await serviceStatus(sys, backend, context);
      case "logs":
        return serviceLogs(sys, backend, context);
      default:
        return await controlService(sys, backend, context, command.action);
    }
  } catch (error) {
    sys.err(`rmk-server: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
};
