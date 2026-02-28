import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true
  },
  transpilePackages: [
    "@stacks/common",
    "@stacks/connect-react",
    "@stacks/network",
    "framer-motion"
  ]
};

export default nextConfig;
