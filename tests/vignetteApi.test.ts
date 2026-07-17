import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import express, { type RequestHandler } from 'express';
import type { VignetteFolder, VignetteSchedule } from '../src/shared/types';

class TestDatabase {
  private readonly raw = new DatabaseSync(':memory:');

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  prepare(sql: string) {
    return this.raw.prepare(sql);
  }

  transaction<T>(callback: () => T): () => T {
    return () => {
      this.raw.exec('BEGIN');
      try {
        const result = callback();
        this.raw.exec('COMMIT');
        return result;
      } catch (error) {
        this.raw.exec('ROLLBACK');
        throw error;
      }
    };
  }

  close(): void {
    this.raw.close();
  }
}

function createDatabase(): TestDatabase {
  const db = new TestDatabase();  db.exec([
    'PRAGMA foreign_keys = ON;',
    'CREATE TABLE vignette_folders (',
    'id INTEGER PRIMARY KEY AUTOINCREMENT,',
    'name TEXT NOT NULL COLLATE NOCASE UNIQUE,',
    "created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),",
    "updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))",
    ');',
    'CREATE TABLE vignette_files (',
    'id INTEGER PRIMARY KEY AUTOINCREMENT,',
    'folder_id INTEGER NOT NULL REFERENCES vignette_folders(id) ON DELETE CASCADE,',
    'original_name TEXT NOT NULL,',
    'local_path TEXT NOT NULL UNIQUE,',
    "mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',",
    'size_bytes INTEGER NOT NULL,',
    "created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))",
    ');',
    'CREATE TABLE vignette_schedules (',
    'id INTEGER PRIMARY KEY AUTOINCREMENT,',
    'name TEXT NOT NULL,',
    'folder_id INTEGER NOT NULL REFERENCES vignette_folders(id) ON DELETE RESTRICT,',
    'weekdays_mask INTEGER NOT NULL,',
    'start_time TEXT NOT NULL,',
    'end_time TEXT NOT NULL,',
    'interval_minutes INTEGER NOT NULL,',
    'is_active INTEGER NOT NULL DEFAULT 0,',
    'last_triggered_slot TEXT,',
    "created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),",
    "updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))",
    ');',
  ].join('\n'));
  return db;
}
async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

