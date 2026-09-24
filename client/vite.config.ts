import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'pglite-tar-gz',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.includes('.tar.gz')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            const origSetHeader = res.setHeader.bind(res);
            res.setHeader = function (name: string, val: any) {
              if (name.toLowerCase() === 'content-encoding') {
                return res;
              }
              return origSetHeader(name, val);
            };
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@electric-sql/pglite', '@electric-sql/pglite-pgvector'],
  },
  server: {
    port: 5173,
    host: true,
  },
});

