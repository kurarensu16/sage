import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// A fresh identifier per build. Two things depend on it:
//   1. the service worker's cache name, so a deploy no longer serves the previous build
//   2. the sessionStorage cache prefix, so cached objects never outlive their shape
const buildId = Date.now().toString(36)

// public/sw.js ships with a __BUILD_ID__ placeholder because files in public/ are copied
// verbatim and never processed. Stamping it here is what makes the worker's bytes differ
// between deploys — without that the browser considers it unchanged and never installs
// the new one, which is why old versions used to persist until a manual cache clear.
function stampServiceWorkerBuildId() {
  return {
    name: 'aspire-service-worker-build-id',
    apply: 'build',
    closeBundle() {
      const serviceWorkerPath = path.resolve(__dirname, 'dist/sw.js')
      if (!fs.existsSync(serviceWorkerPath)) return
      const source = fs.readFileSync(serviceWorkerPath, 'utf8')
      fs.writeFileSync(serviceWorkerPath, source.replaceAll('__BUILD_ID__', buildId))
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), stampServiceWorkerBuildId()],
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId)
  },
  resolve: {
    alias: {
      stream: path.resolve(__dirname, 'src/lib/empty.js')
    }
  },
  optimizeDeps: {
    include: ['html2pdf.js', 'xlsx-js-style']
  },
  server: {
    port: 5175,
    strictPort: true,
    allowedHosts: true,
  }
})

