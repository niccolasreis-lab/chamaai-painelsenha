const PUBLIC_OPERATOR_ACTIONS = new Set([
  '/api/operador/proximo',
  '/api/operador/repetir',
  '/api/operador/devolver',
]);

export function isPublicOperatorRequest(method: string, path: string): boolean {
  const normalizedMethod = method.toUpperCase();
  return (
    (normalizedMethod === 'GET' && path === '/api/operador/estado') ||
    (normalizedMethod === 'POST' && PUBLIC_OPERATOR_ACTIONS.has(path))
  );
}
