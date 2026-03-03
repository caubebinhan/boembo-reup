import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedAlias = {
  '@main':   resolve('src/main'),
  '@core':   resolve('src/core'),
  '@nodes':  resolve('src/nodes'),
  '@shared': resolve('src/shared'),
}

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer':  resolve('src/renderer'),
        '@workflows': resolve('src/workflows'),
      },
      conditions: ['browser', 'import', 'module', 'default'],
    },
    optimizeDeps: {
      include: ['pixi.js/unsafe-eval'],
      exclude: [],
    },
    plugins: [react()]
  }
})

