import { defineConfig } from 'vite'

export default defineConfig({
  base: '/pea-etf-live-app/',
  server: {
    proxy: {
      '/api/bourso': {
        target: 'https://www.boursorama.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bourso/, '')
      }
    }
  }
})
