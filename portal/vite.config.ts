import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// The same code is built for DEV, TEST and PROD; only these build settings differ:
//   VITE_API_URL  — the API this portal talks to
//   VITE_APP_ENV  — dev | test | prod (shows a coloured strip outside prod)

/** Writes version.json next to the built site: which commit this build is. The QA run waits for it before testing. */
function buildStamp(): Plugin {
  return {
    name: 'build-stamp',
    generateBundle() {
      const commit = (process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || '').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ commit, env: process.env.VITE_APP_ENV || 'prod' }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), buildStamp()],
  base: './',
  build: { sourcemap: false, target: 'es2020' },
});
