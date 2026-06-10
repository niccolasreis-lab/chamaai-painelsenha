import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig(() => {
  const esToolkitShimPlugin = {
    name: 'es-toolkit-shim',
    enforce: 'pre' as const,
    resolveId(id: string) {
      if (id.includes('es-toolkit')) {
        console.log('[resolveId]', id);
      }
      if (id.includes('es-toolkit/compat/') || id.includes('es-toolkit\\compat\\')) {
        const match = id.match(/[\\/]es-toolkit[\\/]compat[\\/](.+)$/) || id.match(/^es-toolkit\/compat\/(.+)$/);
        if (match) {
          const funcName = match[1].replace(/\.[jt]sx?$/, '');
          const resolved = '\0es-toolkit/compat/' + funcName;
          console.log('[resolveId] resolved to virtual:', resolved);
          return resolved;
        }
      }
      if (id.includes('use-sync-external-store')) {
        if (id.includes('with-selector')) {
          console.log('[resolveId] resolved use-sync-external-store/with-selector:', id);
          return '\0use-sync-external-store/with-selector';
        } else {
          console.log('[resolveId] resolved use-sync-external-store:', id);
          return '\0use-sync-external-store';
        }
      }
      if (id.includes('decimal.js-light')) {
        console.log('[resolveId] decimal.js-light:', id);
      }
      if (id.includes('eventemitter3')) {
        console.log('[resolveId] eventemitter3:', id);
      }
      if (id.includes('react-is')) {
        console.log('[resolveId] react-is:', id);
      }
    },
    load(id: string) {
      if (id.includes('es-toolkit')) {
        console.log('[load]', id);
      }
      if (id.startsWith('\0es-toolkit/compat/')) {
        const funcName = id.replace('\0es-toolkit/compat/', '');
        const loaded = `
          import { ${funcName} } from 'es-toolkit/compat';
          export default ${funcName};
        `;
        console.log('[load] virtual content for:', funcName);
        return loaded;
      }
      if (id.includes('use-sync-external-store')) {
        if (id.includes('with-selector')) {
          console.log('[load] shimmed path for with-selector:', id);
          return `
            import { useSyncExternalStore, useRef, useEffect, useMemo, useDebugValue } from 'react';
            function is(x, y) {
              return (x === y && (0 !== x || 1 / x === 1 / y)) || (x !== x && y !== y);
            }
            const objectIs = typeof Object.is === 'function' ? Object.is : is;
            export function useSyncExternalStoreWithSelector(subscribe, getSnapshot, getServerSnapshot, selector, isEqual) {
              const instRef = useRef(null);
              let inst;
              if (instRef.current === null) {
                inst = { hasValue: false, value: null };
                instRef.current = inst;
              } else {
                inst = instRef.current;
              }
              const [getSelection, getServerSelection] = useMemo(() => {
                let hasMemo = false;
                let memoizedSnapshot;
                let memoizedSelection;
                const memoizedSelector = (nextSnapshot) => {
                  if (!hasMemo) {
                    hasMemo = true;
                    memoizedSnapshot = nextSnapshot;
                    const nextSelection = selector(nextSnapshot);
                    if (isEqual !== undefined && inst.hasValue) {
                      const currentSelection = inst.value;
                      if (isEqual(currentSelection, nextSelection)) {
                        return (memoizedSelection = currentSelection);
                      }
                    }
                    return (memoizedSelection = nextSelection);
                  }
                  const currentSelection = memoizedSelection;
                  if (objectIs(memoizedSnapshot, nextSnapshot)) {
                    return currentSelection;
                  }
                  const nextSelection = selector(nextSnapshot);
                  if (isEqual !== undefined && isEqual(currentSelection, nextSelection)) {
                    memoizedSnapshot = nextSnapshot;
                    return currentSelection;
                  }
                  memoizedSnapshot = nextSnapshot;
                  return (memoizedSelection = nextSelection);
                };
                const maybeGetServerSnapshot = getServerSnapshot === undefined ? null : getServerSnapshot;
                return [
                  () => memoizedSelector(getSnapshot()),
                  maybeGetServerSnapshot === null ? undefined : () => memoizedSelector(maybeGetServerSnapshot())
                ];
              }, [getSnapshot, getServerSnapshot, selector, isEqual]);
              const value = useSyncExternalStore(subscribe, getSelection, getServerSelection);
              useEffect(() => {
                inst.hasValue = true;
                inst.value = value;
              }, [value]);
              useDebugValue(value);
              return value;
            }
          `;
        } else {
          console.log('[load] shimmed path for use-sync-external-store:', id);
          return `
            import { useSyncExternalStore } from 'react';
            export { useSyncExternalStore };
            export default useSyncExternalStore;
          `;
        }
      }
      if (id.includes('decimal.js-light')) {
        console.log('[load] shimmed path for decimal.js-light:', id);
        const filepath = id.split('?')[0];
        let content = fs.readFileSync(filepath, 'utf8');
        content += '\nexport default globalThis.Decimal;\nexport const Decimal = globalThis.Decimal;\n';
        return content;
      }
      if (id.includes('eventemitter3')) {
        const filepath = id.split('?')[0];
        if (filepath.endsWith('index.js')) {
          console.log('[load] shimmed path for eventemitter3 index.js:', id);
          let content = fs.readFileSync(filepath, 'utf8');
          content += '\nexport default EventEmitter;\nexport { EventEmitter };\n';
          return content;
        }
      }
      if (id.includes('react-is')) {
        const filepath = id.split('?')[0];
        if (filepath.endsWith('index.js')) {
          console.log('[load] shimmed path for react-is index.js:', id);
          return `
            export const Fragment = Symbol.for('react.fragment');
            export const Portal = Symbol.for('react.portal');
            export const Profiler = Symbol.for('react.profiler');
            export const StrictMode = Symbol.for('react.strict_mode');
            export const Suspense = Symbol.for('react.suspense');
            export const SuspenseList = Symbol.for('react.suspense_list');
            
            export function typeOf(object) {
              if (typeof object === 'object' && object !== null) {
                const $$typeof = object.$$typeof;
                switch ($$typeof) {
                  case Symbol.for('react.element'):
                    const type = object.type;
                    switch (type) {
                      case Fragment:
                      case Profiler:
                      case StrictMode:
                      case Suspense:
                      case SuspenseList:
                        return type;
                      default:
                        const $$typeofType = type && type.$$typeof;
                        switch ($$typeofType) {
                          case Symbol.for('react.context'):
                          case Symbol.for('react.forward_ref'):
                          case Symbol.for('react.lazy'):
                          case Symbol.for('react.memo'):
                          case Symbol.for('react.provider'):
                            return $$typeofType;
                          default:
                            return $$typeof;
                        }
                    }
                  case Symbol.for('react.portal'):
                    return $$typeof;
                }
              }
              return undefined;
            }
            
            export function isFragment(object) {
              return typeOf(object) === Fragment;
            }
            
            export function isValidElementType(type) {
              return (
                typeof type === 'string' ||
                typeof type === 'function' ||
                type === Fragment ||
                type === Profiler ||
                type === StrictMode ||
                type === Suspense ||
                type === SuspenseList ||
                (typeof type === 'object' &&
                  type !== null &&
                  (type.$$typeof === Symbol.for('react.lazy') ||
                    type.$$typeof === Symbol.for('react.memo') ||
                    type.$$typeof === Symbol.for('react.provider') ||
                    type.$$typeof === Symbol.for('react.context') ||
                    type.$$typeof === Symbol.for('react.forward_ref')))
              );
            }
            
            export function isContextConsumer(object) { return typeOf(object) === Symbol.for('react.context'); }
            export function isContextProvider(object) { return typeOf(object) === Symbol.for('react.provider'); }
            export function isElement(object) {
              return typeof object === 'object' && object !== null && object.$$typeof === Symbol.for('react.element');
            }
            export function isForwardRef(object) { return typeOf(object) === Symbol.for('react.forward_ref'); }
            export function isLazy(object) { return typeOf(object) === Symbol.for('react.lazy'); }
            export function isMemo(object) { return typeOf(object) === Symbol.for('react.memo'); }
            export function isPortal(object) { return typeOf(object) === Symbol.for('react.portal'); }
            export function isProfiler(object) { return typeOf(object) === Profiler; }
            export function isStrictMode(object) { return typeOf(object) === StrictMode; }
            export function isSuspense(object) { return typeOf(object) === Suspense; }
            export function isSuspenseList(object) { return typeOf(object) === SuspenseList; }
            
            export default {
              Fragment, Portal, Profiler, StrictMode, Suspense, SuspenseList,
              typeOf, isFragment, isValidElementType, isContextConsumer, isContextProvider,
              isElement, isForwardRef, isLazy, isMemo, isPortal, isProfiler, isStrictMode,
              isSuspense, isSuspenseList
            };
          `;
        }
      }
    }
  };

  const plugins: any[] = [
    react(),
    esToolkitShimPlugin,
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
        ],
        shortcuts: [
          {
            name: 'Painel Touch (Operador)',
            short_name: 'Painel Touch',
            description: 'Acessar diretamente o Painel do Operador Touch',
            url: '/#/operador-touch',
            icons: [{ src: 'icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Painel Padrão (Operador)',
            short_name: 'Painel Padrão',
            description: 'Acessar diretamente o Painel de Operador Padrão',
            url: '/#/operador',
            icons: [{ src: 'icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Conector Celular',
            short_name: 'Conector',
            description: 'Conectar celular ou tablet como painel',
            url: '/#/bridge',
            icons: [{ src: 'icon-192.png', sizes: '192x192' }]
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ]

  // if (isDev) {
  //   const mkcertPlugin = (await import('vite-plugin-mkcert')).default
  //   plugins.push(mkcertPlugin())
  // }

  return {
    server: {
      host: true,
      port: 5175,
      strictPort: true,
      watch: {
        usePolling: true
      },
      proxy: {
        '/api': 'http://localhost:3001',
        '/events': 'http://localhost:3001',
        '/uploads': 'http://localhost:3001'
      }
    },
    optimizeDeps: {
      exclude: ['recharts', 'decimal.js-light', 'use-sync-external-store', 'eventemitter3', 'react-is']
    },
    plugins,
    base: './',
  }
})

