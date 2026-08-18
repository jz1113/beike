import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  devIndicators: false
};

export default nextConfig;
