export type OperatorAction = 'proximo' | 'repetir' | 'devolver';
export type ConnectivityState = 'connected' | 'checking' | 'disconnected';
export type OperatorSnapshot = { waitingCount: number; hasActiveTicket: boolean };

export function formatGuiche(value: unknown): string {
  const normalized = String(value ?? '').trim().replace(/^(guich[eê]|balc[aã]o)\s*:?\s*/i, '');
  return normalized ? `Guichê ${normalized}` : '';
}

export function operatorFeedback(action: OperatorAction, hasActiveTicket: boolean, waitingCount: number): string | null {
  if (action === 'proximo' && waitingCount < 1) return 'Nenhuma pessoa aguardando.';
  if (action === 'repetir' && !hasActiveTicket) return 'Nenhuma senha em atendimento para repetir.';
  if (action === 'devolver' && !hasActiveTicket) return 'Nenhuma senha em atendimento para devolver.';
  return null;
}

export function pendingActionLabel(action: OperatorAction): string {
  if (action === 'proximo') return 'Chamar próximo';
  if (action === 'repetir') return 'Repetir';
  return 'Devolver';
}

export function validateRecoveredAction(action: OperatorAction, snapshot: OperatorSnapshot): string | null {
  return operatorFeedback(action, snapshot.hasActiveTicket, snapshot.waitingCount);
}
