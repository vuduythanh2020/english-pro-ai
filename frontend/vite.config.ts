import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  // SPA fallback: Vite dev server mặc định đã bật appType: 'spa',
  // tự động trả index.html cho mọi route không match static file.
  // Khi deploy production (nginx, Vercel, etc.), cần cấu hình server
  // redirect mọi route về index.html.
  build: {
    rollupOptions: {
      input: './index.html',
    },
  },
})
