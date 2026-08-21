import assert from 'node:assert/strict';
import test from 'node:test';
import { formatGuiche, operatorFeedback, pendingActionLabel, validateRecoveredAction } from '../src/operador/operatorState';

test('normalizes operator and server guiche labels to one format', () => {
  assert.equal(formatGuiche('1'), 'Guichê 1');
  assert.equal(formatGuiche('Guichê 1'), 'Guichê 1');
  assert.equal(formatGuiche('Balcão: 2'), 'Guichê 2');
});

test('revalidates one queued action against the authoritative recovered snapshot', () => {
  assert.equal(validateRecoveredAction('proximo', { waitingCount: 0, hasActiveTicket: true }), 'Nenhuma pessoa aguardando.');
  assert.equal(validateRecoveredAction('repetir', { waitingCount: 3, hasActiveTicket: false }), 'Nenhuma senha em atendimento para repetir.');
  assert.equal(validateRecoveredAction('devolver', { waitingCount: 0, hasActiveTicket: true }), null);
  assert.equal(pendingActionLabel('proximo'), 'Chamar próximo');
});

test('explains actions that have no valid target without hiding them', () => {
  assert.equal(operatorFeedback('proximo', false, 0), 'Nenhuma pessoa aguardando.');
  assert.equal(operatorFeedback('repetir', false, 4), 'Nenhuma senha em atendimento para repetir.');
  assert.equal(operatorFeedback('devolver', false, 4), 'Nenhuma senha em atendimento para devolver.');
  assert.equal(operatorFeedback('proximo', true, 1), null);
  assert.equal(operatorFeedback('repetir', true, 0), null);
});
