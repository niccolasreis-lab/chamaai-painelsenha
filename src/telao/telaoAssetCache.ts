import { Capacitor, registerPlugin } from '@capacitor/core';

export type TelaoAssetManifestItem = {
  id: string;
  kind: 'image' | 'video' | 'audio';
  url: string;
  version: string;
  sizeBytes: number;
  sha256: string;
  priority: number;
};

export type TelaoAssetManifest = {
  revision: string;
  maxCacheBytes: number;
  ttsRevision: string;
  assets: TelaoAssetManifestItem[];
};

export type TelaoCacheStats = {
  usedBytes: number;
  maxBytes: number;
  entries: number;
  streamedWithoutCache: number;
  errors: string[];
  lastSync: string;
};

type NativeSyncResult = TelaoCacheStats & { resolved: Record<string, string> };
type NativeTelaoCache = {
  clearLegacy(): Promise<void>;
  sync(options: { baseUrl: string; manifest: TelaoAssetManifest }): Promise<NativeSyncResult>;
  evict(options: { sha256: string }): Promise<void>;
};

const NativeCache = registerPlugin<NativeTelaoCache>('TelaoCache');
const CACHE_NAME = 'chamaai-telao-assets-v1';
const LEGACY_MIGRATION_KEY = 'telao_cache_migration_v1';
const lastManifestByApi = new Map<string, TelaoAssetManifest>();
const quarantinedUrlsByApi = new Map<string, Set<string>>();

function deviceCacheKey(apiUrl: string, code: string): string {
  return `${apiUrl}::${code.trim().toUpperCase()}`;
}

function quarantineStorageKey(apiUrl: string): string {
  return `chamaai:telao:quarantine:${encodeURIComponent(apiUrl)}`;
}

function readPersistedQuarantine(apiUrl: string, revision: string): Set<string> {
  try {
    const raw = localStorage.getItem(quarantineStorageKey(apiUrl));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { revision?: unknown; urls?: unknown };
    if (parsed.revision !== revision || !Array.isArray(parsed.urls)) return new Set();
    return new Set(parsed.urls.filter((url): url is string => typeof url === 'string'));
  } catch {
    return new Set();
  }
}

function persistQuarantine(apiUrl: string, revision: string, urls: ReadonlySet<string>): void {
  try {
    localStorage.setItem(quarantineStorageKey(apiUrl), JSON.stringify({
      revision,
      urls: [...urls],
    }));
  } catch {
    // A remoção em memória e no cache continua válida sem localStorage.
  }
}

function clearPersistedQuarantine(apiUrl: string): void {
  try {
    if (typeof localStorage.removeItem === 'function') {
      localStorage.removeItem(quarantineStorageKey(apiUrl));
    } else {
      localStorage.setItem(quarantineStorageKey(apiUrl), '');
    }
  } catch {
    // O mapa em memória ainda é invalidado pela revisão do manifesto.
  }
}

export function excludeQuarantinedAssets(
  manifest: TelaoAssetManifest,
  quarantinedUrls: ReadonlySet<string>,
): TelaoAssetManifest {
  return {
    ...manifest,
    assets: manifest.assets.filter((asset) => !quarantinedUrls.has(asset.url)),
  };
}

function absoluteAssetUrl(apiUrl: string, publicUrl: string): string {
  return new URL(publicUrl, apiUrl || window.location.origin).toString();
}

