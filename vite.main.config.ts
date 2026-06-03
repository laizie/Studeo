import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // These modules are provided by Electron at runtime — Vite must not
      // try to bundle them. 'electron' is the Electron API; 'node:*' are
      // Node built-ins (including node:sqlite which is compiled into Node).
      external: ['electron', /^node:/],
    },
  },
});
