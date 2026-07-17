import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { getDb } from '../../electron/services/database';
import {
  findScheduleConflict,
  formatLocalScheduleSlot,
  isScheduleDue,
  maskToWeekdays,
  validateScheduleWindow,
  weekdaysToMask,
} from '../../src/shared/vignetteSchedule';
import type {
  IsoWeekday,
  VignetteFile,
  VignetteFolder,
  VignetteOccurrence,
  VignetteSchedule,
} from '../../src/shared/types';
import {
  hasMp3Signature,
  MAX_VIGNETTE_FILE_SIZE,
  validateMp3Metadata,
} from './vignette-file-validation';

type BroadcastEvent = (event: string, data: unknown) => void;
type VignetteDatabase = ReturnType<typeof getDb>;

export type VignetteRouteOptions = {
  database?: () => VignetteDatabase;
};

type FolderRow = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

type FileRow = {
  id: number;
  folder_id: number;
  original_name: string;
  local_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

type ScheduleRow = {
  id: number;
  name: string;
  folder_id: number;
  folder_name?: string;
  weekdays_mask: number;
  start_time: string;
  end_time: string;
  interval_minutes: number;
  is_active: number;
  last_triggered_slot: string | null;
  created_at: string;
  updated_at: string;
};

type ScheduleInput = {
  name: string;
  folder_id: number;
  weekdays: IsoWeekday[];
  start_time: string;
  end_time: string;
  interval_minutes: number;
  is_active: boolean;
};

const DATA_ROOT = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
const UPLOADS_ROOT = path.resolve(DATA_ROOT, 'uploads');
const VIGNETTES_ROOT = path.resolve(UPLOADS_ROOT, 'vignettes');
const TEMP_ROOT = path.resolve(VIGNETTES_ROOT, '.tmp');
const MAX_UPLOAD_FILES = 50;

let schedulerStartTimer: NodeJS.Timeout | null = null;
let schedulerInterval: NodeJS.Timeout | null = null;
let schedulerBroadcast: BroadcastEvent | null = null;

function parsePositiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isUniqueFolderNameError(error: unknown): boolean {
  return error instanceof Error
    && error.message.includes('UNIQUE constraint failed: vignette_folders.name');
}

function toVignetteFile(row: FileRow): VignetteFile {
  return {
    ...row,
    mime_type: 'audio/mpeg',
  };
}

function toVignetteSchedule(row: ScheduleRow): VignetteSchedule {
  return {
    id: row.id,
    name: row.name,
    folder_id: row.folder_id,
    folder_name: row.folder_name,
    weekdays: maskToWeekdays(row.weekdays_mask),
    start_time: row.start_time,
    end_time: row.end_time,
    interval_minutes: row.interval_minutes,
    is_active: row.is_active === 1,
    last_triggered_slot: row.last_triggered_slot,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function listFolders(db: VignetteDatabase): VignetteFolder[] {
  const folders = db.prepare(
    'SELECT id, name, created_at, updated_at FROM vignette_folders ORDER BY name COLLATE NOCASE',
  ).all() as FolderRow[];
  const files = db.prepare(
    'SELECT id, folder_id, original_name, local_path, mime_type, size_bytes, created_at FROM vignette_files ORDER BY original_name COLLATE NOCASE',
  ).all() as FileRow[];
  const filesByFolder = new Map<number, VignetteFile[]>();
  for (const file of files) {
    const current = filesByFolder.get(file.folder_id) ?? [];
    current.push(toVignetteFile(file));
    filesByFolder.set(file.folder_id, current);
  }
  return folders.map((folder) => ({
    ...folder,
    files: filesByFolder.get(folder.id) ?? [],
  }));
}

function listSchedules(db: VignetteDatabase): VignetteSchedule[] {
  const rows = db.prepare(
    'SELECT s.*, f.name AS folder_name FROM vignette_schedules s JOIN vignette_folders f ON f.id = s.folder_id ORDER BY s.name COLLATE NOCASE',
  ).all() as ScheduleRow[];
  return rows.map(toVignetteSchedule);
}

function parseScheduleInput(body: unknown): { value?: ScheduleInput; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Informe os dados do agendamento.' };
  const source = body as Record<string, unknown>;
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  const folderId = parsePositiveId(source.folder_id);
  const weekdays = Array.isArray(source.weekdays)
    ? source.weekdays.map(Number) as IsoWeekday[]
    : [];
  const startTime = typeof source.start_time === 'string' ? source.start_time : '';
  const endTime = typeof source.end_time === 'string' ? source.end_time : '';
  const intervalMinutes = Number(source.interval_minutes);
  const isActive = source.is_active === true || source.is_active === 1;

  if (folderId === null) return { error: 'Selecione uma pasta válida.' };
  const schedule = {
    name,
    folder_id: folderId,
    weekdays,
    start_time: startTime,
    end_time: endTime,
    interval_minutes: intervalMinutes,
    is_active: isActive,
  };
  const scheduleError = validateScheduleWindow(schedule);
  return scheduleError ? { error: scheduleError } : { value: schedule };
}

function validateScheduleRelationships(
  input: ScheduleInput,
  scheduleId: number,
  db: VignetteDatabase,
): { status: 400 | 409; body: Record<string, unknown> } | null {
  const folder = db.prepare('SELECT id FROM vignette_folders WHERE id = ?').get(input.folder_id);
  if (!folder) {
    return { status: 400, body: { error: 'A pasta selecionada não existe.' } };
  }
  if (!input.is_active) return null;

  const fileCount = db.prepare(
    'SELECT COUNT(*) AS count FROM vignette_files WHERE folder_id = ?',
  ).get(input.folder_id) as { count: number };
  if (fileCount.count < 1) {
    return {
      status: 409,
      body: { error: 'Adicione ao menos um MP3 à pasta antes de ativar o agendamento.' },
    };
  }

  const candidate: VignetteSchedule = {
    id: scheduleId,
    ...input,
  };
  const conflict = findScheduleConflict(candidate, listSchedules(db));
  if (!conflict) return null;
  return {
    status: 409,
    body: {
      error: 'Conflito de horário com outro agendamento ativo.',
      conflict,
    },
  };
}

function folderDirectory(folderId: number): string {
  const directory = path.resolve(VIGNETTES_ROOT, String(folderId));
  const prefix = VIGNETTES_ROOT + path.sep;
  if (!directory.startsWith(prefix)) throw new Error('Destino de pasta inválido.');
  return directory;
}

function resolveStoredFile(localPath: string): string | null {
  const absolute = path.resolve(UPLOADS_ROOT, localPath);
  const prefix = UPLOADS_ROOT + path.sep;
  return absolute.startsWith(prefix) ? absolute : null;
}

function removeFileIfPresent(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.error('[VINHETAS] Não foi possível remover arquivo físico:', error);
  }
}

function cleanupUploadedFiles(files: Express.Multer.File[] | undefined): void {
  for (const file of files ?? []) removeFileIfPresent(file.path);
}

function readSignature(filePath: string): Buffer {
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(10);
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
}

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    try {
      fs.mkdirSync(TEMP_ROOT, { recursive: true });
      callback(null, TEMP_ROOT);
    } catch (error) {
      callback(error as Error, TEMP_ROOT);
    }
  },
  filename: (_request, _file, callback) => {
    callback(null, crypto.randomUUID() + '.upload');
  },
});

