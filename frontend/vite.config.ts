// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Production (Vercel): /api/* is forwarded to the backend on Railway, so the browser only ever
// talks to this site and the sign-in cookie stays first-party. Set BACKEND_URL in Vercel.
const backend = process.env["BACKEND_URL"]?.replace(/\/$/, "");

export default defineConfig({
  // routeRules isn't in Lovable's type, but the nitro options are passed straight through to nitro.
  ...(backend ? { nitro: { routeRules: { "/api/**": { proxy: `${backend}/api/**` } } } as { preset?: string } } : {}),
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
