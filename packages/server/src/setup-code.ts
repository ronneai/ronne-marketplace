// The web setup's code (feature 161), as rmk-server shows it on a terminal: the server makes it in
// the data folder at its first start (the web app's server/setup/setup-code.ts), and the web setup
// asks for it. This package only reads it, to print it and to open the page with it filled in.
import { join } from "node:path";

/** Crockford base32, 26 characters (128 bits), as the web app writes the file. */
const CODE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** The code in a data folder's `setup-code` file, in groups of five, or null when there's none. */
export const setupCodeIn = (
  dataDir: string,
  read: (path: string) => string | undefined,
): string | null => {
  const raw = read(join(dataDir, "setup-code"))?.trim().toUpperCase();
  if (!raw || !CODE.test(raw)) return null;
  return raw.match(/.{1,5}/g)?.join("-") ?? null;
};

/** Where to enter it, for a terminal. */
export const setupCodeLines = (address: string, code: string): string =>
  `Setup code: ${code}\nOpen ${address.replace(/\/+$/, "")}/setup and enter it. Only you have it: it's in the server's log too, and rmk-server setup-code prints it again.\n`;

/** The setup page with the code in its fragment, which the browser never sends anywhere. */
export const setupLink = (address: string, code: string): string =>
  `${address.replace(/\/+$/, "")}/setup#code=${code}`;

/**
 * What `rmk-server start` does on a terminal once its first start answers: prints the code the
 * server made, and, unless --no-open, opens the setup page with it filled in; without a code (set
 * up already), opens the address.
 */
export const announceSetup = (
  options: { url: string; dataDir: string; open: boolean },
  effects: {
    read: (path: string) => string | undefined;
    write: (text: string) => void;
    openBrowser: (url: string) => void;
  },
): void => {
  const code = setupCodeIn(options.dataDir, effects.read);
  if (code) effects.write(`\n${setupCodeLines(options.url, code)}\n`);
  if (options.open) effects.openBrowser(code ? setupLink(options.url, code) : options.url);
};
