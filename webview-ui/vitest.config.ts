import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    root: path.resolve(__dirname),
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/test/**/*.test.{ts,tsx}'],
    globals: true,
    css: false,
    pool: 'threads',
    testTimeout: 30000,
  },
})
