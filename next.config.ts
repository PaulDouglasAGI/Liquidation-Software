import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // In Codespaces / VS Code tunnels the browser reaches the dev server through a
  // forwarded HTTPS hostname, not localhost. Without this, the dev server treats
  // its own HMR and asset requests as cross-origin and the page never settles.
  allowedDevOrigins: [
    "*.app.github.dev", // GitHub Codespaces
    "*.github.dev",
    "*.devtunnels.ms", // VS Code dev tunnels
  ],
};

export default nextConfig;
