import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Gives `next dev` access to Cloudflare bindings (D1) via miniflare.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // Cloudflare Workers has no built-in Next image optimizer.
  // Swap to a Cloudflare Images loader if optimization is needed later.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
