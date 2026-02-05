import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/fliq': {
        target: 'https://auto-question.fliq.one',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fliq/, ''),
      },
      '/api/fliq-dss': {
        target: 'https://api-dss.fliq.one',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fliq-dss/, ''),
      },
      '/api/poly': {
        target: 'https://gamma-api.polymarket.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/poly/, ''),
      },
      '/api/poly-clob': {
        target: 'https://clob.polymarket.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/poly-clob/, ''),
      },
    },
  },
})
