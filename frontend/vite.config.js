import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const analyticsPackage = fileURLToPath(new URL('./node_modules/@vercel/analytics', import.meta.url))
const speedInsightsPackage = fileURLToPath(new URL('./node_modules/@vercel/speed-insights', import.meta.url))
const vercelFallback = fileURLToPath(new URL('./src/lib/vercelNoop.jsx', import.meta.url))

const optionalVercelAliases = {
  ...(!existsSync(analyticsPackage) ? { '@vercel/analytics/react': vercelFallback } : {}),
  ...(!existsSync(speedInsightsPackage) ? { '@vercel/speed-insights/react': vercelFallback } : {}),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: optionalVercelAliases,
  },
})
