import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // These modules are provided by Electron at runtime — Vite must not
      // try to bundle them. 'electron' is the Electron API; 'node:*' are
      // Node built-ins (including node:sqlite which is compiled into Node).
      //
      // pdfjs-dist is kept external (loaded via dynamic import() at runtime from
      // node_modules) on purpose: bundling it breaks its sibling-relative worker
      // load (pdf.worker.mjs) and its optional native canvas polyfill. As a
      // production dependency it ships in the packaged app's node_modules. See
      // src/main/pdf/extractPdfText.ts.
      external: ['electron', /^node:/, /^pdfjs-dist/],
    },
  },
});