test('API valida autenticação, arquivos, conflitos, deduplicação e exclusões', async () => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chamaai-vignettes-'));
  process.env.CHAMAAI_DATA_DIR = testRoot;
  const db = createDatabase();
  const broadcasts: Array<{ event: string; data: unknown }> = [];
  const { evaluateVignetteSchedules, setupVignetteRoutes } = await import(
    '../server/services/vignette-scheduler.service'
  );

  const app = express();
  app.use(express.json());
  const requireMaster: RequestHandler = (request, response, next) => {
    if (request.header('x-test-master') === 'yes') {
      next();
      return;
    }
    response.status(401).json({ error: 'Master obrigatório.' });
  };
  setupVignetteRoutes(
    app,
    (event, data) => broadcasts.push({ event, data }),
    requireMaster,
    { database: () => db as never },
  );

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const masterHeaders = {
    'Content-Type': 'application/json',
    'x-test-master': 'yes',
  };

  try {
    const unauthorized = await fetch(baseUrl + '/api/media/vignette-folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Encerramento' }),
    });
    assert.equal(unauthorized.status, 401);

    const createdResponse = await fetch(baseUrl + '/api/media/vignette-folders', {
      method: 'POST',
      headers: masterHeaders,
      body: JSON.stringify({ name: 'Encerramento' }),
    });
    assert.equal(createdResponse.status, 201);
    const folder = await readJson<VignetteFolder>(createdResponse);

    const duplicate = await fetch(baseUrl + '/api/media/vignette-folders', {
      method: 'POST',
      headers: masterHeaders,
      body: JSON.stringify({ name: 'encerramento' }),
    });
    assert.equal(duplicate.status, 409);

    const invalidForm = new FormData();
    invalidForm.append('files', new Blob(
      [Buffer.from('arquivo inválido')],
      { type: 'audio/mpeg' },
    ), 'invalido.mp3');
    const invalidUpload = await fetch(
      baseUrl + '/api/media/vignette-folders/' + folder.id + '/files',
      {
        method: 'POST',
        headers: { 'x-test-master': 'yes' },
        body: invalidForm,
      },
    );
    assert.equal(invalidUpload.status, 400);
    assert.match((await readJson<{ error: string }>(invalidUpload)).error, /assinatura/i);

    const validForm = new FormData();
    validForm.append('files', new Blob(
      [Buffer.from('ID3valid-mp3')],
      { type: 'audio/mpeg' },
    ), 'encerramento.mp3');
    const validUpload = await fetch(
      baseUrl + '/api/media/vignette-folders/' + folder.id + '/files',
      {
        method: 'POST',
        headers: { 'x-test-master': 'yes' },
        body: validForm,
      },
    );
    assert.equal(validUpload.status, 201);
    const folderWithFile = await readJson<VignetteFolder>(validUpload);
    assert.equal(folderWithFile.files.length, 1);

    const scheduleBody = {
      name: 'Encerramento recorrente',
      folder_id: folder.id,
      weekdays: [1],
      start_time: '17:20',
      end_time: '18:00',
      interval_minutes: 5,
      is_active: true,
    };
    const scheduleResponse = await fetch(baseUrl + '/api/media/vignette-schedules', {
      method: 'POST',
      headers: masterHeaders,
      body: JSON.stringify(scheduleBody),
    });
    assert.equal(scheduleResponse.status, 201);
    const primary = await readJson<VignetteSchedule>(scheduleResponse);

    const conflictResponse = await fetch(baseUrl + '/api/media/vignette-schedules', {
      method: 'POST',
      headers: masterHeaders,
      body: JSON.stringify({
        ...scheduleBody,
        name: 'Propaganda conflitante',
        start_time: '17:25',
        interval_minutes: 10,
      }),
    });
    assert.equal(conflictResponse.status, 409);
    const conflict = await readJson<{
      conflict: { schedule_name: string; weekday: number; time: string };
    }>(conflictResponse);
    assert.deepEqual(conflict.conflict, {
      schedule_name: primary.name,
      weekday: 1,
      time: '17:25',
      schedule_id: primary.id,
      minute: 1045,
    });

    const alternateResponse = await fetch(baseUrl + '/api/media/vignette-schedules', {
      method: 'POST',
      headers: masterHeaders,
      body: JSON.stringify({ ...scheduleBody, name: 'Terça-feira', weekdays: [2] }),
    });
    assert.equal(alternateResponse.status, 201);
    const alternate = await readJson<VignetteSchedule>(alternateResponse);

    const protectedFileDelete = await fetch(
      baseUrl + '/api/media/vignette-files/' + folderWithFile.files[0].id,
      { method: 'DELETE', headers: { 'x-test-master': 'yes' } },
    );
    assert.equal(protectedFileDelete.status, 409);

    const protectedFolderDelete = await fetch(
      baseUrl + '/api/media/vignette-folders/' + folder.id,
      { method: 'DELETE', headers: { 'x-test-master': 'yes' } },
    );
    assert.equal(protectedFolderDelete.status, 409);

    const emptyFolderResponse = await fetch(baseUrl + '/api/media/vignette-folders', {
      method: 'POST',
      headers: masterHeaders,
      body: JSON.stringify({ name: 'Pasta vazia' }),
    });
    const emptyFolder = await readJson<VignetteFolder>(emptyFolderResponse);
    const emptyActivation = await fetch(baseUrl + '/api/media/vignette-schedules', {
      method: 'POST',
      headers: masterHeaders,
      body: JSON.stringify({ ...scheduleBody, name: 'Sem arquivo', folder_id: emptyFolder.id }),
    });
    assert.equal(emptyActivation.status, 409);
    assert.match((await readJson<{ error: string }>(emptyActivation)).error, /ao menos um MP3/i);

    const mondaySlot = new Date(2026, 6, 20, 17, 20, 15);
    const first = evaluateVignetteSchedules(
      (event, data) => broadcasts.push({ event, data }),
      mondaySlot,
      db as never,
    );
    const repeated = evaluateVignetteSchedules(
      (event, data) => broadcasts.push({ event, data }),
      mondaySlot,
      db as never,
    );
    assert.equal(first.length, 1);
    assert.equal(repeated.length, 0);
    assert.equal(first[0].file_id, folderWithFile.files[0].id);
    assert.equal(first[0].scheduled_for, '2026-07-20T17:20');

    const editAfterTrigger = await fetch(
      baseUrl + '/api/media/vignette-schedules/' + primary.id,
      {
        method: 'PUT',
        headers: masterHeaders,
        body: JSON.stringify({ ...scheduleBody, name: 'Encerramento renomeado' }),
      },
    );
    assert.equal(editAfterTrigger.status, 200);
    const afterEdit = evaluateVignetteSchedules(
      (event, data) => broadcasts.push({ event, data }),
      mondaySlot,
      db as never,
    );
    assert.equal(afterEdit.length, 0);

    for (const item of [primary, alternate]) {
      const deletion = await fetch(
        baseUrl + '/api/media/vignette-schedules/' + item.id,
        { method: 'DELETE', headers: { 'x-test-master': 'yes' } },
      );
      assert.equal(deletion.status, 200);
    }

    const fileDeletion = await fetch(
      baseUrl + '/api/media/vignette-files/' + folderWithFile.files[0].id,
      { method: 'DELETE', headers: { 'x-test-master': 'yes' } },
    );
    assert.equal(fileDeletion.status, 200);

    const folderDeletion = await fetch(
      baseUrl + '/api/media/vignette-folders/' + folder.id,
      { method: 'DELETE', headers: { 'x-test-master': 'yes' } },
    );
    assert.equal(folderDeletion.status, 200);

    const remaining = await readJson<VignetteFolder[]>(
      await fetch(baseUrl + '/api/media/vignette-folders'),
    );
    assert.deepEqual(remaining.map((item) => item.name), ['Pasta vazia']);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    db.close();
    fs.rmSync(testRoot, { recursive: true, force: true });
    delete process.env.CHAMAAI_DATA_DIR;
  }
});
