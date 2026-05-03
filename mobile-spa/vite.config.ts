import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/mobile/',
  server: {
    port: 5174,
  },
  build: {
    outDir: '../src-tauri/resources/mobile-spa',
    emptyOutDir: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
