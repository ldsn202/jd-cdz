import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITE_DEV_API_TARGET ?? 'http://localhost:8788',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            const hasSession = /(?:^|;\s*)jd-charging-account=/.test(req.headers.cookie ?? '');
            if (!req.headers.authorization && !hasSession) {
              proxyReq.setHeader('authorization', `Bearer ${(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITE_DEV_IDENTITY_TOKEN ?? 'dev-token-jd-review'}`);
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
