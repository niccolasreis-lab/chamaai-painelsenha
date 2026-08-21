import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { installFetchInterceptor } from './shared/fetchInterceptor'
import { Capacitor } from '@capacitor/core'

// Install global fetch interceptor for remote master token injection
installFetchInterceptor()

// Register PWA Service Worker
if (!Capacitor.isNativePlatform()) {
  const updateSW = registerSW({
    onNeedRefresh() {
      if (confirm('Nova versão disponível. Recarregar?')) {
        updateSW(true)
      }
    },
    onOfflineReady() {
      console.log('App pronto para funcionar offline')
    },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
