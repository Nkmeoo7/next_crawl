import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the shared package (TypeScript monorepo — no build step needed)
  transpilePackages: ["@nextcrawl/shared"],
};

export default nextConfig;
