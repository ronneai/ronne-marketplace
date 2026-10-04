// `rmk-server service …` (feature 083): picks the system's backend and runs the action.
import { SERVICE_HELP, type ServiceCommand } from "./args.js";
import { type Backend, type InstallContext, installService, uninstallService } from "./install.js";
import { serviceLayout } from "./layout.js";
import { linuxBackend } from "./linux.js";
import { macBackend, macPrefix } from "./macos.js";
import type { System } from "./system.js";

export const runService = async (
  sys: System,
  command: Exclude<ServiceCommand, { kind: "error" }>,
  program: { node: string; entry: string; version: string },
): Promise<number> => {
  if (command.kind === "service-help") {
    sys.out(SERVICE_HELP);
    return 0;
  }
  let backend: Backend;
  let context: InstallContext;
  const install = command.action === "install" ? command.options : undefined;
  if (install?.user && sys.platform !== "darwin") {
    sys.err("rmk-server: --user is for macOS; on Linux the service always has its own account.\n");
    return 1;
  }
  if (sys.platform === "linux") {
    backend = linuxBackend(sys);
    context = { layout: serviceLayout({ platform: "linux" }), ...program };
  } else if (sys.platform === "darwin") {
    backend = macBackend(sys);
    let user: { name: string; group: string } | undefined;
    if (install?.user) {
      // Under sudo, the signed-in account is SUDO_USER.
      const name = sys.env.SUDO_USER;
      if (!name || name === "root") {
        sys.err(
          "rmk-server: --user runs the service as you, so run it with sudo from your own account.\n",
        );
        return 1;
      }
      user = { name, group: sys.run("id", ["-gn", name]).stdout.trim() || "staff" };
    }
    context = {
      layout: serviceLayout({
        platform: "darwin",
        prefix: macPrefix(program.entry),
        ...(user ? { user } : {}),
      }),
      ...program,
    };
  } else {
    sys.err(
      `rmk-server: service isn't available on ${sys.platform} yet. Run rmk-server start under your own supervisor meanwhile.\n`,
    );
    return 1;
  }

  try {
    if (command.action === "install")
      return await installService(sys, backend, context, command.options);
    if (command.action === "uninstall")
      return await uninstallService(sys, backend, context, command.deleteData);
    sys.err(`rmk-server: service ${command.action} isn't available yet.\n`);
    return 1;
  } catch (error) {
    sys.err(`rmk-server: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
};
