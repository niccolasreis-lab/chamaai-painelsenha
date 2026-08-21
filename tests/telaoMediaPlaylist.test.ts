import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  nextPlayableIndex,
  playlistFingerprint,
  shouldLoopVideo,
  VIDEO_STALL_TIMEOUT_MS,
} from '../src/telao/mediaPlayback';

const nativeSource = readFileSync(
  new URL('../src/telao/MediaIndoor.tsx', import.meta.url),
  'utf8',
);
const smartSource = readFileSync(
  new URL('../src/telao/SmartMediaLayer.tsx', import.meta.url),
  'utf8',
);

const playlist = [{ id: 1 }, { id: 2 }, { id: 3 }];

test('playlist avança em ordem e retorna ao primeiro item depois do último', () => {
  const available = new Set<string | number>();
  assert.equal(nextPlayableIndex(playlist, 0, available), 1);
  assert.equal(nextPlayableIndex(playlist, 1, available), 2);
  assert.equal(nextPlayableIndex(playlist, 2, available), 0);
});

test('asset indisponível é pulado sem quebrar o ciclo', () => {
  assert.equal(nextPlayableIndex(playlist, 0, new Set([2])), 2);
  assert.equal(nextPlayableIndex(playlist, 2, new Set([1])), 1);
});

test('quando todos os assets falham o índice fica estável para exibir fallback', () => {
  assert.equal(nextPlayableIndex(playlist, 1, new Set([1, 2, 3])), 1);
  assert.equal(nextPlayableIndex([], 9, new Set()), 0);
});

test('loop no elemento de vídeo só é habilitado para o único conteúdo reproduzível', () => {
  assert.equal(shouldLoopVideo([{ id: 1 }], new Set(), false), true);
  assert.equal(shouldLoopVideo(playlist, new Set([2, 3]), false), true);
  assert.equal(shouldLoopVideo(playlist, new Set(), false), false);
  assert.equal(shouldLoopVideo([{ id: 1 }], new Set(), true), false);
});

test('fingerprint detecta troca real do asset sem reiniciar por polling idêntico', () => {
  const current = [{ id: 1, type: 'video', local_path: '/uploads/a.mp4', duration_seconds: 10 }];
  assert.equal(playlistFingerprint(current), playlistFingerprint([{ ...current[0] }]));
  assert.notEqual(
    playlistFingerprint(current),
    playlistFingerprint([{ ...current[0], local_path: '/uploads/b.mp4' }]),
  );
});

test('players preservam proporção, limites do contêiner e cache resolvido', () => {
  for (const source of [nativeSource, smartSource]) {
    assert.match(source, /object-contain/);
    assert.match(source, /max-w-full/);
    assert.match(source, /max-h-full/);
    assert.match(source, /overflow-hidden/);
    assert.doesNotMatch(source, /<video[\s\S]{0,500}object-fill/);
  }

  assert.match(nativeSource, /src=\{resolveAssetUrl\(activeMidia\.caminho\)\}/);
  assert.match(smartSource, /src=\{resolveMediaUrl\(source\)\}/);
  assert.match(nativeSource, /MEDIA_ITEMS_UPDATED['"], handleSmartMediaUpdated/);
  assert.match(nativeSource, /const handleSmartMediaUpdated = \(\) => \{[\s\S]*?syncAssetCache\(\)/);
});

test('erro, buffering prolongado e autoplay bloqueado possuem recuperação limitada', () => {
  assert.equal(VIDEO_STALL_TIMEOUT_MS, 15_000);
  for (const source of [nativeSource, smartSource]) {
    assert.match(source, /onError=/);
    assert.match(source, /onStalled=/);
    assert.match(source, /onWaiting=/);
    assert.match(source, /onPlaying=/);
  }
  assert.doesNotMatch(nativeSource, /120000/);
});
