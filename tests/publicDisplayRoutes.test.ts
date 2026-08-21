import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicDisplayReadRequest } from '../server/public-display-routes';

test('libera apenas as leituras necessárias ao telão remoto', () => {
  const publicReads = [
    '/api/configuracoes',
    '/api/midias',
    '/api/telao/profile/ABC123',
    '/api/telao/assets/ABC123',
    '/api/telao/tema-atual',
    '/api/toledo/produtos',
    '/api/categorias',
    '/api/media/settings',
    '/api/media/active-playlist',
    '/api/media/weather',
  ];

  for (const route of publicReads) {
    assert.equal(isPublicDisplayReadRequest('GET', route), true, route);
  }
});

test('mantém escritas e rotas administrativas protegidas', () => {
  assert.equal(isPublicDisplayReadRequest('POST', '/api/midias'), false);
  assert.equal(isPublicDisplayReadRequest('PUT', '/api/media/settings'), false);
  assert.equal(isPublicDisplayReadRequest('POST', '/api/telao/assets/ABC123'), false);
  assert.equal(isPublicDisplayReadRequest('GET', '/api/media/items'), false);
  assert.equal(isPublicDisplayReadRequest('GET', '/api/categorias/export'), false);
  assert.equal(isPublicDisplayReadRequest('GET', '/api/admin/status'), false);
});
