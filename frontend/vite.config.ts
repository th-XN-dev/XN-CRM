import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [vue(), tailwindcss()],
    define: { __APP_VERSION__: JSON.stringify(version) },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      // Same-origin in development: the browser talks to Vite, Vite to the API.
      proxy: {
        '/api': { target: env.VITE_DEV_API_PROXY ?? 'http://localhost:3000', changeOrigin: true },
      },
    },
    build: {
      target: 'es2022',
      // Maps are produced for error monitoring but not linked from the bundle
      // (the source is not served to browsers).
      sourcemap: 'hidden',
    },
  };
});
