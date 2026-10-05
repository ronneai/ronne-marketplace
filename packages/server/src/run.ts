// Runs rmk-server's commands (feature 082). Everything runs in this process: the web app's
// compiled scripts are imported, not spawned, so stopping rmk-server stops the server.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HELP, parseArgs } from "./cli.js";
import { MIN_NODE, nodeTooOld } from "./node-version.js";
import { dataDir as defaultDataDir } from "./paths.js";
import { isSetUp, serverEnv } from "./server-env.js";
import { scriptForService } from "./service/control.js";
import { runService, serviceTarget } from "./service/index.js";
import { stableNodePath } from "./service/macos.js";
import { realSystem } from "./service/system.js";

const here = dirname(fileURLToPath(import.meta.url));
/** The web app, copied into the package at pack time (scripts/assemble.mjs). */
const webDir = join(here, "..", "app", "apps", "web");

const packageVersion = (): string =>
  (JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string })
    .version;

const fail = (message: string): number => {
  process.stderr.write(`rmk-server: ${message}\n`);
  return 1;
};

const portFree = (port: number, host: string): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });

const openBrowser = (url: string): void => {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(command, args, { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  } catch {
    // No browser (a server over SSH): the address is in the log.
  }
};

/** Opens the address once the server answers, without holding the process open. */
const openWhenReady = (url: string): void => {
  const deadline = Date.now() + 60_000;
  const tick = (): void => {
    fetch(`${url}/api/health`)
      .then(() => openBrowser(url))
      .catch(() => {
        if (Date.now() < deadline) setTimeout(tick, 500).unref();
      });
  };
  setTimeout(tick, 500).unref();
};

const importScript = async (name: string): Promise<void> => {
  await import(pathToFileURL(join(webDir, "dist-scripts", `${name}.mjs`)).href);
};

/** This Node and this rmk-server, as a service runs them. */
const programPaths = () => ({
  node: stableNodePath(process.execPath),
  entry: realpathSync(join(here, "bin.js")),
  version: packageVersion(),
});

export const main = async (argv: string[]): Promise<number | undefined> => {
  const command = parseArgs(argv);
  if (command.kind === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (command.kind === "version") {
    // A self-contained bundle (084) also names the Node.js it brings, which nothing else shows.
    const bundled =
      process.env.RONNE_BUNDLE === "1" ? `Node.js ${process.versions.node} (bundled)\n` : "";
    process.stdout.write(`${packageVersion()}\n${bundled}`);
    return 0;
  }
  if (command.kind === "error") return fail(command.message);
  if (nodeTooOld(process.versions.node))
    return fail(`Node.js ${MIN_NODE} or later is needed; this is ${process.versions.node}.`);
  if (command.kind === "service" || command.kind === "service-help")
    // The service runs this same Node and this file, wherever npm put them.
    return runService(realSystem(), command, programPaths());
  if (!existsSync(join(webDir, "dist-scripts")))
    return fail(
      `the web app isn't in this package (${webDir}). From the repository, run: pnpm --filter @ronneai/marketplace assemble`,
    );

  if (command.kind === "script") {
    // With the service installed, the scripts work on its data, as its account.
    const target = serviceTarget(realSystem(), programPaths());
    if (!("error" in target)) {
      const code = await scriptForService(
        realSystem(),
        target.context,
        command.script,
        command.args,
      );
      if (code !== undefined) return code;
    }
  }

  const dir = defaultDataDir(process.platform, process.env, homedir());
  mkdirSync(dir, { recursive: true });
  const host = command.kind === "start" ? command.host : undefined;
  Object.assign(
    process.env,
    serverEnv({ env: process.env, dataDir: dir, port: command.port, host }),
  );

  if (command.kind === "script") {
    // The script reads its flags from process.argv, as it does under `pnpm run`.
    process.argv = [
      process.argv[0] as string,
      join(webDir, "dist-scripts", `${command.script}.mjs`),
      ...command.args,
    ];
    await importScript(command.script);
    return undefined; // the script sets the exit code
  }

  if (!(await portFree(command.port, command.host)))
    return fail(
      `port ${command.port} is in use on ${command.host}. Choose another with --port, for example rmk-server --port ${command.port + 10}.`,
    );
  const envFile = process.env.RONNE_ENV_FILE as string;
  const firstStart = !isSetUp(existsSync(envFile) ? readFileSync(envFile, "utf8") : undefined);
  process.stdout.write(`Data folder: ${dir}\n`);
  if (command.open && firstStart && process.stdout.isTTY)
    openWhenReady(`http://localhost:${command.port}`);
  // start.mjs checks the folder, applies pending migrations and starts Next.js's server here.
  await importScript("start");
  return undefined;
};
