import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The same code is built for DEV, TEST and PROD; only these build settings differ:
//   VITE_API_URL  — the API this portal talks to
//   VITE_APP_ENV  — dev | test | prod (shows a coloured strip outside prod)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { sourcemap: false, target: 'es2020' },
});
