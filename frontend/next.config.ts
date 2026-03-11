import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@stacks/connect', '@stacks/transactions', '@stacks/network', '@stacks/common'],
};

export default nextConfig;
