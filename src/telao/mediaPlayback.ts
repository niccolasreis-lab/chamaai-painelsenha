export type PlaylistEntry = {
  id: string | number;
};

export const VIDEO_STALL_TIMEOUT_MS = 15_000;

function normalizedIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

/**
 * Advances circularly and skips assets already known to be unavailable.
 * If every item failed, the current normalized index is retained so the UI
 * can render its fallback instead of entering a hot state-update loop.
 */
export function nextPlayableIndex<T extends PlaylistEntry>(
  items: readonly T[],
  currentIndex: number,
  failedIds: ReadonlySet<string | number>,
): number {
  if (items.length === 0) return 0;

  const current = normalizedIndex(currentIndex, items.length);
  for (let offset = 1; offset <= items.length; offset += 1) {
    const candidate = (current + offset) % items.length;
    if (!failedIds.has(items[candidate].id)) return candidate;
  }

  return current;
}

export function playableItemCount<T extends PlaylistEntry>(
  items: readonly T[],
  failedIds: ReadonlySet<string | number>,
): number {
  return items.reduce((count, item) => count + (failedIds.has(item.id) ? 0 : 1), 0);
}

/** A video loops in the element only when it is the sole playable content. */
export function shouldLoopVideo<T extends PlaylistEntry>(
  items: readonly T[],
  failedIds: ReadonlySet<string | number>,
  hasInterleavedContent: boolean,
): boolean {
  return !hasInterleavedContent && playableItemCount(items, failedIds) === 1;
}

type FingerprintedPlaylistEntry = PlaylistEntry & {
  type?: unknown;
  tipo?: unknown;
  local_path?: unknown;
  caminho?: unknown;
  source_url?: unknown;
  duration_seconds?: unknown;
  is_active?: unknown;
  ativo?: unknown;
};

export function playlistFingerprint(items: ReadonlyArray<FingerprintedPlaylistEntry>): string {
  return items.map((item) => [
    item.id,
    item.type ?? item.tipo,
    item.local_path ?? item.caminho,
    item.source_url,
    item.duration_seconds,
    item.is_active ?? item.ativo,
  ].join(':')).join('|');
}
