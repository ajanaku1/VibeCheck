import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/dashboard',
  publicDir: '../../video/out',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    open: true,
    proxy: {
      '/api/': 'http://127.0.0.1:3000',
    },
  },
})
