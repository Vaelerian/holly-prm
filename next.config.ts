import withPWAInit from "@ducanh2912/next-pwa"

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  workboxOptions: { skipWaiting: true },
  customWorkerSrc: "worker",
})

export default withPWA({
  output: "standalone",
  async headers() {
    // Auth flow pages must not be cached by browsers, proxies, or CDNs.
    // A stale cache (e.g. a previous redirect response) was being served for
    // /register, which caused new users to land on /login instead of the
    // registration form.
    return [
      {
        source: "/:path(register|login|forgot-password|reset-password)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
          { key: "CDN-Cache-Control", value: "no-store" },
          { key: "Cloudflare-CDN-Cache-Control", value: "no-store" },
        ],
      },
    ]
  },
})
