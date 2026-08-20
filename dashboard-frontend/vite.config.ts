import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      /**
       * The frontend calls `/api/...` so that a production deploy can put the
       * API behind the same origin without CORS. The NestJS app itself does
       * NOT mount a global `/api` prefix (its routes are `/auth/login`,
       * `/health`, ...), so the prefix must be stripped here — without this
       * rewrite every dashboard request 404s.
       */
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
