import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image runs Next.js's standalone server (feature 005). Local `pnpm start` keeps the
  // normal output, because `next start` doesn't support standalone.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Don't advertise the framework in response headers.
  poweredByHeader: false,
  images: {
    // sharp isn't installed (dependency policy exception E-1), so Next.js serves images as they are.
    unoptimized: true,
  },
};

export default nextConfig;
