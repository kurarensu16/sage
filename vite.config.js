import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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

