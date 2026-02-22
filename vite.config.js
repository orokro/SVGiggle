import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/SVGiggle.js'),
      name: 'SVGiggle',
      fileName: 'svgiggle',
      formats: ['es', 'umd', 'iife']
    },
    rollupOptions: {
      external: ['node:fs'], // Externalize node:fs
      output: {
        globals: {
          'node:fs': 'fs' // This effectively makes it undefined or 'fs' global in browser, which is fine as we guard it
        }
      }
    }
  }
});