const uploader = multer({
  storage,
  limits: {
    fileSize: MAX_VIGNETTE_FILE_SIZE,
    files: MAX_UPLOAD_FILES,
  },
});

const receiveVignetteFiles: express.RequestHandler = (request, response, next) => {
  uploader.array('files', MAX_UPLOAD_FILES)(request, response, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    cleanupUploadedFiles(request.files as Express.Multer.File[] | undefined);
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Cada arquivo MP3 pode ter no máximo 50 MB.'
        : 'Não foi possível receber os arquivos: ' + error.message;
      response.status(400).json({ error: message });
      return;
    }
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Falha ao receber os arquivos.',
    });
  });
};

export function setupVignetteRoutes(
  app: express.Express,
  broadcastEvent: BroadcastEvent,
  requireMaster: express.RequestHandler,
  options: VignetteRouteOptions = {},
): void {
  const database = options.database ?? getDb;
  app.get('/api/media/vignette-folders', (_request, response) => {
    try {
      response.json(listFolders(database()));
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'Falha ao listar pastas.' });
    }
  });

  app.post('/api/media/vignette-folders', requireMaster, (request, response) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    if (!name) {
      response.status(400).json({ error: 'Informe o nome da pasta.' });
      return;
    }
    try {
      const result = database().prepare(
        'INSERT INTO vignette_folders (name) VALUES (?)',
      ).run(name);
      broadcastEvent('VIGNETTE_LIBRARY_UPDATED', { action: 'create', id: Number(result.lastInsertRowid) });
      response.status(201).json(listFolders(database()).find((folder) => folder.id === Number(result.lastInsertRowid)));
    } catch (error) {
      if (isUniqueFolderNameError(error)) {
        response.status(409).json({ error: 'Já existe uma pasta com esse nome.' });
        return;
      }
      response.status(500).json({ error: error instanceof Error ? error.message : 'Falha ao criar pasta.' });
    }
  });

  app.put('/api/media/vignette-folders/:id', requireMaster, (request, response) => {
    const id = parsePositiveId(request.params.id);
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    if (id === null || !name) {
      response.status(400).json({ error: 'Informe uma pasta e um nome válidos.' });
      return;
    }
    try {
      const result = database().prepare(
        "UPDATE vignette_folders SET name = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
      ).run(name, id);
      if (result.changes === 0) {
        response.status(404).json({ error: 'Pasta não encontrada.' });
        return;
      }
      broadcastEvent('VIGNETTE_LIBRARY_UPDATED', { action: 'rename', id });
      response.json(listFolders(database()).find((folder) => folder.id === id));
    } catch (error) {
      if (isUniqueFolderNameError(error)) {
        response.status(409).json({ error: 'Já existe uma pasta com esse nome.' });
        return;
      }
      response.status(500).json({ error: error instanceof Error ? error.message : 'Falha ao renomear pasta.' });
    }
  });

  app.delete('/api/media/vignette-folders/:id', requireMaster, (request, response) => {
    const id = parsePositiveId(request.params.id);
    if (id === null) {
      response.status(400).json({ error: 'Pasta inválida.' });
      return;
    }
    try {
      const db = database();
      const reference = db.prepare(
        'SELECT id, name FROM vignette_schedules WHERE folder_id = ? ORDER BY id LIMIT 1',
      ).get(id) as { id: number; name: string } | undefined;
      if (reference) {
        response.status(409).json({
          error: 'A pasta está vinculada ao agendamento "' + reference.name + '". Exclua a regra primeiro.',
        });
        return;
      }
      const result = db.prepare('DELETE FROM vignette_folders WHERE id = ?').run(id);
      if (result.changes === 0) {
        response.status(404).json({ error: 'Pasta não encontrada.' });
        return;
      }
      const directory = folderDirectory(id);
      if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true });
      broadcastEvent('VIGNETTE_LIBRARY_UPDATED', { action: 'delete', id });
      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'Falha ao excluir pasta.' });
    }
  });

  app.post(
    '/api/media/vignette-folders/:id/files',
    requireMaster,
    receiveVignetteFiles,
    (request, response) => {
      const id = parsePositiveId(request.params.id);
      const files = request.files as Express.Multer.File[] | undefined;
      if (id === null) {
        cleanupUploadedFiles(files);
        response.status(400).json({ error: 'Pasta inválida.' });
        return;
      }
      if (!files?.length) {
        response.status(400).json({ error: 'Selecione ao menos um arquivo MP3.' });
        return;
      }

      const db = database();
      const folder = db.prepare('SELECT id FROM vignette_folders WHERE id = ?').get(id);
      if (!folder) {
        cleanupUploadedFiles(files);
        response.status(404).json({ error: 'Pasta não encontrada.' });
        return;
      }

      for (const file of files) {
        const validationError = validateMp3Metadata(file)
          || (hasMp3Signature(readSignature(file.path))
            ? null
            : 'A assinatura binária de "' + file.originalname + '" não corresponde a um MP3 válido.');
        if (validationError) {
          cleanupUploadedFiles(files);
          response.status(400).json({ error: validationError });
          return;
        }
      }

      const movedFiles: Array<{ upload: Express.Multer.File; physical: string; local: string }> = [];
      try {
        const destination = folderDirectory(id);
        fs.mkdirSync(destination, { recursive: true });
        for (const file of files) {
          const physicalName = crypto.randomUUID() + '.mp3';
          const physical = path.join(destination, physicalName);
          fs.renameSync(file.path, physical);
          movedFiles.push({
            upload: file,
            physical,
            local: ['vignettes', String(id), physicalName].join('/'),
          });
        }

        const insert = db.prepare(
          'INSERT INTO vignette_files (folder_id, original_name, local_path, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?)',
        );
        db.transaction(() => {
          for (const file of movedFiles) {
            insert.run(id, file.upload.originalname, file.local, 'audio/mpeg', file.upload.size);
          }
        })();

        broadcastEvent('VIGNETTE_LIBRARY_UPDATED', { action: 'upload', folder_id: id });
        response.status(201).json(listFolders(database()).find((item) => item.id === id));
      } catch (error) {
        cleanupUploadedFiles(files);
        for (const file of movedFiles) removeFileIfPresent(file.physical);
        response.status(500).json({ error: error instanceof Error ? error.message : 'Falha ao salvar os arquivos.' });
      }
    },
  );

  app.delete('/api/media/vignette-files/:id', requireMaster, (request, response) => {
    const id = parsePositiveId(request.params.id);
    if (id === null) {
      response.status(400).json({ error: 'Arquivo inválido.' });
      return;
    }
    try {
      const db = database();
      const file = db.prepare(
        'SELECT id, folder_id, local_path FROM vignette_files WHERE id = ?',
      ).get(id) as Pick<FileRow, 'id' | 'folder_id' | 'local_path'> | undefined;
      if (!file) {
        response.status(404).json({ error: 'Arquivo não encontrado.' });
        return;
      }
      const fileCount = db.prepare(
        'SELECT COUNT(*) AS count FROM vignette_files WHERE folder_id = ?',
      ).get(file.folder_id) as { count: number };
      const activeSchedule = db.prepare(
        'SELECT id, name FROM vignette_schedules WHERE folder_id = ? AND is_active = 1 ORDER BY id LIMIT 1',
      ).get(file.folder_id) as { id: number; name: string } | undefined;
      if (fileCount.count <= 1 && activeSchedule) {
        response.status(409).json({
          error: 'Este é o último MP3 da pasta usada pelo agendamento ativo "' + activeSchedule.name + '".',
        });
        return;
      }
      db.prepare('DELETE FROM vignette_files WHERE id = ?').run(id);
      const physical = resolveStoredFile(file.local_path);
      if (physical) removeFileIfPresent(physical);
      broadcastEvent('VIGNETTE_LIBRARY_UPDATED', { action: 'delete_file', id, folder_id: file.folder_id });
      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'Falha ao excluir arquivo.' });
    }
  });

  app.get('/api/media/vignette-schedules', (_request, response) => {
    try {
      response.json(listSchedules(database()));
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'Falha ao listar agendamentos.' });
    }
  });

  app.post('/api/media/vignette-schedules', requireMaster, (request, response) => {
    const parsed = parseScheduleInput(request.body);
    if (!parsed.value) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const relationshipError = validateScheduleRelationships(parsed.value, 0, database());
    if (relationshipError) {
      response.status(relationshipError.status).json(relationshipError.body);
      return;
    }
    try {
      const input = parsed.value;
      const result = database().prepare(
        'INSERT INTO vignette_schedules (name, folder_id, weekdays_mask, start_time, end_time, interval_minutes, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        input.name,
        input.folder_id,
        weekdaysToMask(input.weekdays),
        input.start_time,
        input.end_time,
        input.interval_minutes,
        input.is_active ? 1 : 0,
      );
      const id = Number(result.lastInsertRowid);
      broadcastEvent('VIGNETTE_SCHEDULES_UPDATED', { action: 'create', id });
      response.status(201).json(listSchedules(database()).find((schedule) => schedule.id === id));
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'Falha ao criar agendamento.' });
    }
  });

  app.put('/api/media/vignette-schedules/:id', requireMaster, (request, response) => {
    const id = parsePositiveId(request.params.id);
    if (id === null) {
      response.status(400).json({ error: 'Agendamento inválido.' });
      return;
    }
    const existing = database().prepare(
      'SELECT id FROM vignette_schedules WHERE id = ?',
    ).get(id);
    if (!existing) {
      response.status(404).json({ error: 'Agendamento não encontrado.' });
      return;
    }
    const parsed = parseScheduleInput(request.body);
    if (!parsed.value) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const relationshipError = validateScheduleRelationships(parsed.value, id, database());
    if (relationshipError) {
      response.status(relationshipError.status).json(relationshipError.body);
      return;
    }
    try {
      const input = parsed.value;
      database().prepare(
        "UPDATE vignette_schedules SET name = ?, folder_id = ?, weekdays_mask = ?, start_time = ?, end_time = ?, interval_minutes = ?, is_active = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
      ).run(
        input.name,
        input.folder_id,
        weekdaysToMask(input.weekdays),
        input.start_time,
        input.end_time,
        input.interval_minutes,
        input.is_active ? 1 : 0,
        id,
      );
      broadcastEvent('VIGNETTE_SCHEDULES_UPDATED', { action: 'update', id });
      response.json(listSchedules(database()).find((schedule) => schedule.id === id));
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'Falha ao atualizar agendamento.' });
    }
  });

  app.delete('/api/media/vignette-schedules/:id', requireMaster, (request, response) => {
    const id = parsePositiveId(request.params.id);
    if (id === null) {
      response.status(400).json({ error: 'Agendamento inválido.' });
      return;
    }
    try {
      const result = database().prepare('DELETE FROM vignette_schedules WHERE id = ?').run(id);
      if (result.changes === 0) {
        response.status(404).json({ error: 'Agendamento não encontrado.' });
        return;
      }
      broadcastEvent('VIGNETTE_SCHEDULES_UPDATED', { action: 'delete', id });
      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'Falha ao excluir agendamento.' });
    }
  });
}

