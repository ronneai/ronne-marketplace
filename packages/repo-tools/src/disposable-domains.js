#!/usr/bin/env node
// Usage: node packages/repo-tools/src/disposable-domains.js [--check]
// The throwaway email domains Ronne bundles (feature 190): the community disposable-email-domains
// list (CC0-1.0), copied from its repository at one commit into
// apps/web/src/server/domains/identity/lists/disposable-domains.ts, one domain a line in a string
// (a module, so the server's bundles carry it), with its source and licence in
// disposable-domains.source.json. A release refreshes it (docs/runbooks/release.md); --check only
// validates the copy in the repository.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPOSITORY = "disposable-email-domains/disposable-email-domains";
const FILE = "disposable_email_blocklist.conf";
const DATA = new URL("../../../apps/web/src/server/domains/identity/lists/", import.meta.url);

/** One domain a line: lower-case letters, digits, dots and hyphens, with a dot, no blanks. */
const DOMAIN =
  /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Mail providers that must never be on it: a list that blocks one of these is a broken list. */
export const NEVER_THROWAWAY = [
  ...["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com"],
  ...["yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com"],
  ...["protonmail.ch", "pm.me", "aol.com", "gmx.com", "gmx.net", "mail.com", "fastmail.com"],
  ...["zoho.com", "tutanota.com", "hey.com", "yandex.ru", "mail.ru", "qq.com", "163.com"],
  ...["naver.com", "web.de", "t-online.de", "orange.fr", "free.fr", "sfr.fr", "laposte.net"],
  ...["wanadoo.fr", "uol.com.br", "bol.com.br", "terra.com.br", "ig.com.br", "globo.com"],
  ...["videotron.ca", "sympatico.ca", "bell.net", "rogers.com", "shaw.ca", "telus.net"],
  ...["rediffmail.com", "att.net", "comcast.net", "verizon.net", "sbcglobal.net"],
  // The big providers' country domains: yahoo.ca, hotmail.com.br, outlook.fr…
  ...["yahoo", "hotmail", "outlook", "live", "gmx", "msn"].flatMap((brand) =>
    ["ca", "fr", "br", "pt", "de", "at", "es", "it", "co.uk", "com.br", "com.ar", "com.mx"].map(
      (tld) => `${brand}.${tld}`,
    ),
  ),
];

/**
 * Suffixes under which unrelated people hold their own domains. A line equal to one would, with
 * Ronne matching the domains under a listed one, block every address under it (all of `co.uk`):
 * countries' second-level suffixes, and shared hosting.
 */
export const SHARED_SUFFIXES = [
  ...["co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "com.br", "net.br", "org.br", "com.au"],
  ...["net.au", "org.au", "co.nz", "co.za", "co.jp", "ne.jp", "or.jp", "co.kr", "co.in", "com.mx"],
  ...["com.ar", "com.cn", "com.tw", "com.hk", "com.sg", "com.my", "com.ph", "com.tr", "co.il"],
  ...["co.id", "com.pl", "edu.pl", "com.pt", "com.es", "co.at", "or.at", "com.ua", "com.ru"],
  ...["github.io", "gitlab.io", "herokuapp.com", "netlify.app", "vercel.app", "pages.dev"],
  ...["workers.dev", "web.app", "firebaseapp.com", "appspot.com", "blogspot.com"],
  ...["azurewebsites.net", "cloudfront.net", "amazonaws.com", "duckdns.org", "ngrok.io"],
  ...["s3.amazonaws.com", "onrender.com", "fly.dev", "github.dev", "eu.org", "glitch.me"],
];

/**
 * A two-label line that reads like a country's second-level suffix (`gouv.fr`, `qc.ca`,
 * `com.br`): a generic or regional first label under a two-letter country. Real suffixes are
 * many more than `SHARED_SUFFIXES` lists, so this catches the shape; `KNOWN_LISTED` names the
 * ones the upstream list carries on purpose (free-subdomain services used for throwaway mail).
 */
const SECOND_LEVEL = new Set([
  ...["co", "com", "net", "org", "gov", "gouv", "edu", "ac", "gob", "ne", "or", "go", "mil"],
  ...["nom", "ltd", "plc", "sch", "int", "info", "biz", "web", "res", "asso", "nic", "ed"],
  // Canada's provinces, the same shape.
  ...["qc", "on", "bc", "ab", "mb", "sk", "ns", "nb", "nl", "pe", "nt", "nu", "yk", "gc"],
]);
// Each is a free-subdomain host upstream blocks whole; a new one stops the refresh for a person.
export const KNOWN_LISTED = ["biz.st", "co.cc", "gob.re", "pe.hu", "qc.to"];
export const looksLikeSuffix = (line) => {
  const labels = line.split(".");
  return labels.length === 2 && labels[1].length === 2 && SECOND_LEVEL.has(labels[0]);
};

/**
 * The domains in a downloaded list, sorted and unique, or an error naming what's wrong: a line
 * that isn't a domain, a real provider on it, or too few domains to be the real list.
 */
export const validateDomains = (text) => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const bad = lines.filter((line) => !DOMAIN.test(line));
  if (bad.length > 0) throw new Error(`Not a domain: ${bad.slice(0, 5).join(", ")}`);
  const listed = new Set(lines);
  const provider = NEVER_THROWAWAY.filter((domain) => listed.has(domain));
  if (provider.length > 0)
    throw new Error(`A mail provider is on the list: ${provider.join(", ")}`);
  const shared = [
    ...new Set([
      ...SHARED_SUFFIXES.filter((suffix) => listed.has(suffix)),
      ...[...listed].filter((line) => looksLikeSuffix(line) && !KNOWN_LISTED.includes(line)),
    ]),
  ];
  if (shared.length > 0) throw new Error(`A shared suffix is on the list: ${shared.join(", ")}`);
  if (listed.size < 1000) throw new Error(`Only ${listed.size} domains: not the real list`);
  return [...listed].sort();
};

