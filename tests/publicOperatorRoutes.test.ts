import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicOperatorRequest } from '../server/public-operator-routes';

test('libera somente o snapshot e as três ações do APK operador', () => {
  assert.equal(isPublicOperatorRequest('GET', '/api/operador/estado'), true);
  assert.equal(isPublicOperatorRequest('POST', '/api/operador/proximo'), true);
  assert.equal(isPublicOperatorRequest('POST', '/api/operador/repetir'), true);
  assert.equal(isPublicOperatorRequest('POST', '/api/operador/devolver'), true);
});

test('mantém métodos, prefixos e rotas administrativas protegidos', () => {
  assert.equal(isPublicOperatorRequest('GET', '/api/operador/proximo'), false);
  assert.equal(isPublicOperatorRequest('POST', '/api/operador/estado'), false);
  assert.equal(isPublicOperatorRequest('POST', '/api/operador/proximo/extra'), false);
  assert.equal(isPublicOperatorRequest('GET', '/api/senhas'), false);
  assert.equal(isPublicOperatorRequest('GET', '/api/admin/status'), false);
});
