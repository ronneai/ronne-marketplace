// The one Caddyfile (features 080 and 083). compose.yaml's proxy config is this template filled with
// Compose's ${…} settings (a test keeps them equal); the native proxy fills it with real values, so
// Docker and `rmk-server service install --domain` can't drift apart.
import type { TlsMode } from "./model.js";

type Slots = {
  /** The global `admin` line (empty: Caddy's default, localhost:2019). */
  admin: string;
  /** The global `email` line (empty: none). */
  email: string;
  /** The global `trusted_proxies` line (empty: none). */
  trustedProxies: string;
  /** The site address: the domain, or :80 for plain HTTP. */
  site: string;
  /** The TLS snippet to import: tls (none), tls-auto, tls-files or tls-internal. */
  tls: string;
  /** Where cert.pem and key.pem are read from with tls files. */
  certsDir: string;
  /** The app's address. */
  upstream: string;
};

const TEMPLATE = `{
  {{admin}}
  {{email}}
  servers {
    # Only with RONNE_TRUSTED_PROXIES (case 4). Not trusted by default: Docker may hand
    # connections over from its gateway, a private address, which would let anyone set
    # X-Forwarded-For. Strict: the rightmost untrusted entry, never one the client wrote.
    {{trustedProxies}}
    trusted_proxies_strict
    # HTTP/1.1 only, until Caddy is built with Go 1.26.9 and golang.org/x/net 0.60.0:
    # CVE-2026-78669 is a denial of service through HTTP/2 (exception E-7 in
    # docs/policies/dependencies.md). Turn h2 and h3 back on then.
    protocols h1
  }
}

(tls) {
}
(tls-auto) {
}
(tls-files) {
  tls {{certsDir}}/cert.pem {{certsDir}}/key.pem
}
(tls-internal) {
  tls internal
}

{{site}} {
  import {{tls}}
  # The app's limit for a draft upload, 28 MiB (Caddy's "MB" would be 1000 × 1000 bytes).
  request_body {
    max_size 28MiB
  }
  reverse_proxy {{upstream}} {
    # One address, the client's, which Ronne reads as the rightmost entry.
    header_up X-Forwarded-For {client_ip}
  }
}
`;

/** Fills the template. A line whose only content was an empty slot is left out. */
const render = (slots: Slots): string =>
  TEMPLATE.split("\n")
    .flatMap((line) => {
      const filled = line.replace(/\{\{(\w+)\}\}/g, (_, key: keyof Slots) => slots[key]);
      return filled !== line && filled.trim() === "" ? [] : [filled];
    })
    .join("\n");

/** compose.yaml's `configs.caddyfile.content`: Compose fills in the settings when it starts. */
export const composeCaddyfile = (): string =>
  render({
    admin: "",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Compose's syntax, written as text
    email: "${RONNE_ACME_EMAIL:+email ${RONNE_ACME_EMAIL}}",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: see above.
    trustedProxies: "${RONNE_TRUSTED_PROXIES:+trusted_proxies static ${RONNE_TRUSTED_PROXIES}}",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: see above.
    site: "${RONNE_DOMAIN:-:80}",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: see above.
    tls: "tls${RONNE_DOMAIN:+-${RONNE_TLS:-auto}}",
    certsDir: "/certs",
    upstream: "web:3000",
  });

/** The native proxy's Caddyfile (083): always a domain, so always HTTPS. */
export const nativeCaddyfile = (options: {
  domain: string;
  tls: TlsMode;
  email?: string;
  certsDir: string;
  upstream: string;
}): string =>
  render({
    // A system Caddy uses localhost:2019 too. A second Caddy binds it as well and answers some of
    // its requests, so the system Caddy's `caddy reload` could replace this one's config. The
    // service restarts instead of reloading.
    admin: "admin off",
    email: options.email ? `email ${options.email}` : "",
    trustedProxies: "",
    site: options.domain,
    tls: `tls-${options.tls}`,
    certsDir: options.certsDir,
    upstream: options.upstream,
  });
