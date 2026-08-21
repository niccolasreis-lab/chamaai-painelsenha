import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  findToledoSourceFile,
  hasToledoSourceChanged,
  type ToledoSourceFile,
} from '../server/toledo-file-discovery';

function withTempDirectory(run: (directory: string) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chamaai-toledo-'));
  try { run(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('prioriza ITENSMGV.TXT sobre exportações versionadas', () => withTempDirectory(directory => {
  const versioned = path.join(directory, 'itensmgv-2026-07-22-10-00-00.txt');
  const fixed = path.join(directory, 'ITENSMGV.TXT');
  fs.writeFileSync(versioned, 'versionado');
  fs.writeFileSync(fixed, 'fixo');
  fs.utimesSync(versioned, new Date('2026-07-22T10:00:00Z'), new Date('2026-07-22T10:00:00Z'));
  fs.utimesSync(fixed, new Date('2026-07-22T11:00:00Z'), new Date('2026-07-22T11:00:00Z'));
  const source = findToledoSourceFile(directory, 'ITENSMGV.TXT', 'ITENSMGV.BAK');
  assert.equal(source?.kind, 'fixed_txt');
  assert.equal(path.basename(source!.path), 'ITENSMGV.TXT');
}));

test('seleciona exportação versionada quando ela é mais recente que o arquivo fixo', () => withTempDirectory(directory => {
  const fixed = path.join(directory, 'ITENSMGV.TXT');
  const versioned = path.join(directory, 'itensmgv-2026-07-22-11-01-01.txt');
  fs.writeFileSync(fixed, 'fixo antigo');
  fs.writeFileSync(versioned, 'versionado novo');
  fs.utimesSync(fixed, new Date('2026-07-21T10:00:00Z'), new Date('2026-07-21T10:00:00Z'));
  fs.utimesSync(versioned, new Date('2026-07-22T11:01:01Z'), new Date('2026-07-22T11:01:01Z'));
  const source = findToledoSourceFile(directory, 'ITENSMGV.TXT', 'ITENSMGV.BAK');
  assert.equal(source?.kind, 'versioned_txt');
  assert.equal(source?.path, versioned);
}));

test('seleciona a exportação Toledo versionada mais recente quando não há arquivo fixo', () => withTempDirectory(directory => {
  const older = path.join(directory, 'itensmgv-2026-07-21-14-05-36.txt');
  const newer = path.join(directory, 'ITENSMGV-2026-07-22-09-59-52.TXT');
  fs.writeFileSync(older, 'anterior'); fs.writeFileSync(newer, 'atual');
  fs.utimesSync(older, new Date('2026-07-21T14:05:36Z'), new Date('2026-07-21T14:05:36Z'));
  fs.utimesSync(newer, new Date('2026-07-22T09:59:52Z'), new Date('2026-07-22T09:59:52Z'));
  const source = findToledoSourceFile(directory, 'ITENSMGV.TXT', 'ITENSMGV.BAK');
  assert.equal(source?.kind, 'versioned_txt');
  assert.equal(source?.path, newer);
}));

test('não aceita arquivos txt arbitrários como exportação Toledo', () => withTempDirectory(directory => {
  fs.writeFileSync(path.join(directory, 'produtos.txt'), 'não importar');
  assert.equal(findToledoSourceFile(directory, 'ITENSMGV.TXT', 'ITENSMGV.BAK'), null);
}));

test('detecta troca de arquivo, mtime ou tamanho e ignora fonte inalterada', () => {
  const base: ToledoSourceFile = {
    path: 'C:\\Toledo\\ITENSMGV.TXT',
    kind: 'fixed_txt',
    mtimeMs: 100,
    size: 1000,
  };
  assert.equal(hasToledoSourceChanged(base, { ...base }), false);
  assert.equal(hasToledoSourceChanged(base, { ...base, path: 'C:\\Toledo\\itensmgv-2026.txt' }), true);
  assert.equal(hasToledoSourceChanged(base, { ...base, mtimeMs: 101 }), true);
  assert.equal(hasToledoSourceChanged(base, { ...base, size: 1001 }), true);
});
