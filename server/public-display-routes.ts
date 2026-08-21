const EXACT_PUBLIC_DISPLAY_READ_ROUTES = new Set([
  '/api/configuracoes',
  '/api/midias',
  '/api/fila',
  '/api/chamadas/recentes',
  '/api/telao/init',
  '/api/telao/tema-atual',
  '/api/toledo/produtos',
  '/api/categorias',
  '/api/media/settings',
  '/api/media/active-playlist',
  '/api/media/weather',
]);

function normalizeRequestPath(requestPath: string): string {
  if (requestPath.length > 1 && requestPath.endsWith('/')) {
    return requestPath.slice(0, -1);
  }
  return requestPath;
}

export function isPublicDisplayReadRequest(method: string, requestPath: string): boolean {
  if (method.toUpperCase() !== 'GET') return false;

  const normalizedPath = normalizeRequestPath(requestPath);
  return EXACT_PUBLIC_DISPLAY_READ_ROUTES.has(normalizedPath)
    || normalizedPath.startsWith('/api/telao/profile/')
    || normalizedPath.startsWith('/api/telao/assets/');
}
