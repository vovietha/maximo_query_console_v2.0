import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public',
  publicDir: false,
  resolve: { preserveSymlinks: true },
  server: { port: 1420, strictPort: true },
  build: { outDir: '../dist', emptyOutDir: true }
});
