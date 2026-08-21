import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  hasToledoSourceChanged,
  type ToledoSourceFile,
} from '../server/toledo-file-discovery';

const watcherSource = readFileSync(
  new URL('../server/toledo-watcher.ts', import.meta.url),
  'utf8',
);
const telaoSource = readFileSync(
  new URL('../src/telao/MediaIndoor.tsx', import.meta.url),
  'utf8',
);
const serverSource = readFileSync(
  new URL('../server/index.ts', import.meta.url),
  'utf8',
);

function section(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `início de seção ausente: ${startMarker}`);
  assert.ok(end > start, `fim de seção ausente: ${endMarker}`);
  return source.slice(start, end);
}

const baseSource: ToledoSourceFile = {
  path: 'C:\\precos\\ITENSMGV.TXT',
  kind: 'fixed_txt',
  mtimeMs: 1_000,
  size: 4_096,
};

test('fonte inalterada não agenda reprocessamento e cada metadado relevante detecta mudança', () => {
  assert.equal(hasToledoSourceChanged(baseSource, { ...baseSource }), false);
  assert.equal(hasToledoSourceChanged(null, baseSource), true);
  assert.equal(hasToledoSourceChanged(baseSource, null), false);
  assert.equal(hasToledoSourceChanged(baseSource, { ...baseSource, path: 'C:\\precos\\ITENSMGV-2.TXT' }), true);
  assert.equal(hasToledoSourceChanged(baseSource, { ...baseSource, mtimeMs: 1_001 }), true);
  assert.equal(hasToledoSourceChanged(baseSource, { ...baseSource, size: 4_097 }), true);
});

test('uma alteração detectada gera exatamente um processamento depois do debounce', () => {
  const debounce = section(watcherSource, 'function onFileChanged', '/**');
  const processCalls = debounce.match(/processFile\(filePath\)/g) ?? [];

  assert.equal(processCalls.length, 1, 'uma única mudança não pode importar e transmitir a mesma tabela duas vezes');
  assert.match(debounce, /clearTimeout\(debounceTimer\)/);
  assert.match(debounce, /DEBOUNCE_MS/);
});

test('servidor persiste inclusões, alterações e exclusões antes de concluir a importação', () => {
  const persistence = section(watcherSource, 'function processToledoItems', '// ── Watcher Engine');

  assert.match(persistence, /db\.transaction/);
  assert.match(persistence, /INSERT OR IGNORE INTO toledo_produtos/);
  assert.match(persistence, /UPDATE toledo_produtos[\s\S]*?SET preco = \?, descricao = \?, categoria = \?/);
  assert.match(persistence, /DELETE FROM toledo_produtos WHERE plu = \?/);
  assert.match(persistence, /syncToCatalogoProduto\(db, item\)/);
  assert.match(persistence, /transaction\(items\);[\s\S]*?return updatedCount/);
});

test('evento de preço só é emitido após mudança persistida e informa a quantidade atualizada', () => {
  const processing = section(watcherSource, 'async function processFile', 'function onFileChanged');
  const persisted = processing.indexOf('processToledoItems(items)');
  const changedGuard = processing.indexOf('if (shouldPublishToledoUpdate(updatedCount))');
  const broadcast = processing.indexOf("broadcastEvent('TOLEDO_PRECOS_ATUALIZADOS'");

  assert.ok(persisted >= 0 && changedGuard > persisted && broadcast > changedGuard);
  assert.match(processing.slice(changedGuard, broadcast + 300), /atualizados:\s*updatedCount/);
  assert.match(processing.slice(changedGuard, broadcast + 300), /timestamp:/);
});

test('telão reage ao evento buscando novamente produtos, categorias e tema', () => {
  const refresh = section(telaoSource, 'const refreshEncarteData', 'const fetchSmartMediaSettings');
  assert.match(refresh, /\/api\/toledo\/produtos/);
  assert.match(refresh, /\/api\/categorias/);
  assert.match(refresh, /\/api\/telao\/tema-atual/);
  assert.match(refresh, /Promise\.all/);
  assert.match(refresh, /setEncarteCache/);

  const events = section(telaoSource, 'const handleConfigAtualizada', "window.addEventListener('NOVA_SENHA_CHAMADA'");
  assert.match(events, /handleToledoPrecosAtualizados/);
  assert.match(events, /refreshEncarteData\('SSE: TOLEDO_PRECOS_ATUALIZADOS'\)/);
  assert.match(telaoSource, /addEventListener\('TOLEDO_PRECOS_ATUALIZADOS', handleToledoPrecosAtualizados\)/);
  assert.match(telaoSource, /removeEventListener\('TOLEDO_PRECOS_ATUALIZADOS', handleToledoPrecosAtualizados\)/);
});

test('broadcast do servidor entrega o evento aos canais SSE vinculados dos telões', () => {
  const broadcast = section(serverSource, 'export function broadcastEvent', 'let udpSocket');

  assert.match(broadcast, /JSON\.stringify\(\{ event, data \}\)/);
  assert.match(broadcast, /Object\.keys\(telaoSseClients\)/);
  assert.match(broadcast, /telaoSseClients\[code\]\.forEach/);
  assert.match(broadcast, /client\.write\(payload\)/);
});

test('revalidação periódica recupera evento perdido a cada 60 segundos', () => {
  const periodic = section(
    telaoSource,
    '// O SSE entrega atualizações imediatas',
    '// Watch unified SSE events',
  );

  assert.match(periodic, /setInterval/);
  assert.match(periodic, /refreshEncarteData\('Revalidação periódica de 60s'\)/);
  assert.match(periodic, /60_000/);
  assert.match(periodic, /clearInterval\(contentRevalidationTimer\)/);
});
