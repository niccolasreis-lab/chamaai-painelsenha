import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { syncTelaoAssetCache, type TelaoAssetManifest } from '../src/telao/telaoAssetCache';
import { nextPlayableIndex } from '../src/telao/mediaPlayback';

const serverSource = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
const manifestSource = readFileSync(new URL('../server/telao-assets.ts', import.meta.url), 'utf8');
const telaoSource = readFileSync(new URL('../src/telao/MediaIndoor.tsx', import.meta.url), 'utf8');
const nativeCacheSource = readFileSync(
  new URL('../android/app/src/capacitorCommon/java/com/chamaai/app/TelaoCachePlugin.java', import.meta.url),
  'utf8',
);

function section(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `seção ausente: ${startMarker}`);
  return source.slice(start, end);
}

test('playlist e manifesto omitem vídeo excluído ou indisponível', () => {
  const playlistRoute = section(serverSource, "app.get('/api/midias'", "app.post('/api/midias'");
  assert.match(playlistRoute, /deleted_at IS NULL/);
  assert.match(playlistRoute, /file_status != 'missing'/);

  assert.match(manifestSource, /WHERE ativo = 1 AND deleted_at IS NULL/);
  assert.match(manifestSource, /file_status[\s\S]*?NOT IN \('missing', 'failed'\)/);
  assert.match(manifestSource, /COALESCE\(status, 'ativo'\) = 'ativo'/);
});

test('vídeo quebrado sai da rotação local e o próximo válido toca sem loop instável', () => {
  const playlist = [{ id: 'quebrado' }, { id: 'seguinte' }, { id: 'terceiro' }];
  assert.equal(nextPlayableIndex(playlist, 0, new Set(['quebrado'])), 1);
  assert.equal(nextPlayableIndex(playlist, 1, new Set(['quebrado', 'seguinte'])), 2);
  assert.equal(
    nextPlayableIndex(playlist, 1, new Set(playlist.map(item => item.id))),
    1,
    'all-failed deve manter o índice para renderizar fallback sem hot loop',
  );

  const failure = section(telaoSource, 'const handleNativeMediaError', 'const scheduleNativeVideoStallRecovery');
  assert.match(failure, /nextFailures\.add\(mediaId\)/);
  assert.match(failure, /nextPlayableIndex\(midias, current, nextFailures\)/);
});

test('sincronização browser remove do cache uma URL ausente no manifesto seguinte', async () => {
  const staleUrl = 'http://server.local:3001/uploads/excluido.mp4?asset_v=antiga';
  const bucket = new Map<string, Response>([[staleUrl, new Response(new Uint8Array([1, 2, 3]))]]);
  const cache = {
    match: async (request: string | Request) => bucket.get(typeof request === 'string' ? request : request.url),
    put: async (request: string | Request, response: Response) => {
      bucket.set(typeof request === 'string' ? request : request.url, response);
    },
    delete: async (request: string | Request) => bucket.delete(typeof request === 'string' ? request : request.url),
    keys: async () => [...bucket.keys()].map(url => new Request(url)),
  };
  const cacheStorage = {
    open: async () => cache,
    keys: async () => ['chamaai-telao-assets-v1'],
    delete: async () => false,
  };
  const values = new Map([['telao_cache_migration_v1', '1']]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const manifest: TelaoAssetManifest = {
    revision: 'sem-video',
    maxCacheBytes: 256 * 1024 * 1024,
    ttsRevision: 'r1',
    assets: [],
  };

  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ['window', 'caches', 'localStorage', 'fetch']) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis });
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: cacheStorage });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => new Response(JSON.stringify(manifest), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  });

  try {
    const result = await syncTelaoAssetCache('http://server.local:3001', 'ABC123');
    assert.equal(bucket.has(staleUrl), false);
    assert.equal(result.stats.entries, 0);
    assert.deepEqual(result.resolved, {});
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('cache nativo também reconcilia e remove arquivos fora do manifesto', () => {
  const sync = section(nativeCacheSource, 'private JSObject syncInternal', 'private List<Asset> parseAssets');
  assert.match(sync, /Set<String> desiredFiles/);
  assert.match(sync, /deleteStaleFiles\(root, desiredFiles\)/);

  const cleanup = section(nativeCacheSource, 'private static void deleteStaleFiles', 'private static void removePartialDownloads');
  assert.match(cleanup, /!desiredFiles\.contains\(file\.getName\(\)\)/);
  assert.match(cleanup, /deleteRecursively\(file\)/);
});

test('remoção da mídia ativa interrompe o elemento e mantém índice válido', () => {
  const fetchMidias = section(telaoSource, 'const fetchMidias', 'const fetchAguardando');
  assert.match(fetchMidias, /prevIds !== newIds/);
  assert.match(fetchMidias, /setActiveMidiaIndex\(idx =>/);
  assert.match(fetchMidias, /idx >= midiasAtivas\.length \? 0 : idx/);
  assert.match(fetchMidias, /videoRef\.current\.pause\(\)/);
  assert.match(fetchMidias, /removeAttribute\('src'\)/);
  assert.match(fetchMidias, /videoRef\.current\.load\(\)/);

  assert.match(telaoSource, /handleMidiasAtualizadas[\s\S]*?fetchMidias\(\)/);
});

test('referência compartilhada impede exclusão física do arquivo', () => {
  const deletion = section(serverSource, "app.delete('/api/midias/:id'", "app.put('/api/midias/:id'");
  assert.match(deletion, /EXISTS \(SELECT 1 FROM midias WHERE caminho = \? AND deleted_at IS NULL\)/);
  assert.match(deletion, /EXISTS \(SELECT 1 FROM media_items WHERE local_path = \?\)/);
  assert.match(deletion, /EXISTS \(SELECT 1 FROM configuracoes WHERE valor = \?\)/);
  assert.match(deletion, /EXISTS \(SELECT 1 FROM vignette_files WHERE local_path = \?\)/);
  assert.match(deletion, /if \(filePath && !sharedReference\) unlinkManagedAsset/);

  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE refs (source TEXT NOT NULL, asset_path TEXT NOT NULL, active INTEGER NOT NULL);
    INSERT INTO refs VALUES ('legacy', '/uploads/shared.mp4', 0);
    INSERT INTO refs VALUES ('smart', '/uploads/shared.mp4', 1);
  `);
  const shared = db.prepare(
    'SELECT 1 AS found FROM refs WHERE asset_path = ? AND active = 1 LIMIT 1',
  ).get('/uploads/shared.mp4');
  const exclusive = db.prepare(
    'SELECT 1 AS found FROM refs WHERE asset_path = ? AND active = 1 LIMIT 1',
  ).get('/uploads/exclusive.mp4');
  db.close();

  assert.ok(shared, 'uma referência ativa deve preservar o arquivo compartilhado');
  assert.equal(exclusive, undefined, 'arquivo exclusivo pode ser removido após excluir seu registro');
});
