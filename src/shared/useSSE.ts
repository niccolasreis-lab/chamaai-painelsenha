import { useEffect, useState, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';

export function useSSE(url: string | null, eventType?: string) {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeout = useRef<any>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (!url) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      reconnectAttempts.current = 0;
      console.log('[SSE] Conectado a', url);
    };

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('[SSE] EVENTO RECEBIDO:', payload.event, payload);
        
        flushSync(() => {
          if (eventType) {
            if (payload.event === eventType) {
              // Sempre cria um novo objeto para forçar o React a re-renderizar
              setData({ ...payload.data, _ts: Date.now() });
            }
          } else {
            setData({ ...payload, _ts: Date.now() });
          }
        });
      } catch (err) {
        console.error('[SSE] Erro ao parsear dados', err);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
      
      const attempts = reconnectAttempts.current;
      const baseDelay = 3000;
      const delay = Math.min(baseDelay * Math.pow(1.5, attempts), 30000);
      reconnectAttempts.current += 1;

      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }

      reconnectTimeout.current = setTimeout(() => {
        console.log(`[SSE] Reconectando a ${url} em ${Math.round(delay)}ms... (Tentativa ${attempts + 1})`);
        connect();
      }, delay);
    };
  }, [url, eventType]);

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [connect]);

  return { data, connected };
}
