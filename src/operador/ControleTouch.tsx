import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Megaphone, Radio, RefreshCw, Settings, Undo2, Wifi, WifiOff } from 'lucide-react';
import { getApiUrl, setServerIp } from '../shared/apiConfig';
import { useSSE } from '../shared/useSSE';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { Dialog } from '../shared/components/Dialog';
import { formatGuiche, operatorFeedback, pendingActionLabel, validateRecoveredAction, type ConnectivityState, type OperatorAction, type OperatorSnapshot } from './operatorState';

type Ticket = { id: number; numero: string; preferencial: number | boolean; guiche?: string };
type Feedback = { kind: 'success' | 'warning' | 'error'; message: string };
type PendingAction = { id: number; action: OperatorAction; guiche: string };
const HEALTH_INTERVAL_MS = 3000;
const HEALTH_TIMEOUT_MS = 2200;
const feedbackClasses = { success: 'bg-success-container text-success-ink border-success/30', warning: 'bg-warning-container text-warning-ink border-warning/30', error: 'bg-error-container text-error-ink border-error/30' };

export default function ControleTouch() {
  const [guiche, setGuiche] = useState(localStorage.getItem('operator_guiche') || '');
  const [tempGuiche, setTempGuiche] = useState(localStorage.getItem('operator_guiche') || '');
  const [tempIp, setTempIp] = useState(localStorage.getItem('server_ip_override') || '');
  const [isSetup, setIsSetup] = useState(Boolean(localStorage.getItem('operator_guiche')));
  const [isValidating, setIsValidating] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState<Ticket | null>(null);
  const [aguardando, setAguardando] = useState(0);
  const [connectivity, setConnectivity] = useState<ConnectivityState>('checking');
  const [showSettings, setShowSettings] = useState(false);
  const [showConfirmDevolver, setShowConfirmDevolver] = useState(false);
  const [actionInFlight, setActionInFlight] = useState<OperatorAction | null>(null);
  const [queuedAction, setQueuedAction] = useState<PendingAction | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const healthCheckRef = useRef<Promise<boolean> | null>(null);
  const healthAbortRef = useRef<AbortController | null>(null);
  const queuedActionRef = useRef<PendingAction | null>(null);
  const recoveryLockRef = useRef(false);
  const actionLockRef = useRef(false);
  const actionIdRef = useRef(0);
  const wasSseConnected = useRef(false);
  const hadOutageRef = useRef(false);
  const connectivityRef = useRef<ConnectivityState>('checking');
  const sseConnectedRef = useRef(false);
  const API_URL = getApiUrl();
  const announce = useCallback((kind: Feedback['kind'], message: string) => setFeedback({ kind, message }), []);
  const { data: sseData, connected: sseConnected, reconnectNow } = useSSE(isSetup ? `${API_URL}/events` : null);

  const setPending = useCallback((pending: PendingAction | null) => {
    queuedActionRef.current = pending;
    setQueuedAction(pending);
  }, []);

  const refreshData = useCallback(async (showError = true, targetGuiche = guiche): Promise<OperatorSnapshot | null> => {
    if (!isSetup) return null;
    try {
      const [queueRes, ticketsRes] = await Promise.all([fetch(`${API_URL}/api/fila`), fetch(`${API_URL}/api/senhas`)]);
      if (!queueRes.ok || !ticketsRes.ok) throw new Error();
      const queue = await queueRes.json();
      const tickets = await ticketsRes.json();
      const waitingCount = Array.isArray(queue) ? queue.length : 0;
      const active = Array.isArray(tickets) ? tickets.find((ticket: any) => ticket.status === 'chamada' && formatGuiche(ticket.guiche) === formatGuiche(targetGuiche)) : null;
      const activeTicket = active ? { id: active.id, numero: `${active.preferencial ? 'P' : 'A'}-${String(active.numero).padStart(3, '0')}`, preferencial: active.preferencial, guiche: formatGuiche(targetGuiche) } : null;
      setAguardando(waitingCount);
      setSenhaAtual(activeTicket);
      return { waitingCount, hasActiveTicket: Boolean(activeTicket) };
    } catch {
      if (showError) announce('error', 'Servidor indisponível. Reconexão automática ativa.');
      return null;
    }
  }, [API_URL, announce, guiche, isSetup]);

  const checkHealth = useCallback((): Promise<boolean> => {
    if (!isSetup) return Promise.resolve(false);
    if (healthCheckRef.current) return healthCheckRef.current;
    setConnectivity((current) => current === 'connected' ? current : 'checking');
    const controller = new AbortController();
    healthAbortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const operation = (async () => {
      try {
        const response = await fetch(`${API_URL}/health`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error();
        setConnectivity('connected');
        reconnectNow();
        return true;
      } catch {
        hadOutageRef.current = true;
        setConnectivity('disconnected');
        return false;
      } finally {
        window.clearTimeout(timeout);
        if (healthAbortRef.current === controller) healthAbortRef.current = null;
        healthCheckRef.current = null;
      }
    })();
    healthCheckRef.current = operation;
    return operation;
  }, [API_URL, isSetup, reconnectNow]);

  const executeAction = useCallback(async (action: OperatorAction, recovered = false, targetGuiche = guiche): Promise<boolean> => {
    if (actionLockRef.current) return false;
    actionLockRef.current = true;
    setActionInFlight(action);
    navigator.vibrate?.(action === 'devolver' ? [50, 50, 50] : 60);
    try {
      const response = await fetch(`${API_URL}/api/operador/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guiche: targetGuiche }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        announce('error', result.error || 'Não foi possível concluir a ação.');
        return false;
      }
      if (action !== 'devolver') setSenhaAtual(result.data?.ticket || result.data || null); else setSenhaAtual(null);
      if (Number.isFinite(result.data?.aguardando)) setAguardando(result.data.aguardando); else await refreshData(false);
      announce('success', recovered ? `Conexão restabelecida. ${pendingActionLabel(action)} executado.` : action === 'proximo' ? 'Próxima senha chamada.' : action === 'repetir' ? 'Chamada repetida.' : 'Senha devolvida à fila.');
      return true;
    } catch (error) {
      hadOutageRef.current = true;
      setConnectivity('disconnected');
      announce('error', `${error instanceof Error ? error.message : 'Sem comunicação com o servidor.'} A ação não será repetida automaticamente para evitar duplicidade.`);
      return false;
    } finally { actionLockRef.current = false; setActionInFlight(null); }
  }, [API_URL, announce, guiche, refreshData]);

  const queueOfflineAction = useCallback((action: OperatorAction) => {
    if (queuedActionRef.current || actionInFlight) return;
    const pending = { id: ++actionIdRef.current, action, guiche };
    hadOutageRef.current = true;
    setPending(pending);
    announce('warning', `Servidor offline — ${pendingActionLabel(action)} será executado quando a conexão voltar.`);
    void checkHealth();
  }, [actionInFlight, announce, checkHealth, guiche, setPending]);

  const runAction = useCallback(async (action: OperatorAction) => {
    if (queuedActionRef.current || actionInFlight) return;
    if (connectivity !== 'connected') return queueOfflineAction(action);
    const localMessage = operatorFeedback(action, Boolean(senhaAtual), aguardando);
    if (localMessage) return announce('warning', localMessage);
    await executeAction(action);
  }, [actionInFlight, aguardando, announce, connectivity, executeAction, queueOfflineAction, senhaAtual]);

  useEffect(() => { if (isSetup) void checkHealth(); }, [checkHealth, isSetup]);

  useEffect(() => {
    if (!isSetup || connectivity === 'connected') return;
    const timer = window.setInterval(() => void checkHealth(), HEALTH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [checkHealth, connectivity, isSetup]);

  useEffect(() => {
    if (!isSetup) return;
    const recoverOnInteraction = () => { if (connectivity !== 'connected') void checkHealth(); };
    const recoverOnVisibility = () => { if (document.visibilityState === 'visible') recoverOnInteraction(); };
    document.addEventListener('pointerdown', recoverOnInteraction, { capture: true, passive: true });
    document.addEventListener('visibilitychange', recoverOnVisibility);
    window.addEventListener('online', recoverOnInteraction);
    window.addEventListener('focus', recoverOnInteraction);
    return () => {
      document.removeEventListener('pointerdown', recoverOnInteraction, { capture: true });
      document.removeEventListener('visibilitychange', recoverOnVisibility);
      window.removeEventListener('online', recoverOnInteraction);
      window.removeEventListener('focus', recoverOnInteraction);
    };
  }, [checkHealth, connectivity, isSetup]);

  useEffect(() => {
    sseConnectedRef.current = sseConnected;
    if (sseConnected) setConnectivity('connected');
    else if (wasSseConnected.current) { hadOutageRef.current = true; setConnectivity('disconnected'); }
    wasSseConnected.current = sseConnected;
  }, [sseConnected]);

  useEffect(() => { connectivityRef.current = connectivity; }, [connectivity]);

  useEffect(() => {
    if (connectivity !== 'connected' || !sseConnected || recoveryLockRef.current) return;
    recoveryLockRef.current = true;
    void (async () => {
      const pending = queuedActionRef.current;
      const snapshot = await refreshData(false, pending?.guiche || guiche);
      if (!snapshot) { setConnectivity('disconnected'); recoveryLockRef.current = false; return; }
      if (connectivityRef.current !== 'connected' || !sseConnectedRef.current) { recoveryLockRef.current = false; return; }
      if (!pending) {
        if (hadOutageRef.current) announce('success', 'Conexão restabelecida. Dados atualizados.');
        hadOutageRef.current = false;
        recoveryLockRef.current = false;
        return;
      }
      if (queuedActionRef.current?.id !== pending.id) { recoveryLockRef.current = false; return; }
      setPending(null);
      const invalidReason = validateRecoveredAction(pending.action, snapshot);
      if (invalidReason) announce('warning', `Conexão restabelecida. A ação pendente foi cancelada: ${invalidReason}`);
      else await executeAction(pending.action, true, pending.guiche);
      hadOutageRef.current = false;
      recoveryLockRef.current = false;
    })();
  }, [announce, connectivity, executeAction, guiche, refreshData, setPending, sseConnected]);

  useEffect(() => () => { healthAbortRef.current?.abort(); queuedActionRef.current = null; }, []);

  useEffect(() => {
    if (!sseData) return;
    if (sseData.event === 'queue-update') setAguardando(Number(sseData.data?.geral || 0) + Number(sseData.data?.preferencial || 0));
    else if (sseData.event === 'ticket-called' && formatGuiche(sseData.data?.guiche) === formatGuiche(guiche)) setSenhaAtual(sseData.data?.numero == null ? null : sseData.data as Ticket);
    else if (['NOVA_SENHA_EMITIDA', 'SENHA_ESTORNADA', 'SISTEMA_RESETADO', 'DIA_RESETADO'].includes(sseData.event)) void refreshData(false);
  }, [guiche, refreshData, sseData]);

  const connect = async () => {
    if (!tempGuiche.trim()) return announce('warning', 'Informe o número ou nome do guichê.');
    setIsValidating(true);
    const cleanIp = tempIp.trim().replace(/^https?:\/\//i, '').replace(/:3001\/?$/, '');
    try {
      const response = await fetch(`${cleanIp ? `http://${cleanIp}:3001` : API_URL}/health`);
      if (!response.ok) throw new Error();
      const nextGuiche = tempGuiche.trim();
      localStorage.setItem('operator_guiche', nextGuiche);
      if (cleanIp !== (localStorage.getItem('server_ip_override') || '')) { setServerIp(cleanIp); return; }
      setGuiche(nextGuiche); setIsSetup(true); setConnectivity('connected'); setShowSettings(false); announce('success', 'Terminal conectado.');
    } catch { announce('error', 'Servidor não encontrado. Confira o endereço e a rede Wi-Fi.'); }
    finally { setIsValidating(false); }
  };

  const settingsDialog = <Dialog open={showSettings} onClose={() => setShowSettings(false)} title="Configurar terminal" maxWidth="max-w-md"><div className="space-y-5"><Input label="Endereço do servidor" value={tempIp} onChange={(e) => setTempIp(e.target.value)} placeholder="Ex.: 192.168.1.10" /><Input label="Guichê" value={tempGuiche} onChange={(e) => setTempGuiche(e.target.value)} placeholder="Ex.: 1" /><Button className="w-full min-h-14" onClick={connect} loading={isValidating}>SALVAR E CONECTAR</Button></div></Dialog>;

  if (!isSetup) return <main className="min-h-[100dvh] bg-background text-ink grid place-items-center p-6 font-sans"><section className="w-full max-w-md bg-surface rounded-md p-8 border border-outline-variant"><div className="flex items-center gap-4 mb-8"><span className="w-14 h-14 bg-primary rounded-md grid place-items-center"><Radio className="h-7 w-7 text-on-primary" /></span><div><h1 className="text-2xl font-bold">ChamaAí Operador</h1><p className="text-sm text-ink-variant">Configure este terminal para começar.</p></div></div><div className="space-y-5"><Input label="Endereço do servidor" value={tempIp} onChange={(e) => setTempIp(e.target.value)} placeholder="Ex.: 192.168.1.10" /><Input label="Guichê" value={tempGuiche} onChange={(e) => setTempGuiche(e.target.value)} placeholder="Ex.: 1" />{feedback && <div role="status" className={`p-3 rounded-sm border text-sm ${feedbackClasses[feedback.kind]}`}>{feedback.message}</div>}<Button className="w-full min-h-14" onClick={connect} loading={isValidating}>CONECTAR</Button></div></section></main>;

  const connected = connectivity === 'connected';
  const checking = connectivity === 'checking';
  const controlsLocked = Boolean(queuedAction || actionInFlight);
  return <main className="operator-shell bg-background text-ink font-sans select-none">
    <section className="operator-context bg-surface border border-outline-variant rounded-md">
      <header className="flex items-center justify-between gap-4"><div><h1 className="text-xl font-bold">{formatGuiche(guiche)}</h1><p className={`mt-1 flex items-center gap-2 text-sm font-semibold ${connected ? 'text-success-ink' : checking ? 'text-warning-ink' : 'text-error-ink'}`}>{connected ? <Wifi className="h-4 w-4" /> : checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <WifiOff className="h-4 w-4" />}{connected ? 'Conectado' : checking ? 'Reconectando…' : 'Desconectado — nova tentativa em até 3 s'}</p></div><Button aria-label="Configurar terminal" title="Configurar terminal" variant="ghost" size="lg" onClick={() => { setTempGuiche(guiche); setShowSettings(true); }} icon={<Settings className="h-6 w-6" />} /></header>
      <div className="operator-ticket" aria-live="polite"><p className="text-sm font-semibold text-ink-variant">Senha em atendimento</p><strong className={`block font-mono leading-none ${senhaAtual ? 'text-primary' : 'text-outline'}`}>{senhaAtual?.numero || '—'}</strong><p className="text-sm font-medium text-ink-variant">{senhaAtual ? 'Em atendimento' : 'Nenhuma senha em atendimento'}</p></div>
      <div className="operator-queue bg-surface-container-low border border-outline-variant rounded-sm text-center" aria-live="polite"><strong className="block font-mono text-primary leading-none">{aguardando}</strong><span className="text-sm font-semibold text-ink-variant">{aguardando === 1 ? 'pessoa aguardando' : 'pessoas aguardando'}</span></div>
      {feedback && <div role="status" aria-live="polite" className={`operator-feedback p-3 rounded-sm border text-sm font-semibold ${feedbackClasses[feedback.kind]}`}>{feedback.message}</div>}
    </section>
    <section className="operator-actions" aria-label="Ações de atendimento">
      <Button size="lg" onClick={() => void runAction('proximo')} loading={actionInFlight === 'proximo' || queuedAction?.action === 'proximo'} disabled={controlsLocked && actionInFlight !== 'proximo' && queuedAction?.action !== 'proximo'} className="operator-action bg-success text-white border-0" icon={<Megaphone className="operator-action-icon" />}><span>CHAMAR PRÓXIMO</span></Button>
      <Button size="lg" onClick={() => void runAction('repetir')} loading={actionInFlight === 'repetir' || queuedAction?.action === 'repetir'} disabled={controlsLocked && actionInFlight !== 'repetir' && queuedAction?.action !== 'repetir'} className="operator-action" icon={<RefreshCw className="operator-action-icon" />}><span>REPETIR</span></Button>
      <Button size="lg" onClick={() => senhaAtual ? setShowConfirmDevolver(true) : void runAction('devolver')} loading={actionInFlight === 'devolver' || queuedAction?.action === 'devolver'} disabled={controlsLocked && actionInFlight !== 'devolver' && queuedAction?.action !== 'devolver'} variant="secondary" className="operator-action border-warning text-warning-ink" icon={<Undo2 className="operator-action-icon" />}><span>DEVOLVER</span></Button>
    </section>
    {settingsDialog}
    <Dialog open={showConfirmDevolver} onClose={() => setShowConfirmDevolver(false)} title="Devolver senha" maxWidth="max-w-sm"><div className="space-y-6 text-center"><AlertTriangle className="h-12 w-12 mx-auto text-warning-ink" /><p>Devolver a senha <strong>{senhaAtual?.numero}</strong> para a fila de espera?</p><div className="grid grid-cols-2 gap-3"><Button variant="ghost" onClick={() => setShowConfirmDevolver(false)}>CANCELAR</Button><Button variant="secondary" className="border-warning text-warning-ink" onClick={() => { setShowConfirmDevolver(false); void runAction('devolver'); }}>DEVOLVER</Button></div></div></Dialog>
  </main>;
}
