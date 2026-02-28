import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true
  },
  transpilePackages: [
    "@stacks/auth",
    "@stacks/common",
    "@stacks/connect",
    "@stacks/connect-react",
    "@stacks/network",
    "@stacks/storage",
    "@stacks/transactions"
  ]
};

export default nextConfig;
