import type { Categoria, MediaItem, ProdutoToledo, TemaEncarte } from '../shared/types';

const CACHE_VERSION = 1;

type CacheEnvelope<T> = {
  version: number;
  savedAt: number;
  data: T;
};

export type EncarteDisplaySnapshot = {
  produtos: ProdutoToledo[];
  categorias: Categoria[];
  temaAtivo: TemaEncarte | null;
};

export type MediaDisplaySnapshot = {
  items: MediaItem[];
  theme?: unknown;
};

function getCacheKey(apiUrl: string, namespace: string): string {
  return `chamaai:telao:${encodeURIComponent(apiUrl)}:${namespace}`;
}

export function readDisplayCache<T>(apiUrl: string, namespace: string): CacheEnvelope<T> | null {
  try {
    const raw = window.localStorage.getItem(getCacheKey(apiUrl, namespace));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (parsed.version !== CACHE_VERSION || !parsed.data || !Number.isFinite(parsed.savedAt)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeDisplayCache<T>(apiUrl: string, namespace: string, data: T): void {
  try {
    const envelope: CacheEnvelope<T> = {
      version: CACHE_VERSION,
      savedAt: Date.now(),
      data,
    };
    window.localStorage.setItem(getCacheKey(apiUrl, namespace), JSON.stringify(envelope));
  } catch (error) {
    console.warn(`[TELAO] Não foi possível persistir o cache ${namespace}:`, error);
  }
}

export function isMediaAvailableForDisplay(item: MediaItem, now = new Date()): boolean {
  if (item.ativo !== 1 || item.status !== 'ativo') return false;

  const expiration = (item as MediaItem & { data_expiracao?: string | null }).data_expiracao;
  if (!expiration) return true;

  const expirationDate = new Date(`${expiration}T23:59:59`);
  return Number.isNaN(expirationDate.getTime()) || expirationDate >= now;
}
