import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2017',
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
  server: {
    port: 5174,
    open: false,
  },
});
