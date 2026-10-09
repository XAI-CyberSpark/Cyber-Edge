import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { developerDocsPlugin } from './scripts/developer-docs-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), developerDocsPlugin()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
      allow: [path.resolve(__dirname)],
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.demo-runtime/**'],
    },
    proxy: {
      '/v1/orchestration/generate-stream': {
        timeout: 810_000,
        proxyTimeout: 810_000,
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
        // SSE 流式传输必须关闭代理缓冲
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['x-accel-buffering'] = 'no';
          });
        },
      },
      '/v1': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/telemetry': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
