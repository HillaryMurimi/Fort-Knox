import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Browser fixtures must not share the developer's running .next/dev lock or output.
  distDir: process.env.NODE_ENV === 'development' && ['sales', 'platform'].includes(process.env.PCC_BROWSER_TEST_BUILD ?? '')
    ? `.next/browser-${process.env.PCC_BROWSER_TEST_BUILD}`
    : '.next',
  output: 'standalone',
  poweredByHeader: false,
  agentRules: false,
};
export default nextConfig;
