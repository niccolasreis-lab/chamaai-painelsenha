import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findToledoSourceFile } from '../server/toledo-file-discovery';

function withTempDirectory(run: (directory: string) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chamaai-toledo-'));
  try { run(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('prioriza ITENSMGV.TXT sobre exportações versionadas', () => withTempDirectory(directory => {
  fs.writeFileSync(path.join(directory, 'itensmgv-2026-07-22-10-00-00.txt'), 'versionado');
  fs.writeFileSync(path.join(directory, 'ITENSMGV.TXT'), 'fixo');
  const source = findToledoSourceFile(directory, 'ITENSMGV.TXT', 'ITENSMGV.BAK');
  assert.equal(source?.kind, 'fixed_txt');
  assert.equal(path.basename(source!.path), 'ITENSMGV.TXT');
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
