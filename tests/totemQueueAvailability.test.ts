import assert from 'node:assert/strict';
import test from 'node:test';
import { getTotemQueueAvailability } from '../src/totem/queueAvailability';
import { resolveRequestedQueue } from '../server/ticket-queue-policy';

test('does not render either queue before configuration has loaded', () => {
  assert.deepEqual(getTotemQueueAvailability({}), {
    normal: false,
    preferential: false,
    singleButton: false,
  });
});

test('keeps preferential hidden when persisted value is disabled', () => {
  assert.deepEqual(getTotemQueueAvailability({
    fila_normal_ativa: '1',
    fila_preferencial_ativa: '0',
    ocultar_tipo_senha: '0',
  }), {
    normal: true,
    preferential: false,
    singleButton: false,
  });
});

test('server rejects a preferential ticket when that queue is disabled', () => {
  const values: Record<string, string> = {
    fila_normal_ativa: '1',
    fila_preferencial_ativa: '0',
  };
  const db = {
    prepare: () => ({ get: (key: unknown) => ({ valor: values[String(key)] }) }),
  };

  assert.throws(() => resolveRequestedQueue(db, true), /fila preferencial está desativada/);
  assert.deepEqual(resolveRequestedQueue(db, false), { preferential: false });
});

test('does not interpret arbitrary truthy values as preferential requests', () => {
  const db = {
    prepare: () => ({ get: () => ({ valor: '1' }) }),
  };

  assert.deepEqual(resolveRequestedQueue(db, 'false'), { preferential: false });
});
