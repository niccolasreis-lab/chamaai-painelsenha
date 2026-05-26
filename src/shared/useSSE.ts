import { useEffect, useState, useRef, useCallback } from 'react';

export function useSSE(url: string | null, eventType?: string) {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeout = useRef<any>(null);

  const connect = useCallback(() => {
    if (!url) return null;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setConnected(true);
      console.log('[SSE] Conectado a', url);
    };

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (eventType) {
          if (payload.event === eventType) {
            // Sempre cria um novo objeto para forçar o React a re-renderizar
            setData({ ...payload.data, _ts: Date.now() });
          }
        } else {
          setData({ ...payload, _ts: Date.now() });
        }
      } catch (err) {
        console.error('[SSE] Erro ao parsear dados', err);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
      // Reconectar automaticamente após 3 segundos
      reconnectTimeout.current = setTimeout(() => {
        console.log('[SSE] Reconectando...');
        connect();
      }, 3000);
    };

    return eventSource;
  }, [url, eventType]);

  useEffect(() => {
    const es = connect();
    return () => {
      if (es) {
        es.close();
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [connect]);

  return { data, connected };
}
