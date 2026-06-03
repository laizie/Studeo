import type { WindowApi } from './shared/types';

// Tell TypeScript that window.api exists and is typed.
// Without this, `window.api.courses.list()` would be a type error in the renderer.
declare global {
  interface Window {
    api: WindowApi;
  }
}

// Teach TypeScript about CSS side-effect imports (import './index.css').
declare module '*.css' {
  const content: string;
  export default content;
}

export {};
