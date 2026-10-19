import type { NextConfig } from "next";
import { releverVersionCompilation } from "./src/lib/version-compilation";

const nextConfig: NextConfig = {
  /* Relevé Git figé au moment de la compilation (src/lib/version-compilation.ts). */
  env: { TM_VERSION_COMPILATION: JSON.stringify(releverVersionCompilation()) },
  turbopack: {},
  allowedDevOrigins: ["192.168.1.119", "192.168.31.145"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
