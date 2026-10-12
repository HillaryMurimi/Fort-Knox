import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep development tooling outside the customer surface during isolated browser checks.
  ...(process.env.PCC_BROWSER_TEST_BUILD
    ? { devIndicators: false as const }
    : {}),
  // Browser fixtures must not share the developer's running .next/dev lock or output.
  distDir:
    process.env.NODE_ENV === "development" &&
    ["sales", "platform", "self-service"].includes(
      process.env.PCC_BROWSER_TEST_BUILD ?? "",
    )
      ? `.next/browser-${process.env.PCC_BROWSER_TEST_BUILD}`
      : ".next",
  output: "standalone",
  poweredByHeader: false,
  agentRules: false,
};
export default nextConfig;
