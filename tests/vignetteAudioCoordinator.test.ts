import assert from 'node:assert/strict';
import test from 'node:test';
import type { VignetteOccurrence } from '../src/shared/types';
import type { PlaybackResult } from '../src/telao/audioCallFlow';
import { VignetteAudioCoordinator } from '../src/telao/vignetteAudioCoordinator';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function occurrence(
  scheduleId: number,
  scheduledFor = '2026-07-20T17:20',
): VignetteOccurrence {
  return {
    occurrence_id: 'occ-' + scheduleId + '-' + scheduledFor,
    schedule_id: scheduleId,
    schedule_name: 'Regra ' + scheduleId,
    folder_id: scheduleId,
    folder_name: 'Pasta ' + scheduleId,
    file_id: scheduleId,
    file_name: 'vinheta.mp3',
    file_url: '/uploads/vignettes/' + scheduleId + '/vinheta.mp3',
    scheduled_for: scheduledFor,
  };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test('vinheta recebida em estado ocioso toca imediatamente e retorna a idle', async () => {
  const played: number[] = [];
  const states: string[] = [];
  const coordinator = new VignetteAudioCoordinator({
    playVignette: async (item) => {
      played.push(item.schedule_id);
      return 'completed';
    },
    interruptAudio: () => undefined,
    onStateChange: (state) => states.push(state),
  });

  assert.equal(coordinator.enqueue(occurrence(1)), true);
  await flush();

  assert.deepEqual(played, [1]);
  assert.equal(coordinator.getState(), 'idle');
  assert.deepEqual(states, ['vignette_playing', 'idle']);
});

test('chamada interrompe a vinheta, preserva TTS e reinicia a vinheta do começo', async () => {
  const playAttempts: number[] = [];
  const playbackGates: Array<Deferred<PlaybackResult>> = [];
  let activePlayback: Deferred<PlaybackResult> | null = null;
  const coordinator = new VignetteAudioCoordinator({
    playVignette: (item) => {
      playAttempts.push(item.schedule_id);
      const gate = deferred<PlaybackResult>();
      playbackGates.push(gate);
      activePlayback = gate;
      return gate.promise;
    },
    interruptAudio: () => {
      activePlayback?.resolve('interrupted');
      activePlayback = null;
    },
  });

  coordinator.enqueue(occurrence(1));
  assert.deepEqual(playAttempts, [1]);

  const callGate = deferred<void>();
  const callPromise = coordinator.startCall(() => callGate.promise);
  assert.equal(coordinator.getState(), 'call_playing');
  assert.deepEqual(coordinator.getPending().map((item) => item.schedule_id), [1]);
  assert.equal(coordinator.enqueue(occurrence(1, '2026-07-20T17:25')), false);

  callGate.resolve();
  await callPromise;
  await flush();

  assert.deepEqual(playAttempts, [1, 1]);
  assert.equal(coordinator.getState(), 'vignette_playing');
  playbackGates[1].resolve('completed');
  await flush();
  assert.equal(coordinator.getState(), 'idle');
});

test('vinhetas recebidas durante campainha, MP3 e sintetizador aguardam a chamada completa', async () => {
  const played: number[] = [];
  const chime = deferred<void>();
  const mp3 = deferred<void>();
  const synth = deferred<void>();
  let phase = 'chime';
  const coordinator = new VignetteAudioCoordinator({
    playVignette: async (item) => {
      played.push(item.schedule_id);
      return 'completed';
    },
    interruptAudio: () => undefined,
  });

  const callPromise = coordinator.startCall(async () => {
    await chime.promise;
    phase = 'mp3';
    await mp3.promise;
    phase = 'synth';
    await synth.promise;
  });

  assert.equal(phase, 'chime');
  coordinator.enqueue(occurrence(1));
  assert.deepEqual(played, []);

  chime.resolve();
  await flush();
  assert.equal(phase, 'mp3');
  coordinator.enqueue(occurrence(2, '2026-07-20T17:21'));
  assert.deepEqual(played, []);

  mp3.resolve();
  await flush();
  assert.equal(phase, 'synth');
  coordinator.enqueue(occurrence(3, '2026-07-20T17:22'));
  assert.deepEqual(played, []);

  synth.resolve();
  await callPromise;
  await flush();
  assert.deepEqual(played, [1, 2, 3]);
});

test('chamadas consecutivas não drenam vinheta entre uma chamada e outra', async () => {
  const played: number[] = [];
  const firstCall = deferred<void>();
  const secondCall = deferred<void>();
  const coordinator = new VignetteAudioCoordinator({
    playVignette: async (item) => {
      played.push(item.schedule_id);
      return 'completed';
    },
    interruptAudio: () => undefined,
  });

  const firstPromise = coordinator.startCall(() => firstCall.promise);
  coordinator.enqueue(occurrence(1));
  const secondPromise = coordinator.startCall(() => secondCall.promise);

  firstCall.resolve();
  await firstPromise;
  await flush();
  assert.equal(coordinator.getState(), 'call_playing');
  assert.deepEqual(played, []);

  secondCall.resolve();
  await secondPromise;
  await flush();
  assert.deepEqual(played, [1]);
  assert.equal(coordinator.getState(), 'idle');
});

test('fila mantém uma ocorrência por regra, preserva a mais antiga e ordena regras diferentes', async () => {
  const played: string[] = [];
  const callGate = deferred<void>();
  const coordinator = new VignetteAudioCoordinator({
    playVignette: async (item) => {
      played.push(item.occurrence_id);
      return 'completed';
    },
    interruptAudio: () => undefined,
  });

  const callPromise = coordinator.startCall(() => callGate.promise);
  coordinator.enqueue(occurrence(2, '2026-07-20T17:30'));
  coordinator.enqueue(occurrence(1, '2026-07-20T17:25'));
  assert.equal(coordinator.enqueue(occurrence(1, '2026-07-20T17:35')), false);
  assert.equal(coordinator.enqueue(occurrence(2, '2026-07-20T17:20')), true);

  assert.deepEqual(
    coordinator.getPending().map((item) => [item.schedule_id, item.scheduled_for]),
    [
      [2, '2026-07-20T17:20'],
      [1, '2026-07-20T17:25'],
    ],
  );

  callGate.resolve();
  await callPromise;
  await flush();
  assert.deepEqual(played, [
    occurrence(2, '2026-07-20T17:20').occurrence_id,
    occurrence(1, '2026-07-20T17:25').occurrence_id,
  ]);
});

test('pendência antiga continua válida depois do fim da janela', async () => {
  const played: string[] = [];
  const callGate = deferred<void>();
  const coordinator = new VignetteAudioCoordinator({
    playVignette: async (item) => {
      played.push(item.scheduled_for);
      return 'completed';
    },
    interruptAudio: () => undefined,
  });

  const callPromise = coordinator.startCall(() => callGate.promise);
  coordinator.enqueue(occurrence(1, '2026-07-20T08:00'));
  callGate.resolve();
  await callPromise;
  await flush();

  assert.deepEqual(played, ['2026-07-20T08:00']);
});
