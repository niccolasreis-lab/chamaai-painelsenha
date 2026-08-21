import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  excludeQuarantinedAssets,
  quarantineTelaoAsset,
  syncTelaoAssetCache,
  type TelaoAssetManifest,
} from '../src/telao/telaoAssetCache';

const smartServerSource = readFileSync(new URL('../server/media-indoor.ts', import.meta.url), 'utf8');
const legacyServerSource = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
const manifestSource = readFileSync(new URL('../server/telao-assets.ts', import.meta.url), 'utf8');
const browserCacheSource = readFileSync(new URL('../src/telao/telaoAssetCache.ts', import.meta.url), 'utf8');
const cacheHookSource = readFileSync(new URL('../src/telao/useTelaoAssetCache.ts', import.meta.url), 'utf8');
const nativeCacheSource = readFileSync(
  new URL('../android/app/src/capacitorCommon/java/com/chamaai/app/TelaoCachePlugin.java', import.meta.url),
  'utf8',
);

function manifest(): TelaoAssetManifest {
  return {
    revision: 'r1',
    maxCacheBytes: 256 * 1024 * 1024,
    ttsRevision: 'tts1',
    assets: [
      { id: 'video:1', kind: 'video', url: '/uploads/a.mp4', version: 'a1', sizeBytes: 10, sha256: 'a'.repeat(64), priority: 100 },
      { id: 'video:2', kind: 'video', url: '/uploads/b.mp4', version: 'b1', sizeBytes: 20, sha256: 'b'.repeat(64), priority: 90 },
    ],
  };
}

test('quarentena remove somente o asset quebrado do manifesto local efetivo', () => {
  const original = manifest();
  const effective = excludeQuarantinedAssets(original, new Set(['/uploads/a.mp4']));
  assert.deepEqual(effective.assets.map((asset) => asset.url), ['/uploads/b.mp4']);
  assert.equal(original.assets.length, 2, 'o manifesto recebido do servidor não deve ser mutado');
});

test('exclusão administrativa verifica referências e propaga atualização', () => {
  assert.match(smartServerSource, /app\.delete\('\/api\/media\/items\/:id', requireMaster/);
  for (const table of ['media_items', 'configuracoes', 'vignette_files', 'midias']) {
    assert.match(smartServerSource, new RegExp(table));
  }
  assert.match(smartServerSource, /broadcastEvent\('MEDIA_ITEMS_UPDATED', \{ action: 'delete'/);

  assert.match(legacyServerSource, /app\.delete\('\/api\/midias\/:id', requireMaster/);
  assert.match(legacyServerSource, /deleted_at = datetime/);
  assert.match(legacyServerSource, /sharedReference/);
  assert.match(legacyServerSource, /broadcastEvent\('MIDIAS_ATUALIZADAS', \{ action: 'delete'/);
});

test('manifesto seleciona apenas registros ativos e não excluídos', () => {
  assert.match(manifestSource, /midias[\s\S]*?ativo = 1 AND deleted_at IS NULL/);
  assert.match(manifestSource, /media_items[\s\S]*?is_active = 1/);
});

test('browser, memória JS e cache Android removem vestígios locais', () => {
  assert.match(browserCacheSource, /evictBrowserAsset/);
  assert.match(browserCacheSource, /cache\.delete\(request\)/);
  assert.match(cacheHookSource, /delete next\[url\]/);
  assert.match(nativeCacheSource, /public void evict\(PluginCall call\)/);
  assert.match(nativeCacheSource, /file\.getName\(\)\.startsWith\(normalizedHash\)/);
  assert.match(nativeCacheSource, /deleteStaleFiles\(root, desiredFiles\)/);
});

test('versão quebrada permanece fora do cache até a revisão do manifesto mudar', async () => {
  const apiUrl = 'http://quarantine.test:3001';
  const publicUrl = '/uploads/broken.mp4';
  const payload = new Uint8Array([7, 8, 9]);
  const sha256 = createHash('sha256').update(payload).digest('hex');
  const currentManifest: TelaoAssetManifest = {
    revision: 'same-revision',
    maxCacheBytes: 1024,
    ttsRevision: 'tts',
    assets: [{ id: 'broken', kind: 'video', url: publicUrl, version: 'v1', sizeBytes: payload.length, sha256, priority: 1 }],
  };
  const bucket = new Map<string, Response>();
  const values = new Map<string, string>([['telao_cache_migration_v1', '1']]);
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ['window', 'caches', 'localStorage', 'fetch']) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }

  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis });
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      keys: async () => ['chamaai-telao-assets-v1'],
      delete: async () => true,
      open: async () => ({
        match: async (request: string | Request) => bucket.get(typeof request === 'string' ? request : request.url),
        put: async (request: string | Request, response: Response) => {
          bucket.set(typeof request === 'string' ? request : request.url, response);
        },
        delete: async (request: string | Request) => bucket.delete(typeof request === 'string' ? request : request.url),
        keys: async () => [...bucket.keys()].map((url) => new Request(url)),
      }),
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      return url.includes('/api/telao/assets/')
        ? new Response(JSON.stringify(currentManifest), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response(payload, { status: 200, headers: { 'Content-Type': 'video/mp4' } });
    },
  });

  try {
    await syncTelaoAssetCache(apiUrl, 'TESTE');
    assert.equal(bucket.size, 1);

    await quarantineTelaoAsset(apiUrl, publicUrl);
    assert.equal(bucket.size, 0);
    assert.match(values.get(`chamaai:telao:quarantine:${encodeURIComponent(apiUrl)}`) || '', /broken\.mp4/);

    const sameRevision = await syncTelaoAssetCache(apiUrl, 'TESTE');
    assert.equal(sameRevision.stats.entries, 0);
    assert.equal(bucket.size, 0);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('unlink gerenciado atua somente em diretório temporário confinado', async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chamaai-media-delete-'));
  const previousDataDir = process.env.CHAMAAI_DATA_DIR;
  process.env.CHAMAAI_DATA_DIR = temporaryRoot;

  try {
    const storage = await import(`../server/storage.ts?deletion-test=${Date.now()}`);
    fs.mkdirSync(storage.UPLOADS_DIR, { recursive: true });
    const temporaryVideo = path.join(storage.UPLOADS_DIR, 'temporary-video.mp4');
    fs.writeFileSync(temporaryVideo, Buffer.from('temporary-test-video'));

    assert.equal(storage.unlinkManagedAsset('/uploads/temporary-video.mp4'), true);
    assert.equal(fs.existsSync(temporaryVideo), false);
    assert.equal(storage.unlinkManagedAsset('/uploads/../outside.mp4'), false);
  } finally {
    if (previousDataDir === undefined) delete process.env.CHAMAAI_DATA_DIR;
    else process.env.CHAMAAI_DATA_DIR = previousDataDir;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
