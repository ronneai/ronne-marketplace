import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise the framework in response headers.
  poweredByHeader: false,
  images: {
    // sharp isn't installed (dependency policy exception E-1), so Next.js serves images as they are.
    unoptimized: true,
  },
};

export default nextConfig;
