import assert from 'node:assert/strict';
import test from 'node:test';
import { readMediaApiError, validateMediaUpload } from '../src/admin/mediaUpload';

test('valida extensão, MIME, arquivo vazio e limite antes do upload', () => {
  const file = (name: string, type: string, size: number) => ({ name, type, size }) as File;
  assert.equal(validateMediaUpload(file('foto.png', 'image/png', 20), 'image'), null);
  assert.equal(validateMediaUpload(file('filme.mp4', 'video/mp4', 20), 'video'), null);
  assert.match(validateMediaUpload(file('filme.exe', 'video/mp4', 20), 'video') || '', /MP4/);
  assert.match(validateMediaUpload(file('foto.png', 'image/png', 0), 'image') || '', /vazio/);
});

test('preserva a mensagem JSON do servidor e inclui status no fallback', async () => {
  const explicit = new Response(JSON.stringify({ error: 'Sessão expirada.' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(await readMediaApiError(explicit, 'Falha'), 'Sessão expirada.');

  const opaque = new Response('<html>erro</html>', { status: 500, headers: { 'content-type': 'text/html' } });
  assert.equal(await readMediaApiError(opaque, 'Falha ao enviar'), 'Falha ao enviar (HTTP 500).');
});
