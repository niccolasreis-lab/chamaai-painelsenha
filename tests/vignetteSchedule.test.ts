import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findNextScheduleOccurrence,
  findScheduleConflict,
  formatLocalScheduleSlot,
  getScheduleMinutes,
  isScheduleDue,
  maskToWeekdays,
  minutesToTime,
  validateScheduleWindow,
  weekdaysToMask,
} from '../src/shared/vignetteSchedule';
import type { VignetteSchedule } from '../src/shared/types';
import {
  hasMp3Signature,
  MAX_VIGNETTE_FILE_SIZE,
  validateMp3File,
  validateMp3Metadata,
} from '../server/services/vignette-file-validation';

function schedule(overrides: Partial<VignetteSchedule> = {}): VignetteSchedule {
  return {
    id: 1,
    name: 'Expediente',
    folder_id: 10,
    weekdays: [1, 2, 3, 4, 5],
    start_time: '17:20',
    end_time: '18:00',
    interval_minutes: 5,
    is_active: true,
    ...overrides,
  };
}

test('janela 17:20–18:00 a cada 5 minutos possui nove ocorrências e fim inclusivo', () => {
  const minutes = getScheduleMinutes('17:20', '18:00', 5);
  assert.equal(minutes.length, 9);
  assert.deepEqual(minutes.map(minutesToTime), [
    '17:20',
    '17:25',
    '17:30',
    '17:35',
    '17:40',
    '17:45',
    '17:50',
    '17:55',
    '18:00',
  ]);
});

test('fim igual ao início gera um único disparo', () => {
  assert.deepEqual(getScheduleMinutes('09:15', '09:15', 30), [555]);
});

test('máscara preserva dias úteis, fim de semana e dias alternados', () => {
  for (const days of [
    [1, 2, 3, 4, 5],
    [6, 7],
    [1, 3, 5, 7],
  ] as const) {
    assert.deepEqual(maskToWeekdays(weekdaysToMask(days)), days);
  }
});

test('validação rejeita janela noturna, horário inválido e intervalo fora do limite', () => {
  assert.match(
    validateScheduleWindow(schedule({ start_time: '23:00', end_time: '01:00' })) ?? '',
    /final/i,
  );
  assert.match(
    validateScheduleWindow(schedule({ start_time: '25:00' })) ?? '',
    /HH:MM/i,
  );
  assert.match(
    validateScheduleWindow(schedule({ interval_minutes: 0 })) ?? '',
    /1\.440/i,
  );
  assert.match(
    validateScheduleWindow(schedule({ interval_minutes: 1441 })) ?? '',
    /1\.440/i,
  );
});

test('conflito exige simultaneamente um dia e um minuto compartilhados', () => {
  const candidate = schedule({ id: 10, weekdays: [1], start_time: '17:20', end_time: '18:00' });
  const differentDay = schedule({
    id: 11,
    name: 'Outro dia',
    weekdays: [2],
    start_time: '17:20',
    end_time: '18:00',
  });
  const differentSequence = schedule({
    id: 12,
    name: 'Sequência deslocada',
    weekdays: [1],
    start_time: '17:22',
    end_time: '17:57',
    interval_minutes: 5,
  });
  assert.equal(findScheduleConflict(candidate, [differentDay, differentSequence]), null);

  const collision = schedule({
    id: 13,
    name: 'Propaganda',
    weekdays: [1, 3],
    start_time: '17:25',
    end_time: '18:00',
    interval_minutes: 10,
  });
  assert.deepEqual(findScheduleConflict(candidate, [collision]), {
    schedule_id: 13,
    schedule_name: 'Propaganda',
    weekday: 1,
    minute: 1045,
    time: '17:25',
  });
});

test('regras inativas não entram em conflito até serem ativadas', () => {
  const candidate = schedule({ id: 10, is_active: false });
  assert.equal(findScheduleConflict(candidate, [schedule({ id: 11 })]), null);
});

test('avalia o relógio local por dia ISO e minuto ancorado no início', () => {
  const mondayAtStart = new Date(2026, 6, 20, 17, 20, 59);
  const mondayOffCadence = new Date(2026, 6, 20, 17, 23, 0);
  const sundayAtStart = new Date(2026, 6, 19, 17, 20, 0);
  assert.equal(isScheduleDue(schedule(), mondayAtStart), true);
  assert.equal(isScheduleDue(schedule(), mondayOffCadence), false);
  assert.equal(isScheduleDue(schedule(), sundayAtStart), false);
  assert.equal(formatLocalScheduleSlot(mondayAtStart), '2026-07-20T17:20');
});

test('calcula o próximo disparo sem ultrapassar a semana seguinte', () => {
  const next = findNextScheduleOccurrence(
    schedule({ weekdays: [1], start_time: '17:20', end_time: '17:30', interval_minutes: 5 }),
    new Date(2026, 6, 20, 17, 21, 0),
  );
  assert.ok(next);
  assert.equal(formatLocalScheduleSlot(next), '2026-07-20T17:25');
});

test('validador MP3 exige extensão, MIME, tamanho e assinatura binária', () => {
  assert.equal(hasMp3Signature(Buffer.from('ID3data')), true);
  assert.equal(hasMp3Signature(Buffer.from([0xff, 0xfb, 0x90, 0x64])), true);
  assert.equal(hasMp3Signature(Buffer.from('not-mp3')), false);

  const valid = {
    originalname: 'vinheta.mp3',
    mimetype: 'audio/mpeg',
    size: 7,
    buffer: Buffer.from('ID3data'),
  };
  assert.equal(validateMp3File(valid), null);
  assert.match(validateMp3File({ ...valid, originalname: 'vinheta.wav' }) ?? '', /\.mp3/i);
  assert.match(validateMp3File({ ...valid, mimetype: 'audio/wav' }) ?? '', /tipo/i);
  assert.match(validateMp3File({ ...valid, buffer: Buffer.from('invalid') }) ?? '', /assinatura/i);
  assert.match(
    validateMp3Metadata({ ...valid, size: MAX_VIGNETTE_FILE_SIZE + 1 }) ?? '',
    /50 MB/i,
  );
});
