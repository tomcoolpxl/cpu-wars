import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Relative paths for GitHub Pages deployment
  build: {
    outDir: 'dist',
  }
});
