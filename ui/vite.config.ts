import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'import.meta.env.VITE_ASTRAEA_EDITION': JSON.stringify('open-core'),
  },
  plugins: [react()],
  server: { port: 3000, open: false },
  build: { outDir: 'dist/open-core', emptyOutDir: true },
});
