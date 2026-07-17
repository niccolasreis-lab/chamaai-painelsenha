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
});

test('aceita somente os quatro modos tipados', () => {
  for (const mode of ['desativado', 'sintetizador', 'mp3', 'ambos']) {
    assert.equal(isTelaoTtsMode(mode), true);
    assert.equal(normalizeTtsMode(mode), mode);
  }
  for (const invalid of ['', 'ativo', 'MP3', null, 1]) {
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

test('gera candidatos MP3 em ordem determinística', () => {
  assert.deepEqual(buildMp3Candidates('http://localhost:3000/', 7, false), [
    'http://localhost:3000/tts/tipo1/Senha_7_1.mp3',
    'http://localhost:3000/tts/tipo3/Senha_7_3.mp3',
  ]);
  assert.equal(
    buildMp3Candidates('http://localhost:3000', '007', false)[0],
    'http://localhost:3000/tts/tipo1/Senha_7_1.mp3',
  );
  assert.deepEqual(buildMp3Candidates('http://localhost:3000', 7, true), [
    'http://localhost:3000/tts/tipo2/Senha_7_2_chamada.mp3',
    'http://localhost:3000/tts/tipo2/Senha_7_2.mp3',
    'http://localhost:3000/tts/tipo1/Senha_7_1.mp3',
  ]);
});

test('som do portal não interfere na decisão de voz do telão', () => {
  const plan = createAudioCallPlan(
    { id: 7, numero: 7, guiche: '2' },
    { telao_tts_modo: 'mp3', portal_som_sua_vez: 'data:audio/mp3;base64,AAA' },
    'http://localhost:3000',
  );

  assert.equal(plan.mode, 'mp3');
  assert.equal(plan.mp3Candidates.length, 2);
});

test('aguarda campainha e tenta MP3 na ordem até o primeiro sucesso', async () => {
  const events: string[] = [];
  const plan = createAudioCallPlan(
    { id: 7, numero: 7, guiche: '2' },
    { telao_tts_modo: 'mp3' },
    'http://localhost:3000',
  );

  const outcome = await executeAudioCall(plan, {
    playChime: async () => {
      events.push('chime');
      return 'completed';
    },
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
  assert.deepEqual(events, ['chime', 'tipo1', 'tipo3']);
});

test('modo ambos usa sintetizador apenas depois de todos os MP3 falharem', async () => {
  const events: string[] = [];
  const phases: AudioCallPhase[] = [];
  const plan = createAudioCallPlan(
    { id: 7, numero: 7, guiche: '2' },
    { telao_tts_modo: 'ambos' },
    'http://localhost:3000',
  );

  const outcome = await executeAudioCall(plan, {
    playChime: async () => {
      events.push('chime');
      return 'completed';
    },
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

  assert.equal(outcome, 'synth_completed');
  assert.deepEqual(events, ['chime', 'tipo1', 'tipo3', 'synth']);
  assert.ok(phases.indexOf('synth_fallback') > phases.lastIndexOf('mp3_error'));
});

test('uma sequência obsoleta não executa fallbacks', async () => {
  let current = true;
  let mp3Calls = 0;
  let synthCalls = 0;
  const plan = createAudioCallPlan(
    { id: 7, numero: 7, guiche: '2' },
    { telao_tts_modo: 'ambos' },
    'http://localhost:3000',
  );

  const outcome = await executeAudioCall(plan, {
    playChime: async () => {
      current = false;
      return 'interrupted';
    },
    playMp3: async () => {
      mp3Calls += 1;
      return 'completed';
    },
    speak: async () => {
      synthCalls += 1;
      return 'completed';
    },
    isCurrent: () => current,
  });

  assert.equal(outcome, 'interrupted');
  assert.equal(mp3Calls, 0);
  assert.equal(synthCalls, 0);
});
