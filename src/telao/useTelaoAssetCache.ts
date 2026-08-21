import { useCallback, useEffect, useState } from 'react';
import {
  resolveTelaoAssetUrl,
  quarantineTelaoAsset,
  syncTelaoAssetCache,
  type TelaoCacheStats,
} from './telaoAssetCache';

export function useTelaoAssetCache(apiUrl: string, code: string | null) {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<TelaoCacheStats | null>(null);

  const sync = useCallback(async () => {
    if (!code) return;
    try {
      const result = await syncTelaoAssetCache(apiUrl, code);
      setResolved(result.resolved);
      setStats(result.stats);
      window.dispatchEvent(new CustomEvent('TELAO_CACHE_UPDATED', { detail: result.stats }));
    } catch (error) {
      console.error('[TELAO_CACHE] Falha na sincronização:', error);
    }
  }, [apiUrl, code]);

  useEffect(() => {
    // A atualização de estado ocorre somente após a sincronização assíncrona do manifesto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void sync();
  }, [sync]);

  const resolve = useCallback((url?: string | null) => (
    resolveTelaoAssetUrl(apiUrl, url, resolved)
  ), [apiUrl, resolved]);

  const evict = useCallback(async (url?: string | null) => {
    if (!url) return;
    try {
      await quarantineTelaoAsset(apiUrl, url);
    } finally {
      setResolved(previous => {
        const next = { ...previous };
        delete next[url];
        return next;
      });
    }
  }, [apiUrl]);

  return { resolve, evict, stats, sync };
}
