import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "../auth/scope.js": "../../src/auth/scope.ts",
      "../schemas.js": "../../src/schemas.ts"
    }
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"]
    };
    return config;
  }
};

export default nextConfig;
