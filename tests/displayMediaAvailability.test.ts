import test from 'node:test';
import assert from 'node:assert/strict';
import { isMediaAvailableForDisplay } from '../src/telao/displayCache';
import type { MediaItem } from '../src/shared/types';

type ExpiringMediaItem = MediaItem & { data_expiracao?: string | null };

function media(overrides: Partial<ExpiringMediaItem> = {}): ExpiringMediaItem {
  return {
    id: 1,
    nome: 'Teste',
    tipo: 'imagem',
    ativo: 1,
    status: 'ativo',
    ...overrides,
  };
}

test('aceita mídia ativa sem expiração ou com expiração futura', () => {
  const now = new Date('2026-07-24T12:00:00');
  assert.equal(isMediaAvailableForDisplay(media(), now), true);
  assert.equal(isMediaAvailableForDisplay(media({ data_expiracao: '2026-07-25' }), now), true);
});

test('rejeita mídia inativa, pausada ou expirada', () => {
  const now = new Date('2026-07-24T12:00:00');
  assert.equal(isMediaAvailableForDisplay(media({ ativo: 0 }), now), false);
  assert.equal(isMediaAvailableForDisplay(media({ status: 'inativo' }), now), false);
  assert.equal(isMediaAvailableForDisplay(media({ data_expiracao: '2026-07-23' }), now), false);
});
