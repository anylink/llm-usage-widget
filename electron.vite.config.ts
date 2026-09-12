import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const sharedAlias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } }
    }
  },
  preload: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve('src/preload/index.ts') } }
    }
  },
  renderer: {
    resolve: {
      alias: { ...sharedAlias, '@': resolve('src/renderer') }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          widget: resolve('src/renderer/widget/index.html'),
          settings: resolve('src/renderer/settings/index.html')
        }
      }
    }
  }
})
