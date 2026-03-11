import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true
  },
  transpilePackages: [
    "@stacks/auth",
    "@stacks/common",
    "@stacks/connect",
    "@stacks/network",
    "@stacks/storage",
    "@stacks/transactions"
  ]
};

export default nextConfig;


