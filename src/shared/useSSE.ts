import { useEffect, useState, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';

export function useSSE(url: string | null, eventType?: string) {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeout = useRef<any>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const verificationIntervalRef = useRef<any>(null);

  const connect = useCallback(() => {
    if (!url) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    if (verificationIntervalRef.current) {
      clearInterval(verificationIntervalRef.current);
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    const TIMEOUT_RECONEXAO = 6 * 60 * 60 * 1000; // 6 horas em ms
    let ultimoEventoTimestamp = Date.now();

    eventSource.onopen = () => {
      setConnected(true);
      reconnectAttempts.current = 0;
      console.log('[SSE] Conectado a', url);
    };

    eventSource.onmessage = (event) => {
      ultimoEventoTimestamp = Date.now();
      try {
        const payload = JSON.parse(event.data);
        console.log('[SSE] EVENTO RECEBIDO:', payload.event, payload);
        
        // Dispatch global event on window so other components/layers can listen to it
        const customEvent = new CustomEvent(payload.event, { detail: payload.data });
        window.dispatchEvent(customEvent);
        
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

    // Verificar a cada 5 minutos se está há mais de 6h sem eventos
    verificationIntervalRef.current = setInterval(() => {
      if (Date.now() - ultimoEventoTimestamp > TIMEOUT_RECONEXAO) {
        console.log('[SSE] Sem eventos há 6h — forçando reconexão a', url);
        eventSource.close();
        connect(); // reconectar
      }
    }, 5 * 60 * 1000);
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
      if (verificationIntervalRef.current) {
        clearInterval(verificationIntervalRef.current);
      }
    };
  }, [connect]);

  return { data, connected };
}
