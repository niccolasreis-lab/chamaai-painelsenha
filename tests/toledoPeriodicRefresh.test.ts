import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { haveSameEncarteSnapshot, type EncarteDisplaySnapshot } from '../src/telao/displayCache';
import { hasToledoItemChanged, shouldPublishToledoUpdate } from '../server/toledo-update-policy';

const watcherSource = readFileSync(new URL('../server/toledo-watcher.ts', import.meta.url), 'utf8');
const telaoSource = readFileSync(new URL('../src/telao/MediaIndoor.tsx', import.meta.url), 'utf8');

function snapshot(price = 1290): EncarteDisplaySnapshot {
  return {
    produtos: [{ id: 1, plu: '10', descricao: 'QUEIJO', preco: price, categoria: 'Frios', unidade: 'kg' }],
    categorias: [{ id: 2, nome: 'Frios', ativo: 1, ordem: 1, emoji: '🧀' }],
    temaAtivo: { id: 3, nome: 'Padrão' },
  };
}

test('política Toledo diferencia alteração material de carga idêntica', () => {
  const current = { plu: '10', descricao: 'QUEIJO', preco: 1290, categoria: 'Frios', unidade: 'kg' };
  assert.equal(hasToledoItemChanged(current, { ...current }), false);
  assert.equal(hasToledoItemChanged(current, { ...current, preco: 1390 }), true);
  assert.equal(hasToledoItemChanged(current, { ...current, descricao: 'QUEIJO MINAS' }), true);
  assert.equal(hasToledoItemChanged(current, { ...current, categoria: 'Laticínios' }), true);
  assert.equal(hasToledoItemChanged(current, { ...current, unidade: 'un' }), true);
});

test('SSE de preços só deve ser publicado quando banco ou catálogo mudam', () => {
  assert.equal(shouldPublishToledoUpdate(0), false);
  assert.equal(shouldPublishToledoUpdate(-1), false);
  assert.equal(shouldPublishToledoUpdate(1), true);
});

test('snapshot idêntico preserva referências; preço ou tema novo exige atualização', () => {
  const current = snapshot();
  assert.equal(haveSameEncarteSnapshot(current, snapshot()), true);
  assert.equal(haveSameEncarteSnapshot(current, snapshot(1390)), false);
  assert.equal(haveSameEncarteSnapshot(current, { ...snapshot(), temaAtivo: { id: 4 } }), false);
});

test('watcher mantém polling e enfileira revisão recebida durante processamento', () => {
  assert.match(watcherSource, /const POLL_INTERVAL_MS = 5000/);
  assert.match(watcherSource, /hasToledoSourceChanged\(lastSource, source\)/);
  assert.match(watcherSource, /pendingFilePath = filePath/);
  assert.match(watcherSource, /setTimeout\(\(\) => void processFile\(nextFilePath\), 0\)/);
  assert.match(watcherSource, /if \(shouldPublishToledoUpdate\(updatedCount\)\)/);
});

test('telão reconcilia polling idêntico e reage ao SSE sem remount forçado', () => {
  assert.match(telaoSource, /Revalidação periódica de 60s/);
  assert.match(telaoSource, /haveSameEncarteSnapshot\(currentSnapshot, snapshot\)/);
  assert.match(telaoSource, /TOLEDO_PRECOS_ATUALIZADOS/);
  assert.match(telaoSource, /refreshEncarteData\('SSE: TOLEDO_PRECOS_ATUALIZADOS'\)/);
  assert.doesNotMatch(telaoSource, /setEncarteRefreshKey/);
});
