import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import mkcert from 'vite-plugin-mkcert'

// https://vite.dev/config/
export default defineConfig({
  server: {
    https: true,
    host: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/events': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000'
    }
  },
  plugins: [
    react(),
    mkcert(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.png', 'icon.ico', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'ChamaAí - Operador',
        short_name: 'ChamaAí',
        description: 'Sistema de Gestão de Filas - Painel do Operador',
        theme_color: '#2563eb',
        background_color: '#020617',
        display: 'standalone',
        start_url: '/#/bridge',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  base: './',
})
