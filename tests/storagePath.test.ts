import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  TTS_DIR,
  UPLOADS_DIR,
  resolveManagedAssetPath,
} from '../server/storage';

test('resolve assets públicos exclusivamente dentro do diretório gerenciado', () => {
  assert.equal(
    resolveManagedAssetPath('/uploads/media/video.mp4'),
    path.resolve(UPLOADS_DIR, 'media', 'video.mp4'),
  );
  assert.equal(
    resolveManagedAssetPath('/tts/tipo1/Senha_7_1.mp3?v=revision-2'),
    path.resolve(TTS_DIR, 'tipo1', 'Senha_7_1.mp3'),
  );
});

test('rejeita caminhos não gerenciados e tentativas de escapar de uploads', () => {
  for (const unsafe of [
    '/etc/passwd',
    '/uploads/../segredo.txt',
    '/uploads/%2e%2e/segredo.txt',
    '/tts/%2e%2e/%2e%2e/segredo.txt',
    'http://servidor:3001/uploads/logo%20cliente.png?asset_v=abc',
    '//servidor/uploads/logo.png',
    '',
  ]) {
    assert.equal(resolveManagedAssetPath(unsafe), null, unsafe);
  }
});

test('não confunde prefixos semelhantes com as rotas públicas gerenciadas', () => {
  for (const unrelated of [
    '/upload/arquivo.mp4',
    '/uploads-malicioso/arquivo.mp4',
    '/tts-malicioso/audio.mp3',
    '/api/uploads/arquivo.mp4',
  ]) {
    assert.equal(resolveManagedAssetPath(unrelated), null, unrelated);
  }
});
