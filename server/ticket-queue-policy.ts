type ConfigReader = {
  prepare(sql: string): { get(...params: unknown[]): unknown };
};

function isPreferentialRequest(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function resolveRequestedQueue(
  db: ConfigReader,
  requestedPreferential: unknown,
): { preferential: boolean } {
  const preferential = isPreferentialRequest(requestedPreferential);
  const key = preferential ? 'fila_preferencial_ativa' : 'fila_normal_ativa';
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(key) as { valor?: unknown } | undefined;

  if (row?.valor !== '1') {
    const queueLabel = preferential ? 'preferencial' : 'geral';
    throw new Error(`A fila ${queueLabel} está desativada`);
  }

  return { preferential };
}
