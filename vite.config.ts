import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  const isDev = command === 'serve'
  const plugins: any[] = [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.png', 'icon.ico', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'ChamaAi - Operador',
        short_name: 'ChamaAi',
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
  ]

  if (isDev) {
    const mkcertPlugin = (await import('vite-plugin-mkcert')).default
    plugins.push(mkcertPlugin())
  }

  return {
    server: {
      https: isDev ? (true as any) : false,
      host: true,
      proxy: {
        '/api': 'http://localhost:3000',
        '/events': 'http://localhost:3000',
        '/uploads': 'http://localhost:3000'
      }
    },
    plugins,
    base: './',
  }
})

