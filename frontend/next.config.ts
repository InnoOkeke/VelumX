import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@stacks/connect', '@stacks/transactions', '@stacks/network', '@stacks/common'],
  // Empty turbopack config to silence the warning
  turbopack: {},
};

export default nextConfig;
