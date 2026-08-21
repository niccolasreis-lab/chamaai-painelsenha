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

function samePrimitiveRecord(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return keys.every((key) => left[key] === right[key]);
}

function sameOrderedRecords<T extends object>(
  left: readonly T[],
  right: readonly T[],
  keys: readonly string[],
): boolean {
  return left.length === right.length && left.every((item, index) => (
    samePrimitiveRecord(
      item as Record<string, unknown>,
      right[index] as Record<string, unknown>,
      keys,
    )
  ));
}

/**
 * Prevents polling responses with identical data from replacing array
 * references and consequently restarting the currently visible price slide.
 */
export function haveSameEncarteSnapshot(
  current: EncarteDisplaySnapshot,
  incoming: EncarteDisplaySnapshot,
): boolean {
  const sameProducts = sameOrderedRecords(current.produtos, incoming.produtos, [
    'id', 'plu', 'codigo', 'descricao', 'nome', 'preco', 'categoria', 'unidade',
  ]);
  if (!sameProducts) return false;

  const sameCategories = sameOrderedRecords(current.categorias, incoming.categorias, [
    'id', 'nome', 'emoji', 'slug', 'ativo', 'ordem', 'descricao',
  ]);
  if (!sameCategories) return false;

  return JSON.stringify(current.temaAtivo) === JSON.stringify(incoming.temaAtivo);
}

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
