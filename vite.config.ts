import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 部署到 GitHub Pages 时，如仓库名为 <repo>，需将 base 改为 '/<repo>/'
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    watch: {
      ignored: ['**/.playwright.config*.tmpdir/**'],
    },
  },
})
