import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicPortalUrl, buildPortalTicketUrl, normalizePortalBaseUrl } from '../electron/services/portal-url';
import { resolvePortalParams } from '../chamacliente/src/services/portalParams';

test('preserva token cloud e usa o parâmetro canônico ticket', () => {
  assert.equal(
    buildPortalTicketUrl('https://cliente.example.com/?token=loja-1&senha_id=antiga', 42),
    'https://cliente.example.com/?token=loja-1&ticket=42',
  );
});

test('mantém compatibilidade com o hash router local', () => {
  assert.equal(
    buildPortalTicketUrl('http://localhost:3001/#/cliente', '7'),
    'http://localhost:3001/#/cliente?ticket=7',
  );
});

test('rejeita URL, ticket ausente e caracteres inválidos', () => {
  assert.throws(() => buildPortalTicketUrl('não é url', 1), /URL/);
  assert.throws(() => buildPortalTicketUrl('https://example.com', ''), /senha/);
  assert.throws(() => buildPortalTicketUrl('https://example.com', '1&admin=true'), /senha/);
});

test('normaliza a URL configurada e remove identificadores de tickets antigos', () => {
  assert.equal(
    normalizePortalBaseUrl('  https://chasmaaicliente.vercel.app?token=loja&senha_id=9  '),
    'https://chasmaaicliente.vercel.app/?token=loja',
  );
  assert.equal(
    normalizePortalBaseUrl('http://localhost:3001/#/cliente?ticket=8&modo=teste'),
    'http://localhost:3001/#/cliente?modo=teste',
  );
  assert.equal(normalizePortalBaseUrl('   '), '');
  assert.throws(() => normalizePortalBaseUrl('chasmaaicliente.vercel.app'), /https:\/\//);
  assert.throws(() => normalizePortalBaseUrl('javascript:alert(1)'), /HTTP/);
});

test('impressão aceita somente URL pública HTTPS', () => {
  assert.doesNotThrow(() => assertPublicPortalUrl('https://cliente.example.com/?token=loja&ticket=1'));
  assert.throws(() => assertPublicPortalUrl('https://cliente.example.com/?ticket=1'), /token/);
  assert.throws(() => assertPublicPortalUrl('http://cliente.example.com/?token=loja&ticket=1'), /HTTPS/);
  assert.throws(() => assertPublicPortalUrl('https://localhost/?token=loja&ticket=1'), /pública/);
  assert.throws(() => assertPublicPortalUrl('https://192.168.1.10/?token=loja&ticket=1'), /pública/);
});

test('ChamaCliente combina query canônica externa com query do HashRouter', () => {
  const params = resolvePortalParams(
    new URLSearchParams('ticket=9'),
    '?token=loja-publica&ticket=7',
  );
  assert.equal(params.get('token'), 'loja-publica');
  assert.equal(params.get('ticket'), '9');
});
