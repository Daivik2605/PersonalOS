/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Port 5170 is fixed in the PersonalOS registry: if it is taken we refuse to start rather than move.
  server: { port: 5170, strictPort: true },
  preview: { port: 5170, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    // Launcher tests are plain Node (real sockets and processes), so they opt out of jsdom with a docblock.
    include: ['src/**/*.test.{ts,tsx}', 'launcher/**/*.test.mjs'],
    testTimeout: 20000,
  },
})
