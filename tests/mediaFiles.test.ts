import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import {
  getUploadsDirectory,
  planMediaFileReconciliation,
  resolveUploadPath,
} from '../server/media-files';

test('resolve /uploads a partir da pasta persistente, independentemente do cwd', () => {
  const uploads = getUploadsDirectory('C:\\ChamaAi');
  assert.equal(
    resolveUploadPath('/uploads/video.mp4', uploads),
    path.resolve('C:\\ChamaAi', 'uploads', 'video.mp4'),
  );
});

test('rejeita traversal e caminhos que não pertencem a /uploads', () => {
  const uploads = getUploadsDirectory('C:\\ChamaAi');
  assert.equal(resolveUploadPath('/uploads/../../database.sqlite', uploads), null);
  assert.equal(resolveUploadPath('/themes/banner.png', uploads), null);
  assert.equal(resolveUploadPath('/uploads/', uploads), null);
});

test('recupera mídia missing quando o arquivo existe e marca ausente quando não existe', () => {
  const uploads = getUploadsDirectory('C:\\ChamaAi');
  const existingPath = resolveUploadPath('/uploads/existente.mp4', uploads);
  assert.ok(existingPath);

  const changes = planMediaFileReconciliation([
    { id: 1, caminho: '/uploads/existente.mp4', file_status: 'missing' },
    { id: 2, caminho: '/uploads/ausente.mp4', file_status: 'active' },
    { id: 3, caminho: '/uploads/estavel.mp4', file_status: 'active' },
  ], uploads, filePath => filePath === existingPath || filePath.endsWith('estavel.mp4'));

  assert.deepEqual(changes, [
    { id: 1, status: 'active' },
    { id: 2, status: 'missing' },
  ]);
});
