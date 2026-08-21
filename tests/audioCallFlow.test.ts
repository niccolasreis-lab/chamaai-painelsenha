import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  buildMp3Candidates,
  buildSpeechText,
  createAudioCallPlan,
  executeAudioCall,
  formatTicketForSpeech,
  type AudioCallPhase,
} from '../src/telao/audioCallFlow';
import { isTelaoTtsMode, normalizeTtsMode } from '../src/shared/ttsMode';
import { TELAO_TTS_MODE_MIGRATION_SQL } from '../electron/services/tts-mode-migration';

function migrateLegacyTtsMode(legacyValue: string, existingMode?: string): string {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );
  `);
  const insert = db.prepare('INSERT INTO configuracoes VALUES (?, ?, datetime(\'now\'))');
  insert.run('telao_tts_ativo', legacyValue);
  if (existingMode) insert.run('telao_tts_modo', existingMode);
  db.exec(TELAO_TTS_MODE_MIGRATION_SQL);
  const row = db.prepare(
    'SELECT valor FROM configuracoes WHERE chave = \'telao_tts_modo\'',
  ).get() as { valor: string };
  db.close();
  return row.valor;
}

test('migração cria o modo sem sobrescrever configurações existentes', () => {
  assert.equal(migrateLegacyTtsMode('1'), 'sintetizador');
  assert.equal(migrateLegacyTtsMode('0'), 'desativado');
  assert.equal(migrateLegacyTtsMode('1', 'mp3'), 'mp3');
  assert.equal(migrateLegacyTtsMode('1', 'ambos'), 'mp3');
});

test('aceita somente os três modos tipados e rejeita o legado ambos', () => {
  for (const mode of ['desativado', 'sintetizador', 'mp3']) {
    assert.equal(isTelaoTtsMode(mode), true);
    assert.equal(normalizeTtsMode(mode), mode);
  }
  for (const invalid of ['', 'ativo', 'ambos', 'MP3', null, 1]) {
    assert.equal(isTelaoTtsMode(invalid), false);
    assert.equal(normalizeTtsMode(invalid), 'desativado');
  }
});

test('formata a senha para leitura dígito a dígito', () => {
  assert.equal(formatTicketForSpeech('A', 7), 'A, zero zero sete');
  assert.equal(formatTicketForSpeech('PX', 42), 'P, X, zero quatro dois');
});

test('aplica o formato falado dentro do template', () => {
  const text = buildSpeechText(
    {
      id: 7,
      numero: 7,
      prefixo_senha: 'A',
      guiche: 'Guichê 2',
      balcao_nome: 'Balcão central',
    },
    { telao_tts_template: 'Senha {senha}, vá ao {guiche}.' },
  );

  assert.equal(text, 'Senha A, zero zero sete, vá ao Guichê 2.');
});

test('gera candidatos MP3 versionados em ordem determinística', () => {
  assert.deepEqual(buildMp3Candidates('http://localhost:3000/', 7, false, 'rev 2'), [
    'http://localhost:3000/tts/tipo1/Senha_7_1.mp3?v=rev%202',
    'http://localhost:3000/tts/tipo3/Senha_7_3.mp3?v=rev%202',
  ]);
  assert.equal(
    buildMp3Candidates('http://localhost:3000', '007', false, 'next')[0],
    'http://localhost:3000/tts/tipo1/Senha_7_1.mp3?v=next',
  );
  assert.deepEqual(buildMp3Candidates('http://localhost:3000', 7, true, 'r1'), [
    'http://localhost:3000/tts/tipo2/Senha_7_2_chamada.mp3?v=r1',
    'http://localhost:3000/tts/tipo2/Senha_7_2.mp3?v=r1',
    'http://localhost:3000/tts/tipo1/Senha_7_1.mp3?v=r1',
  ]);
});

test('uma nova revisão altera todas as URLs mesmo quando os nomes dos MP3 não mudam', () => {
  const before = buildMp3Candidates('http://localhost:3000', 7, false, 'revision-a');
  const after = buildMp3Candidates('http://localhost:3000', 7, false, 'revision-b');

  assert.deepEqual(before.map((url) => url.split('?')[0]), after.map((url) => url.split('?')[0]));
  assert.notDeepEqual(before, after);
});

test('som do portal não interfere na decisão de voz do telão', () => {
  const plan = createAudioCallPlan(
    { id: 7, numero: 7, guiche: '2' },
    {
      telao_tts_modo: 'mp3',
      telao_tts_revision: 'server-revision',
      portal_som_sua_vez: 'data:audio/mp3;base64,AAA',
    },
    'http://localhost:3000',
  );

  assert.equal(plan.mode, 'mp3');
  assert.equal(plan.mp3Candidates.length, 2);
  assert.ok(plan.mp3Candidates.every((url) => url.endsWith('?v=server-revision')));
});

test('o plano de chamada não contém campainha nem usa configurações de som legado', () => {
  const plan = createAudioCallPlan(
    { id: 7, numero: 7, guiche: '2' },
    {
      telao_tts_modo: 'mp3',
      tipo_som: 'custom',
      som_personalizado: '/uploads/campainha.mp3',
    },
    'http://localhost:3000',
  );

  assert.deepEqual(Object.keys(plan).sort(), ['mode', 'mp3Candidates']);
  assert.equal('chime' in plan, false);
});

test('modo sintetizador não gera candidatos MP3', () => {
  const plan = createAudioCallPlan(
    { id: 7, numero: 7, guiche: '2' },
    { telao_tts_modo: 'sintetizador', telao_tts_revision: 'ignored' },
    'http://localhost:3000/',
  );

  assert.equal(plan.mode, 'sintetizador');
  assert.deepEqual(plan.mp3Candidates, []);
});

test('modo MP3 tenta os candidatos na ordem até o primeiro sucesso sem sintetizar', async () => {
  const events: string[] = [];
  const plan = createAudioCallPlan(
    { id: 7, numero: 7, guiche: '2' },
    { telao_tts_modo: 'mp3' },
    'http://localhost:3000',
  );

  const outcome = await executeAudioCall(plan, {
    playMp3: async (url) => {
      events.push(url.includes('tipo1') ? 'tipo1' : 'tipo3');
      if (url.includes('tipo1')) throw new Error('arquivo ausente');
      return 'completed';
    },
    speak: async () => {
      events.push('synth');
      return 'completed';
    },
    isCurrent: () => true,
  });

  assert.equal(outcome, 'mp3_completed');
  assert.deepEqual(events, ['tipo1', 'tipo3']);
});

test('modo MP3 indisponível termina em silêncio sem fallback para sintetizador', async () => {
  const events: string[] = [];
  const phases: AudioCallPhase[] = [];
  const plan = createAudioCallPlan(
    { id: 7, numero: 7, guiche: '2' },
    { telao_tts_modo: 'mp3' },
    'http://localhost:3000',
  );

  const outcome = await executeAudioCall(plan, {
    playMp3: async (url) => {
      events.push(url.includes('tipo1') ? 'tipo1' : 'tipo3');
      throw new Error('arquivo ausente');
    },
    speak: async () => {
      events.push('synth');
      return 'completed';
    },
    isCurrent: () => true,
    onPhase: (phase) => phases.push(phase),
  });

  assert.equal(outcome, 'voice_unavailable');
  assert.deepEqual(events, ['tipo1', 'tipo3']);
  assert.equal(phases.filter((phase) => phase === 'mp3_error').length, 2);
  assert.equal(phases.includes('synth_start'), false);
});

test('modo sintetizador é exclusivo e nunca solicita MP3', async () => {
  let mp3Calls = 0;
  let synthCalls = 0;
  const plan = createAudioCallPlan(
    { id: 7, numero: 7, guiche: '2' },
    { telao_tts_modo: 'sintetizador' },
    'http://localhost:3000',
  );

  const outcome = await executeAudioCall(plan, {
    playMp3: async () => {
      mp3Calls += 1;
      return 'completed';
    },
    speak: async () => {
      synthCalls += 1;
      return 'completed';
    },
    isCurrent: () => true,
  });

  assert.equal(outcome, 'synth_completed');
  assert.equal(mp3Calls, 0);
  assert.equal(synthCalls, 1);
});

test('uma sequência obsoleta interrompe o MP3 e não tenta o próximo candidato', async () => {
  let current = true;
  let mp3Calls = 0;
  let synthCalls = 0;
  const plan = createAudioCallPlan(
    { id: 7, numero: 7, guiche: '2' },
    { telao_tts_modo: 'mp3' },
    'http://localhost:3000',
  );

  const outcome = await executeAudioCall(plan, {
    playMp3: async () => {
      mp3Calls += 1;
      current = false;
      return 'interrupted';
    },
    speak: async () => {
      synthCalls += 1;
      return 'completed';
    },
    isCurrent: () => current,
  });

  assert.equal(outcome, 'interrupted');
  assert.equal(mp3Calls, 1);
  assert.equal(synthCalls, 0);
});

test('modo desativado não executa nenhum mecanismo de áudio', async () => {
  let calls = 0;
  const plan = createAudioCallPlan(
    { id: 7, numero: 7, guiche: '2' },
    { telao_tts_modo: 'desativado' },
    'http://localhost:3000',
  );

  const outcome = await executeAudioCall(plan, {
    playMp3: async () => {
      calls += 1;
      return 'completed';
    },
    speak: async () => {
      calls += 1;
      return 'completed';
    },
    isCurrent: () => true,
  });

  assert.equal(outcome, 'voice_disabled');
  assert.equal(calls, 0);
});
