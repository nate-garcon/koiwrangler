import { defineConfig } from 'vite'

// GitHub Pages serves a project site from /<repo>/, so assets need that base.
// Any other host (a custom domain, Fly, Cloudflare) serves from the root.
const base = process.env.DEPLOY_TARGET === 'gh-pages' ? '/koiwrangler/' : '/'

export default defineConfig({
  base,
  // Local-only dev server: bound to loopback so the site is reachable from
  // THIS device and nothing else (no LAN, no Tailscale, no port forwarding).
  server: { host: '127.0.0.1', port: 5173, strictPort: true, open: false },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    // three.js is ~85% of the bundle and changes far less often than the site
    // does. Splitting it lets a returning visitor reuse it across deploys.
    rollupOptions: {
      // Two pages: the site, and the admin tool behind Google sign-in.
      input: { main: 'index.html', admin: 'admin.html' },
      output: {
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
    chunkSizeWarningLimit: 800,
  },
})
