import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone build for Electron packaging
  output: "standalone",
  // Exclude large directories from standalone file tracing
  // Without this, the entire dist-electron/ and .next/ get copied recursively
  outputFileTracingExcludes: {
    '*': [
      './dist-electron/**',
      './node_modules/electron/**',
      './node_modules/electron-builder/**',
      './node_modules/@electron/**',
      './.git/**',
      './docs/**',
    ],
  },
};

export default nextConfig;
