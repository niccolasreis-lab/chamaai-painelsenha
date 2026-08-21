import { useCallback, useEffect, useState, useRef } from 'react';

export function useSSE(url: string | null, eventType?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const verificationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectNowRef = useRef<(() => void) | null>(null);

  const reconnectNow = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    connectNowRef.current?.();
  }, []);

  useEffect(() => {
    if (!url) return;

    const connect = () => {
      setConnected(false);
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.onopen = null;
        eventSourceRef.current.onmessage = null;
        eventSourceRef.current.onerror = null;
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
        if (eventSourceRef.current !== eventSource) return;
        setConnected(true);
        reconnectAttempts.current = 0;
        console.log('[SSE] Conectado a', url);
      };

      eventSource.onmessage = (event) => {
        if (eventSourceRef.current !== eventSource) return;
        ultimoEventoTimestamp = Date.now();
        try {
          const payload = JSON.parse(event.data);
          console.log('[SSE] EVENTO RECEBIDO:', payload.event, payload);
          
          // Dispatch global event on window so other components/layers can listen to it
          const customEvent = new CustomEvent(payload.event, { detail: payload.data });
          window.dispatchEvent(customEvent);
          
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
        if (eventSourceRef.current !== eventSource) return;
        setConnected(false);
        eventSource.onopen = null;
        eventSource.onmessage = null;
        eventSource.onerror = null;
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
    };

    connectNowRef.current = connect;

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.onopen = null;
        eventSourceRef.current.onmessage = null;
        eventSourceRef.current.onerror = null;
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnected(false);
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (verificationIntervalRef.current) {
        clearInterval(verificationIntervalRef.current);
      }
      connectNowRef.current = null;
    };
  }, [url, eventType]);

  return { data, connected, reconnectNow };
}
