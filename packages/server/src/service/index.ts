// `rmk-server service …` (feature 083): picks the system's backend and runs the action.
import { SERVICE_HELP, type ServiceCommand } from "./args.js";
import { type Backend, type InstallContext, installService, uninstallService } from "./install.js";
import { serviceLayout } from "./layout.js";
import { linuxBackend } from "./linux.js";
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
  if (sys.platform === "linux") {
    backend = linuxBackend(sys);
    context = { layout: serviceLayout({ platform: "linux" }), ...program };
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
