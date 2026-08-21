import { useEffect, useState } from 'react';
import { Dialog, Input, Button } from '../shared/components';
import type { TelaoCacheStats } from './telaoAssetCache';

function isValidHost(value: string): boolean {
  if (!value || /[:/\\\s]/.test(value)) return false;
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4.test(value)) return value.split('.').every((part) => Number(part) <= 255);
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(value);
}

export default function TelaoConnectionDialog() {
  const [open, setOpen] = useState(() => !localStorage.getItem('server_ip_override'));
  const [host, setHost] = useState(localStorage.getItem('server_ip_override') || '');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [cacheStats, setCacheStats] = useState<TelaoCacheStats | null>(null);

  useEffect(() => {
    const handleOpen = () => {
      setHost(localStorage.getItem('server_ip_override') || '');
      setError('');
      setOpen(true);
    };
    window.addEventListener('TELAO_OPEN_SETTINGS', handleOpen);
    const handleCache = (event: Event) => setCacheStats((event as CustomEvent<TelaoCacheStats>).detail);
    window.addEventListener('TELAO_CACHE_UPDATED', handleCache);
    return () => {
      window.removeEventListener('TELAO_OPEN_SETTINGS', handleOpen);
      window.removeEventListener('TELAO_CACHE_UPDATED', handleCache);
    };
  }, []);

  const save = async () => {
    const normalized = host.trim().toLowerCase();
    if (!isValidHost(normalized)) {
      setError('Informe apenas um IPv4 ou hostname válido, sem protocolo, porta ou caminho.');
      return;
    }
    setChecking(true);
    setError('');
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`http://${normalized}:3001/health`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (body?.status !== 'ok') throw new Error('resposta inválida');
      localStorage.setItem('server_ip_override', normalized);
      window.location.hash = '#/telao';
      window.location.reload();
    } catch (cause) {
      setError(`Servidor não respondeu em ${normalized}:3001 (${cause instanceof Error ? cause.message : String(cause)}).`);
    } finally {
      window.clearTimeout(timeoutId);
      setChecking(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => localStorage.getItem('server_ip_override') && setOpen(false)} title="Servidor do Telão" maxWidth="max-w-lg">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-ink-variant">Informe o IP ou hostname do computador que executa o servidor ChamaAí. A porta é 3001.</p>
        <Input
          label="IP OU HOSTNAME"
          value={host}
          onChange={(event) => setHost(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void save()}
          placeholder="192.168.1.100"
          autoFocus
        />
        {error && <p role="alert" className="text-sm font-bold text-error">{error}</p>}
        <Button onClick={() => void save()} disabled={checking} className="h-14 text-base focus-visible:ring-4">
          {checking ? 'Validando conexão...' : 'Salvar e conectar'}
        </Button>
        <p className="text-xs text-ink-variant text-center">Para alterar depois, mantenha VOLTAR pressionado por 3 segundos.</p>
        {cacheStats && (
          <div className="rounded border border-outline-variant p-3 text-xs text-ink-variant" aria-label="Diagnóstico do cache local">
            <p className="font-bold text-ink">Cache local</p>
            <p>{(cacheStats.usedBytes / 1048576).toFixed(1)} de {(cacheStats.maxBytes / 1048576).toFixed(0)} MiB · {cacheStats.entries} arquivos</p>
            <p>Última sincronização: {new Date(cacheStats.lastSync).toLocaleString('pt-BR')}</p>
            <p>Sem persistência: {cacheStats.streamedWithoutCache} · Falhas: {cacheStats.errors.length}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
