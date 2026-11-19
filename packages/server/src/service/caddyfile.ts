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
  /** The scanner's internal ports (156), ending in a blank line. Empty without the scanner. */
  scanner: string;
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

{{scanner}}{{site}} {
  import {{tls}}
  # The app's limit for a draft upload, 28 MiB (29360128 bytes), without request_body: its
  # MaxBytesReader can crash Go's HTTP/1 server (CVE-2026-97054, exception E-15). A body must
  # declare its length, and Go never lets one send more than it declared.
  @nolength {
    method POST PUT PATCH
    expression \`{http.request.header.Content-Length} == ""\`
  }
  respond @nolength "A request body needs a Content-Length." 411
  @toolarge expression \`{http.request.header.Content-Length}.matches("^[0-9]+$") && int({http.request.header.Content-Length}) > 29360128\`
  respond @toolarge "The request body is over 28 MiB." 413
  reverse_proxy {{upstream}} {
    # One address, the client's, which Ronne reads as the rightmost entry.
    header_up X-Forwarded-For {client_ip}
  }
}
`;

// Only compose runs the scanner containers; a native install has none, so its Caddyfile has no ports for them.
const SCANNER = `# The scanner ports (156), never published. Only requests with the scan key get through, and the
# key goes no further. Fails closed: with no key (or one with a "*", which Caddy would read as
# a wildcard) every request is refused, so an install without the scanner is unaffected.
(scan-gate) {
  @unset expression \`{env.RONNE_SCAN_KEY} == "" || {env.RONNE_SCAN_KEY}.contains("*")\`
  header @unset Content-Type application/json
  respond @unset \`{"error": "not set up"}\` 403
  @wrongkey not header X-Ronne-Scan-Key {env.RONNE_SCAN_KEY}
  header @wrongkey Content-Type application/json
  respond @wrongkey \`{"error": "scan key"}\` 403
}
:8081 {
  import scan-gate
  reverse_proxy scanner:8080 {
    header_up -X-Ronne-Scan-Key
  }
}
:8082 {
  import scan-gate
  reverse_proxy scanner-semantic:8080 {
    header_up -X-Ronne-Scan-Key
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
    scanner: SCANNER,
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
    scanner: "",
  });
