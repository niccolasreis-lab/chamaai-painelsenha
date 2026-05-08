import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
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
