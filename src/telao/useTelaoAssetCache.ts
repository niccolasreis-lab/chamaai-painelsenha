import { useCallback, useEffect, useState } from 'react';
import {
  resolveTelaoAssetUrl,
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
    void sync();
  }, [sync]);

  const resolve = useCallback((url?: string | null) => (
    resolveTelaoAssetUrl(apiUrl, url, resolved)
  ), [apiUrl, resolved]);

  return { resolve, stats, sync };
}
