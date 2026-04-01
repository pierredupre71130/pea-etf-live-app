import { defineConfig } from 'vite'

export default defineConfig({
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
