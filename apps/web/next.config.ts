import type { NextConfig } from "next";
import { DOCS_URL } from "./src/components/help/topics";

const nextConfig: NextConfig = {
  // The Docker image runs Next.js's standalone server (feature 005). Local `pnpm start` keeps the
  // normal output, because `next start` doesn't support standalone.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Don't advertise the framework in response headers.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // The draft editor saves every changed file at once, and imports .zip files (feature 012):
      // up to 20 MB of files, which is about 27 MB as base64. src/proxy.ts keeps every other
      // request at 1 MB (route-guard.ts, bodyTooLarge).
      bodySizeLimit: "28mb",
    },
  },
  images: {
    // sharp isn't installed (dependency policy exception E-1), so Next.js serves images as they are.
    unoptimized: true,
  },
  // The Documentation moved to the website (088): its old addresses land there, signed in or not
  // (Next checks these before src/proxy.ts). Temporary, so they can change without stale caches.
  // The website's overview is the Documentation itself, as /docs was.
  redirects: async () => [
    { source: "/docs", destination: DOCS_URL, permanent: false },
    { source: "/docs/overview", destination: DOCS_URL, permanent: false },
    { source: "/docs/:topic", destination: `${DOCS_URL}/:topic`, permanent: false },
  ],
};

export default nextConfig;
