import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'esnext',
    // The Vosk WASM worker ships base64-embedded inside vosk-browser, so the
    // only thing that matters is that the CommonJS bundle gets pre-bundled
    // (Vite/esbuild does this automatically for bare imports).
    chunkSizeWarningLimit: 6000,
  },
});
