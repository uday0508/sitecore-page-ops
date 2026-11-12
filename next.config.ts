import type { NextConfig } from "next";

// Marketplace apps run inside an iframe on the Sitecore Cloud Portal / SitecoreAI.
// Only allow those hosts (and localhost for development) to embed the app.
const frameAncestors = [
  "'self'",
  "https://*.sitecorecloud.io",
  "https://*.sitecorecloud.app",
  "http://localhost:*",
].join(" ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors};` },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
