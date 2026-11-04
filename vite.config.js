import { defineConfig } from 'vite';

// Static build for Netlify: `npm run build` -> dist/
export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
});