const HEAD = `// The throwaway email domains (190), generated by \`pnpm data:disposable-domains\`: don't edit by
// hand. The community disposable-email-domains list, CC0-1.0; its commit is in
// disposable-domains.source.json.
export const DISPOSABLE_DOMAINS = \``;

/** The module's text for a validated list. */
export const domainsModule = (domains) => `${HEAD}\n${domains.join("\n")}\n\`;\n`;

/** The domains a module holds, read back from its text. */
export const domainsFromModule = (text) => {
  const start = text.indexOf("= `");
  const end = text.lastIndexOf("`;");
  if (start < 0 || end < start) throw new Error("Not the domains module");
  return text.slice(start + 3, end);
};

const main = async () => {
  if (process.argv.includes("--check")) {
    const text = readFileSync(new URL("disposable-domains.ts", DATA), "utf8");
    const domains = validateDomains(domainsFromModule(text));
    if (text !== domainsModule(domains))
      throw new Error("disposable-domains.ts isn't as generated");
    console.log(`disposable-domains.ts: ${domains.length} domains, valid`);
    return;
  }
  const api = (path) =>
    fetch(`https://api.github.com/repos/${REPOSITORY}/${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "ronne-marketplace-repo-tools",
      },
    }).then((response) => {
      if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${path}`);
      return response.json();
    });
  const commit = await api("commits/main");
  const license = await api("contents/LICENSE.txt");
  const licenseText = Buffer.from(license.content, "base64").toString("utf8");
  if (!licenseText.startsWith("CC0 1.0 Universal"))
    throw new Error("The list's licence is no longer CC0 1.0: stop, and ask the owner (190)");
  const raw = await fetch(
    `https://raw.githubusercontent.com/${REPOSITORY}/${commit.sha}/${FILE}`,
  ).then((response) => {
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for the list`);
    return response.text();
  });
  const domains = validateDomains(raw);
  // Every line added and removed, for the refresh's pull request: the last check is a person's.
  const before = new Set(
    domainsFromModule(readFileSync(new URL("disposable-domains.ts", DATA), "utf8")).split("\n"),
  );
  const after = new Set(domains);
  for (const line of domains) if (!before.has(line)) console.log(`+ ${line}`);
  for (const line of before) if (line && !after.has(line)) console.log(`- ${line}`);
  writeFileSync(new URL("disposable-domains.ts", DATA), domainsModule(domains));
  const source = {
    name: "disposable-email-domains",
    repository: `https://github.com/${REPOSITORY}`,
    file: FILE,
    commit: commit.sha,
    committedAt: commit.commit.committer.date,
    license: "CC0-1.0",
    domains: domains.length,
  };
  writeFileSync(
    new URL("disposable-domains.source.json", DATA),
    `${JSON.stringify(source, null, 2)}\n`,
  );
  console.log(`disposable-domains.ts: ${domains.length} domains, from ${commit.sha}`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main().catch((error) => {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  });
