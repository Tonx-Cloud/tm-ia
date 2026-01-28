import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// ============================================================================
// VITE CONFIGURATION
// ============================================================================
// IMPORTANT: Do NOT modify this file without understanding the implications!
// 
// This configuration handles:
// 1. HMR (Hot Module Replacement) WebSocket - connects to Vite dev server
// 2. API proxy - forwards /api requests to the backend server (port 3004)
//
// The HMR WebSocket MUST connect to the Vite server (port 5173), NOT the API.
// The API proxy handles REST requests only.
// ============================================================================

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // HMR configuration - ensures WebSocket connects correctly
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
      // clientPort is important when behind a proxy
      clientPort: 5173,
    },
    // API proxy configuration - forwards /api to backend
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:3004',
        changeOrigin: true,
        // Important: don't proxy WebSocket for API routes
        ws: false,
      },
    },
  },
})