export function evaluateVignetteSchedules(
  broadcastEvent: BroadcastEvent,
  currentDate = new Date(),
  database: VignetteDatabase = getDb(),
): VignetteOccurrence[] {
  const db = database;
  const slotDate = new Date(currentDate);
  slotDate.setSeconds(0, 0);
  const slot = formatLocalScheduleSlot(slotDate);
  const schedules = listSchedules(db).filter((schedule) => isScheduleDue(schedule, slotDate));
  const emitted: VignetteOccurrence[] = [];

  for (const schedule of schedules) {
    const fileRows = db.prepare(
      'SELECT id, folder_id, original_name, local_path FROM vignette_files WHERE folder_id = ? ORDER BY id',
    ).all(schedule.folder_id) as Array<Pick<FileRow, 'id' | 'folder_id' | 'original_name' | 'local_path'>>;
    if (fileRows.length === 0) {
      console.error('[VINHETAS] Agendamento ativo sem MP3:', schedule.id, schedule.name);
      continue;
    }
    const selected = fileRows[crypto.randomInt(fileRows.length)];
    const result = db.prepare(
      "UPDATE vignette_schedules SET last_triggered_slot = ?, updated_at = datetime('now', 'localtime') WHERE id = ? AND (last_triggered_slot IS NULL OR last_triggered_slot <> ?)",
    ).run(slot, schedule.id, slot);
    if (result.changes === 0) continue;

    const occurrence: VignetteOccurrence = {
      occurrence_id: crypto.randomUUID(),
      schedule_id: schedule.id,
      schedule_name: schedule.name,
      folder_id: schedule.folder_id,
      folder_name: schedule.folder_name ?? '',
      file_id: selected.id,
      file_name: selected.original_name,
      file_url: '/uploads/' + selected.local_path.split(path.sep).join('/'),
      scheduled_for: slot,
    };
    broadcastEvent('VINHETA_AGENDADA', occurrence);
    emitted.push(occurrence);
  }
  return emitted;
}

export function startVignetteScheduler(broadcastEvent: BroadcastEvent): void {
  stopVignetteScheduler();
  schedulerBroadcast = broadcastEvent;

  const evaluate = () => {
    if (!schedulerBroadcast) return;
    try {
      evaluateVignetteSchedules(schedulerBroadcast, new Date());
    } catch (error) {
      console.error('[VINHETAS] Falha ao avaliar agendamentos:', error);
    }
  };

  const millisecondsToNextMinute = 60_000 - (Date.now() % 60_000);
  schedulerStartTimer = setTimeout(() => {
    evaluate();
    schedulerInterval = setInterval(evaluate, 60_000);
  }, millisecondsToNextMinute);
}

export function stopVignetteScheduler(): void {
  if (schedulerStartTimer) clearTimeout(schedulerStartTimer);
  if (schedulerInterval) clearInterval(schedulerInterval);
  schedulerStartTimer = null;
  schedulerInterval = null;
  schedulerBroadcast = null;
}
