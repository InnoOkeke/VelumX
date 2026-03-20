import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@stacks/connect', '@stacks/transactions', '@stacks/network', '@stacks/common', '@stacks/wallet-sdk', 'bip39'],
};

export default nextConfig;
