import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output needed for CLI (bin/cli.js uses server.js directly).
  // Electron uses next start which shows a warning but works correctly.
  output: "standalone",
};

export default nextConfig;