function versionedAssetUrl(apiUrl: string, asset: TelaoAssetManifestItem): string {
  const url = new URL(absoluteAssetUrl(apiUrl, asset.url));
  url.searchParams.set('asset_v', asset.version);
  return url.toString();
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function clearLegacyBrowserCaches(): Promise<void> {
  if (!('caches' in window) || localStorage.getItem(LEGACY_MIGRATION_KEY) === '1') return;
  const names = await caches.keys();
  await Promise.all(names.filter((name) => (
    name.includes('uploads') || name.includes('tts') || name.includes('media') || name === CACHE_NAME
  )).map((name) => caches.delete(name)));
  localStorage.setItem(LEGACY_MIGRATION_KEY, '1');
}

async function syncBrowserCache(
  apiUrl: string,
  manifest: TelaoAssetManifest,
): Promise<NativeSyncResult> {
  const resolved: Record<string, string> = {};
  const errors: string[] = [];
  let usedBytes = 0;
  let streamedWithoutCache = 0;
  if (!('caches' in window) || !globalThis.crypto?.subtle) {
    for (const asset of manifest.assets) resolved[asset.url] = versionedAssetUrl(apiUrl, asset);
    return {
      resolved,
      usedBytes: 0,
      maxBytes: manifest.maxCacheBytes,
      entries: 0,
      streamedWithoutCache: manifest.assets.length,
      errors: ['Cache persistente indisponível neste contexto; assets serão transmitidos sem persistência.'],
      lastSync: new Date().toISOString(),
    };
  }
  const cache = await caches.open(CACHE_NAME);
  const desiredRequests = new Set<string>();

  for (const asset of [...manifest.assets].sort((a, b) => b.priority - a.priority)) {
    const versionedUrl = versionedAssetUrl(apiUrl, asset);
    resolved[asset.url] = versionedUrl;
    if (asset.sizeBytes > manifest.maxCacheBytes || usedBytes + asset.sizeBytes > manifest.maxCacheBytes) {
      streamedWithoutCache += 1;
      continue;
    }
    desiredRequests.add(versionedUrl);
    try {
      const existing = await cache.match(versionedUrl);
      if (existing) {
        const cachedPayload = await existing.arrayBuffer();
        if (cachedPayload.byteLength !== asset.sizeBytes || (await sha256Hex(cachedPayload)) !== asset.sha256) {
          await cache.delete(versionedUrl);
        }
      }
      if (!(await cache.match(versionedUrl))) {
        const response = await fetch(versionedUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.arrayBuffer();
        if (payload.byteLength !== asset.sizeBytes) throw new Error('tamanho divergente');
        if ((await sha256Hex(payload)) !== asset.sha256) throw new Error('hash divergente');
        await cache.put(versionedUrl, new Response(payload, {
          status: 200,
          headers: response.headers,
        }));
      }
      usedBytes += asset.sizeBytes;
    } catch (error) {
      errors.push(`${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const request of await cache.keys()) {
    if (!desiredRequests.has(request.url)) await cache.delete(request);
  }

  return {
    resolved,
    usedBytes,
    maxBytes: manifest.maxCacheBytes,
    entries: desiredRequests.size,
    streamedWithoutCache,
    errors,
    lastSync: new Date().toISOString(),
  };
}

async function evictBrowserAsset(apiUrl: string, publicUrl: string): Promise<void> {
  if (!('caches' in window)) return;
  const targetPath = new URL(absoluteAssetUrl(apiUrl, publicUrl)).pathname;
  const cache = await caches.open(CACHE_NAME);
  for (const request of await cache.keys()) {
    if (new URL(request.url).pathname === targetPath) await cache.delete(request);
  }
}

/** Quarantines only the current manifest revision; server data is never mutated. */
export async function quarantineTelaoAsset(apiUrl: string, publicUrl: string, code?: string | null): Promise<void> {
  if (!publicUrl) return;
  const cacheKey = code
    ? deviceCacheKey(apiUrl, code)
    : [...lastManifestByApi.entries()].find(([key, manifest]) => (
        key.startsWith(`${apiUrl}::`) && manifest.assets.some((asset) => asset.url === publicUrl)
      ))?.[0] || apiUrl;
  const quarantined = quarantinedUrlsByApi.get(cacheKey) || new Set<string>();
  quarantined.add(publicUrl);
  quarantinedUrlsByApi.set(cacheKey, quarantined);

  const currentManifest = lastManifestByApi.get(cacheKey);
  const asset = currentManifest?.assets.find((item) => item.url === publicUrl);
  if (currentManifest) persistQuarantine(cacheKey, currentManifest.revision, quarantined);
  const failures: string[] = [];
  try {
    await evictBrowserAsset(apiUrl, publicUrl);
  } catch (error) {
    failures.push(`Cache Storage: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (Capacitor.isNativePlatform() && asset) {
    try {
      await NativeCache.evict({ sha256: asset.sha256 });
    } catch (error) {
      failures.push(`cache nativo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) throw new Error(failures.join('; '));
}

export async function syncTelaoAssetCache(
  apiUrl: string,
  code: string,
): Promise<{ manifest: TelaoAssetManifest; stats: TelaoCacheStats; resolved: Record<string, string> }> {
  const response = await fetch(`${apiUrl}/api/telao/assets/${encodeURIComponent(code)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Manifesto de assets indisponível (HTTP ${response.status}).`);
  const manifest = await response.json() as TelaoAssetManifest;
  const cacheKey = deviceCacheKey(apiUrl, code);
  const previousManifest = lastManifestByApi.get(cacheKey);
  if (previousManifest?.revision !== manifest.revision) {
    quarantinedUrlsByApi.delete(cacheKey);
    clearPersistedQuarantine(cacheKey);
  }
  lastManifestByApi.set(cacheKey, manifest);
  const quarantined = quarantinedUrlsByApi.get(cacheKey)
    || readPersistedQuarantine(cacheKey, manifest.revision);
  quarantinedUrlsByApi.set(cacheKey, quarantined);
  const effectiveManifest = excludeQuarantinedAssets(manifest, quarantined);

  let result: NativeSyncResult;
  if (Capacitor.isNativePlatform()) {
    if (localStorage.getItem(LEGACY_MIGRATION_KEY) !== '1') {
      // Limpa também Cache Storage/SW do WebView; clearCache(true) não cobre
      // consistentemente esse armazenamento em todas as versões Android.
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
      await NativeCache.clearLegacy();
      localStorage.setItem(LEGACY_MIGRATION_KEY, '1');
    }
    result = await NativeCache.sync({ baseUrl: apiUrl, manifest: effectiveManifest });
    result.resolved = Object.fromEntries(Object.entries(result.resolved || {}).map(([url, fileUri]) => (
      [url, Capacitor.convertFileSrc(fileUri)]
    )));
  } else {
    await clearLegacyBrowserCaches();
    result = await syncBrowserCache(apiUrl, effectiveManifest);
  }

  return { manifest, stats: result, resolved: result.resolved };
}

export function resolveTelaoAssetUrl(
  apiUrl: string,
  publicUrl: string | null | undefined,
  resolved: Record<string, string>,
): string {
  if (!publicUrl) return '';
  return resolved[publicUrl] || absoluteAssetUrl(apiUrl, publicUrl);
}
