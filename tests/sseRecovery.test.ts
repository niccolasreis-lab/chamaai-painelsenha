import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hook = readFileSync(new URL('../src/shared/useSSE.ts', import.meta.url), 'utf8');
const operator = readFileSync(new URL('../src/operador/ControleTouch.tsx', import.meta.url), 'utf8');
const display = readFileSync(new URL('../src/telao/MediaIndoor.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');

test('SSE abandona abertura travada e detecta canal sem heartbeat', () => {
  assert.match(hook, /TIMEOUT_ABERTURA\s*=\s*8000/);
  assert.match(hook, /TIMEOUT_SEM_EVENTOS\s*=\s*45000/);
  assert.match(hook, /statusRef\.current !== 'connecting'/);
  assert.match(hook, /clearTimeout\(openingTimeoutRef\.current\)/);
  assert.match(server, /event:\s*'HEARTBEAT'/);
  assert.match(server, /delete telaoSseClients\[code\]/);
});

test('operador vigia SSE mesmo com REST conectado e sincroniza ao reabrir', () => {
  assert.match(operator, /connectivity === 'connected' && sseStatus === 'open'/);
  assert.match(operator, /if \(sseStatus === 'open'\) void refreshData\(false\)/);
});

test('telão reconcilia fila e chamadas perdidas depois da reconexão', () => {
  const reconnectBlock = display.match(/if \(sseConnected && telaoCode\) \{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(reconnectBlock, /fetchAguardando\(\)/);
  assert.match(reconnectBlock, /fetchRecentCalls\(true\)/);
  assert.match(display, /new CustomEvent\('NOVA_SENHA_CHAMADA', \{ detail: latest \}\)/);
});
