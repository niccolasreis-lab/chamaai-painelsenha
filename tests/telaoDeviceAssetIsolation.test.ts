import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cacheSource = readFileSync(new URL('../src/telao/telaoAssetCache.ts', import.meta.url), 'utf8');
const hookSource = readFileSync(new URL('../src/telao/useTelaoAssetCache.ts', import.meta.url), 'utf8');

test('estado do manifesto e quarentena são separados pelo código do telão', () => {
  assert.match(cacheSource, /function deviceCacheKey\(apiUrl: string, code: string\)/);
  assert.match(cacheSource, /const cacheKey = deviceCacheKey\(apiUrl, code\)/);
  assert.match(cacheSource, /quarantineTelaoAsset\(apiUrl: string, publicUrl: string, code\?/);
  assert.match(hookSource, /quarantineTelaoAsset\(apiUrl, url, code\)/);
});
