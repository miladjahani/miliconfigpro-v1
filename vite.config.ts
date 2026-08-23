import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE_PATH controls the <base href> / asset path prefix at build time:
//   - Cloudflare Workers (Static Assets) served at a root domain/subdomain
//     -> leave unset, defaults to "/"
//   - GitHub Pages served from a repo sub-path (https://user.github.io/repo/)
//     -> set VITE_BASE_PATH="/repo-name/" when building (the included
//        GitHub Actions workflow does this automatically)
const basePath = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  plugins: [react()],
  base: basePath,
  build: {
    outDir: 'dist',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  strictPort: true,
  allowedSchemes: ['data', 'webapp'],
  },
})
