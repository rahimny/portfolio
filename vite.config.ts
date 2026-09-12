import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import glsl from 'vite-plugin-glsl';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 6180,
  },
  plugins: [react(), tailwindcss(), glsl()],
  // Ignored inspiration projects also contain HTML and their own dependencies.
  // Only the application entry may seed the dependency optimiser.
  optimizeDeps: { entries: ['index.html'] },
  resolve: {
    dedupe: ['three'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
