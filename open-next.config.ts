import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// All post pages are SSG (`dynamic = "error"`), so the read-only
// static-assets incremental cache is enough — no R2/KV needed. Revisit if
// ISR/revalidation is ever introduced.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
