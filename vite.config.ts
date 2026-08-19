import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// base '/datacenters/' serves the app as a subsite at bitsbetrippin.io/datacenters
// (Cloudflare Pages + Worker route; see docs/INTEGRATION.md).
export default defineConfig({
  base: '/datacenters/',
  plugins: [react(), tailwindcss()],
})
