import type { IsoWeekday, VignetteSchedule } from './types';

export const ISO_WEEKDAYS: ReadonlyArray<{ value: IsoWeekday; short: string; label: string }> = [
  { value: 1, short: 'Seg', label: 'Segunda-feira' },
  { value: 2, short: 'Ter', label: 'Terça-feira' },
  { value: 3, short: 'Qua', label: 'Quarta-feira' },
  { value: 4, short: 'Qui', label: 'Quinta-feira' },
  { value: 5, short: 'Sex', label: 'Sexta-feira' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
  { value: 7, short: 'Dom', label: 'Domingo' },
];

export type VignetteScheduleWindow = Pick<
  VignetteSchedule,
  'id' | 'name' | 'weekdays' | 'start_time' | 'end_time' | 'interval_minutes' | 'is_active'
>;

export type VignetteScheduleConflict = {
  schedule_id: number;
  schedule_name: string;
  weekday: IsoWeekday;
  minute: number;
  time: string;
};

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function timeToMinutes(value: string): number | null {
  if (!TIME_PATTERN.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

export function minutesToTime(value: number): string {
  const safe = Math.max(0, Math.min(1439, Math.trunc(value)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function getScheduleMinutes(
  startTime: string,
  endTime: string,
  intervalMinutes: number,
): number[] {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || end < start) return [];
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) return [];
  const result: number[] = [];
  for (let minute = start; minute <= end; minute += intervalMinutes) result.push(minute);
  return result;
}

export function weekdaysToMask(weekdays: readonly IsoWeekday[]): number {
  return [...new Set(weekdays)].reduce((mask, weekday) => mask | (1 << (weekday - 1)), 0);
}

export function maskToWeekdays(mask: number): IsoWeekday[] {
  return ISO_WEEKDAYS.map(({ value }) => value)
    .filter((weekday) => (mask & (1 << (weekday - 1))) !== 0);
}

export function validateScheduleWindow(
  schedule: Pick<VignetteSchedule, 'name' | 'weekdays' | 'start_time' | 'end_time' | 'interval_minutes'>,
): string | null {
  if (!schedule.name.trim()) return 'Informe um nome para o agendamento.';
  if (schedule.weekdays.length === 0) return 'Selecione ao menos um dia da semana.';
  if (schedule.weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 1 || weekday > 7)) {
    return 'Os dias da semana devem estar entre 1 e 7.';
  }
  const start = timeToMinutes(schedule.start_time);
  const end = timeToMinutes(schedule.end_time);
  if (start === null || end === null) return 'Use horários válidos no formato HH:MM.';
  if (end < start) return 'O horário final deve ser igual ou posterior ao horário inicial.';
  if (!Number.isInteger(schedule.interval_minutes)
    || schedule.interval_minutes < 1
    || schedule.interval_minutes > 1440) {
    return 'O intervalo deve ser um número inteiro entre 1 e 1.440 minutos.';
  }
  return null;
}

export function findScheduleConflict(
  candidate: VignetteScheduleWindow,
  existingSchedules: readonly VignetteScheduleWindow[],
): VignetteScheduleConflict | null {
  if (!candidate.is_active) return null;
  const candidateMinutes = new Set(getScheduleMinutes(
    candidate.start_time,
    candidate.end_time,
    candidate.interval_minutes,
  ));
  for (const existing of existingSchedules) {
    if (!existing.is_active || existing.id === candidate.id) continue;
    const sharedDays = candidate.weekdays.filter((weekday) => existing.weekdays.includes(weekday));
    if (sharedDays.length === 0) continue;
    const collision = getScheduleMinutes(
      existing.start_time,
      existing.end_time,
      existing.interval_minutes,
    ).find((minute) => candidateMinutes.has(minute));
    if (collision !== undefined) {
      return {
        schedule_id: existing.id,
        schedule_name: existing.name,
        weekday: sharedDays[0],
        minute: collision,
        time: minutesToTime(collision),
      };
    }
  }
  return null;
}

export function isoWeekdayFromDate(date: Date): IsoWeekday {
  const day = date.getDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

export function isScheduleDue(
  schedule: Pick<VignetteSchedule, 'weekdays' | 'start_time' | 'end_time' | 'interval_minutes' | 'is_active'>,
  date: Date,
): boolean {
  if (!schedule.is_active || !schedule.weekdays.includes(isoWeekdayFromDate(date))) return false;
  const minute = (date.getHours() * 60) + date.getMinutes();
  return getScheduleMinutes(schedule.start_time, schedule.end_time, schedule.interval_minutes).includes(minute);
}

export function formatLocalScheduleSlot(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function findNextScheduleOccurrence(
  schedule: Pick<VignetteSchedule, 'weekdays' | 'start_time' | 'end_time' | 'interval_minutes' | 'is_active'>,
  from = new Date(),
): Date | null {
  if (!schedule.is_active) return null;
  const times = getScheduleMinutes(schedule.start_time, schedule.end_time, schedule.interval_minutes);
  if (times.length === 0) return null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date(from);
    day.setSeconds(0, 0);
    day.setDate(from.getDate() + offset);
    if (!schedule.weekdays.includes(isoWeekdayFromDate(day))) continue;
    for (const minute of times) {
      const occurrence = new Date(day);
      occurrence.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
      if (occurrence.getTime() >= from.getTime()) return occurrence;
    }
  }
  return null;
}
