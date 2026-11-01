import { join } from "node:path";

type Env = Record<string, string | undefined>;

/**
 * How this instance was started, from RONNE_RUNTIME: `docker` (the image, 005), `npm` (the
 * `@ronneai/marketplace` package and its `rmk-server` command, 082), or `node` (a clone).
 */
export type Runtime = "docker" | "npm" | "node";

export const runtimeOf = (env: Env = process.env): Runtime =>
  env.RONNE_RUNTIME === "docker" || env.RONNE_RUNTIME === "npm" ? env.RONNE_RUNTIME : "node";

/**
 * Where a default data file goes: `./data/<name>` next to the app, or, for the npm package, in its
 * data folder (RONNE_DATA_DIR). An installed package's own folder may be read-only, and in Docker
 * `./data` is the volume already.
 */
export const defaultDataPath = (name: string, env: Env = process.env): string =>
  runtimeOf(env) === "npm" && env.RONNE_DATA_DIR
    ? join(env.RONNE_DATA_DIR, name)
    : `./data/${name}`;

/** The address to suggest when PUBLIC_URL isn't set: this machine, on the port the server uses. */
export const defaultPublicUrl = (env: Env = process.env): string =>
  `http://localhost:${env.PORT || "3000"}`;

/**
 * A script's command where it runs: `rmk-server <name>` for the npm package, `pnpm run <name>` in a
 * clone and inside the Docker container.
 */
export const scriptCommand = (name: string, env: Env = process.env): string =>
  runtimeOf(env) === "npm" ? `rmk-server ${name}` : `pnpm run ${name}`;

/**
 * A script's command as typed in a terminal on the machine that runs this instance, from outside a
 * container (#147): `rmk-server <name>` for the npm package, `docker compose exec web pnpm run
 * <name>` for Docker, `pnpm run <name>` in a clone.
 */
export const hostCommand = (name: string, env: Env = process.env): string => {
  const runtime = runtimeOf(env);
  if (runtime === "docker") return `docker compose exec web pnpm run ${name}`;
  if (runtime === "npm") return `rmk-server ${name}`;
  return `pnpm run ${name}`;
};

/**
 * How to restart this instance so it reads its settings again (098's rotate-secret): the container,
 * the service (RONNE_SERVICE, set when rmk-server runs a script for an installed service), or the
 * process someone started.
 */
export const restartHint = (env: Env = process.env): string => {
  const runtime = runtimeOf(env);
  if (runtime === "docker") return "docker compose restart web";
  if (runtime === "npm" && env.RONNE_SERVICE === "1") return "sudo rmk-server service restart";
  if (runtime === "npm") return "stop rmk-server and start it again";
  return "stop the server (pnpm dev or pnpm start) and start it again";
};

/** The terminal command for the setup, as this runtime runs it, from outside a container. */
export const setupCommand = (env: Env = process.env): string => hostCommand("setup", env);

/** One way of updating, for Settings › Updates (140). */
export type UpdatePlan = {
  /** Which words the tab shows: a container, the npm package, an installed service, the packages, or a clone. */
  kind: "docker" | "npm" | "service" | "package" | "clone";
  /** The backup to take first, as typed on the machine that runs this instance. */
  backup: string;
  /** What to run, in order. */
  commands: string[];
  /** The way this instance runs now, by RONNE_RUNTIME and RONNE_SERVICE. */
  current: boolean;
};

const NPM_INSTALL = "npm install --global @ronneai/marketplace@latest";

/**
 * Every way to update (140), the one this instance runs by first: people install Ronne in several
 * ways and the detection can be wrong (the `.deb` and `.rpm` run as the npm service), so the tab
 * lists them all. Docker pulls the image, the npm package installs the new version and restarts, the
 * packages are installed again the same way, a clone pulls and rebuilds. Always preceded by a backup.
 * Never run by the app itself. Homebrew is not listed: the tap is on hold.
 */
export const updatePlans = (env: Env = process.env): UpdatePlan[] => {
  const runtime = runtimeOf(env);
  const service = runtime === "npm" && env.RONNE_SERVICE === "1";
  const now: UpdatePlan["kind"] =
    runtime === "docker" ? "docker" : service ? "service" : runtime === "npm" ? "npm" : "clone";
  const plans: Omit<UpdatePlan, "current">[] = [
    {
      kind: "docker",
      backup: hostCommand("backup", { RONNE_RUNTIME: "docker" }),
      commands: ["docker compose pull", "docker compose up -d"],
    },
    {
      kind: "npm",
      backup: hostCommand("backup", { RONNE_RUNTIME: "npm" }),
      commands: [NPM_INSTALL],
    },
    {
      kind: "service",
      backup: `sudo ${hostCommand("backup", { RONNE_RUNTIME: "npm" })}`,
      commands: [NPM_INSTALL, "sudo rmk-server service restart"],
    },
    {
      kind: "package",
      backup: `sudo ${hostCommand("backup", { RONNE_RUNTIME: "npm" })}`,
      commands: ["sudo apt install ./rmk-server_*.deb", "sudo dnf install ./rmk-server-*.rpm"],
    },
    {
      kind: "clone",
      backup: hostCommand("backup", {}),
      commands: ["git pull", "pnpm install", "pnpm build"],
    },
  ];
  const marked = plans.map((plan) => ({ ...plan, current: plan.kind === now }));
  return [...marked.filter((plan) => plan.current), ...marked.filter((plan) => !plan.current)];
};
